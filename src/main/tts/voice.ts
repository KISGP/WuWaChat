import { rm } from 'fs/promises'
import { getCharacterSummaryById } from '@main/characters'
import { downloadFiles } from '@main/download'
import { createGithubRequestContext } from '@main/download/github'
import { AppError } from '@main/errors/AppError'
import { logger } from '@main/logging'
import {
  getCharacterTtsVoicePath,
  getCharactersRoot,
  getTtsAudioRoot,
  pathExists
} from '@main/utils'
import { getRemoteCharacterFileUrl } from '@main/characters/remote-client'
import type { TtsCharacterVoiceStatus } from '@shared/tts'

const TTS_VOICE_FILE_NAME = 'TTS.wav'

/**
 * @description 校验来自 IPC 的角色标识可安全用于固定音色文件路径。
 * @param characterId 待查询或下载音色的角色标识。
 */
function validateCharacterId(characterId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(characterId)) {
    throw new AppError('TTS_RUNTIME_ERROR', 'Invalid TTS voice character identifier', {
      safeMessage: '角色音色请求无效。'
    })
  }
}

/**
 * @description 返回一个本地角色的 index-tts 音色下载状态。
 * @param characterId 已安装角色的标识。
 * @returns 当前固定参考音色文件是否存在。
 */
export async function getCharacterTtsVoiceStatus(
  characterId: string
): Promise<TtsCharacterVoiceStatus> {
  validateCharacterId(characterId)
  await getCharacterSummaryById(characterId)
  return { characterId, isDownloaded: await pathExists(getCharacterTtsVoicePath(characterId)) }
}

/**
 * @description 下载或重新下载角色的固定 index-tts 参考音色，并清空旧生成音频缓存。
 * @param characterId 已安装角色的标识。
 * @returns 下载完成后的音色状态。
 * @remarks 远端文件不存在时会报告该角色暂无可用音色。
 */
export async function downloadCharacterTtsVoice(
  characterId: string
): Promise<TtsCharacterVoiceStatus> {
  validateCharacterId(characterId)
  await getCharacterSummaryById(characterId)
  const context = await createGithubRequestContext()

  try {
    await downloadFiles(
      [
        {
          path: characterId + '/' + TTS_VOICE_FILE_NAME,
          url: getRemoteCharacterFileUrl(characterId, TTS_VOICE_FILE_NAME, context)
        }
      ],
      getCharactersRoot(),
      { maxFileBytes: 40 * 1024 * 1024 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logger.warn(
      'tts',
      'tts-voice-download-failed',
      'Failed to download character TTS voice',
      {
        characterId,
        error: message
      }
    )
    throw new AppError('TTS_RUNTIME_ERROR', 'Failed to download character TTS voice', {
      cause: error,
      safeMessage: message.includes('404')
        ? '该角色暂未提供 index-tts 音色。'
        : '角色音色下载失败，请检查网络后重试。'
    })
  }

  try {
    await rm(getTtsAudioRoot(), { recursive: true, force: true })
  } catch (error) {
    await logger.warn(
      'tts',
      'tts-cache-clear-failed',
      'Failed to clear TTS cache after voice download',
      {
        characterId,
        error: error instanceof Error ? error.message : String(error)
      }
    )
  }

  await logger.info('tts', 'tts-voice-downloaded', 'Downloaded character TTS voice', {
    characterId
  })
  return { characterId, isDownloaded: true }
}
