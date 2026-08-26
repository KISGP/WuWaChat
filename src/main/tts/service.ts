import { type ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { net } from 'electron'
import { mkdir, rename, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import type { TtsConnectionTestResult, TtsSynthesisRequest, TtsSynthesisResult } from '@shared/tts'
import { AppError } from '@main/errors/AppError'
import { logger } from '@main/logging'
import { getCharacterTtsVoicePath, getTtsAudioRoot } from '@main/utils'
import { getAppSettings } from '@main/settings/app-settings'
import { resolveFishCharacterReferenceId } from '@shared/tts/fish-audio'
import { getTtsAudioUrl } from './protocol'
import { normalizeTextForTts } from './text-normalizer'
import { createLocalTtsEngine } from './local'

const TTS_PROFILE_VERSION = 'index-tts-v1'
const FISH_TTS_ENDPOINT = 'https://api.fish.audio/v1/tts'
const MAX_TTS_TEXT_LENGTH = 500

type AudioExtension = 'mp3' | 'wav'
type ActiveSynthesis = {
  requestId: string
  child: ChildProcess | null
  controller: AbortController
  cancelled: boolean
}

/** @description 校验来自渲染进程的 TTS 合成请求。 */
function validateSynthesisRequest(request: TtsSynthesisRequest): string {
  const text = request.text.trim()
  if (!request.requestId.trim() || !request.messageId.trim() || !request.characterId.trim()) {
    throw new AppError('TTS_RUNTIME_ERROR', 'TTS synthesis request is missing identifiers', {
      safeMessage: '语音请求无效，请重试。'
    })
  }
  if (!text) {
    throw new AppError('TTS_RUNTIME_ERROR', 'TTS synthesis request contains empty text', {
      safeMessage: '没有可合成的文本。'
    })
  }
  if (text.length > MAX_TTS_TEXT_LENGTH) {
    throw new AppError(
      'TTS_RUNTIME_ERROR',
      `TTS synthesis text exceeds ${MAX_TTS_TEXT_LENGTH} characters`,
      {
        safeMessage: `单次语音合成不能超过 ${MAX_TTS_TEXT_LENGTH} 个字符。`
      }
    )
  }
  return text
}

/**
 * @description 为 provider、音色、模型和输入文本生成稳定的缓存文件名。
 * @param text 已规范化的待合成文本。
 * @param provider TTS provider 标识。
 * @param model 当前 provider 的模型标识。
 * @param referenceId 当前 provider 的音色标识。
 * @param extension 缓存音频扩展名。
 * @returns 不含目录的缓存文件名。
 */
function createCacheFileName(
  text: string,
  provider: string,
  model: string,
  referenceId: string,
  extension: AudioExtension
): string {
  const cacheKey = [provider, model, referenceId, TTS_PROFILE_VERSION, text].join('\n')
  return `${createHash('sha256').update(cacheKey).digest('hex')}.${extension}`
}

/**
 * @description 判断候选路径是否为非空的音频缓存文件。
 * @param filePath 候选音频文件路径。
 * @param minimumSize 最小有效文件大小。
 * @returns 文件存在且超过最小长度时返回 true。
 */
async function isUsableAudio(filePath: string, minimumSize: number): Promise<boolean> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile() && fileStat.size > minimumSize
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      await logger.warn('tts', 'tts-cache-stat-failed', 'Failed to inspect cached TTS audio', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    return false
  }
}

/**
 * @description 调用 Fish Audio HTTP TTS 端点并将返回的 MP3 写入临时文件。
 * @param apiKey Fish Audio API Key。
 * @param model Fish Audio TTS 模型标识。
 * @param referenceId Fish Audio 音色模型标识。
 * @param text 已规范化的待合成文本。
 * @param outputPath 要写入的临时音频路径。
 * @param controller 用于取消 HTTP 请求的控制器。
 * @returns 成功时临时文件已完整写入。
 */
async function runFishAudio(
  apiKey: string,
  model: string,
  referenceId: string,
  text: string,
  outputPath: string,
  controller: AbortController
): Promise<void> {
  let response: Response
  try {
    response = await net.fetch(FISH_TTS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', model },
      body: JSON.stringify({
        text,
        reference_id: referenceId,
        format: 'mp3',
        latency: 'balanced',
        normalize: true
      }),
      signal: controller.signal
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError('TTS_RUNTIME_ERROR', 'Fish Audio synthesis was cancelled', {
        safeMessage: '已停止语音合成。',
        cause: error
      })
    }
    throw new AppError('NETWORK_ERROR', 'Failed to reach Fish Audio TTS endpoint', {
      safeMessage: '无法连接在线语音服务，请检查网络连接。',
      cause: error
    })
  }
  if (!response.ok) {
    throw new AppError('TTS_RUNTIME_ERROR', `Fish Audio returned HTTP ${response.status}`, {
      details: { status: response.status, statusText: response.statusText },
      safeMessage:
        response.status === 402
          ? 'Fish Audio 当前模型需要可用额度。请充值，或在设置中选择 s2.1-pro-free。'
          : '在线语音服务拒绝了请求，请检查 API Key、模型和音色设置。'
    })
  }
  if (controller.signal.aborted) {
    throw new AppError('TTS_RUNTIME_ERROR', 'Fish Audio synthesis was cancelled', {
      safeMessage: '已停止语音合成。'
    })
  }
  try {
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError('TTS_RUNTIME_ERROR', 'Fish Audio synthesis was cancelled', {
        safeMessage: '已停止语音合成。',
        cause: error
      })
    }
    throw new AppError('NETWORK_ERROR', 'Failed to read Fish Audio response body', {
      safeMessage: '在线语音服务响应中断，请重试。',
      cause: error
    })
  }
}

/**
 * @description 管理本地引擎和 Fish Audio 合成、缓存与取消操作。
 * @remarks 服务进程范围内只允许一个合成任务。
 */
class TtsService {
  private active: ActiveSynthesis | null = null

  /**
   * @description 根据当前 provider 合成文本并返回可播放音频地址。
   * @param request 来自受控 IPC 的消息合成请求。
   * @returns 已生成或命中缓存的音频地址。
   */
  async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const requestedText = validateSynthesisRequest(request)
    const { text, replacementCount } = normalizeTextForTts(requestedText)
    if (this.active) {
      throw new AppError('TTS_RUNTIME_ERROR', 'A TTS synthesis task is already running', {
        details: { activeRequestId: this.active.requestId },
        safeMessage: '另一条语音正在生成，请稍候。'
      })
    }
    const appSettings = await getAppSettings()
    if (!appSettings.tts.enabled) {
      throw new AppError('TTS_RUNTIME_ERROR', 'TTS is disabled', { safeMessage: '语音尚未启用。' })
    }
    const isFishProvider = appSettings.tts.provider === 'fish'
    const fishSettings = appSettings.tts.providers.fish
    const localSettings = appSettings.tts.providers.local
    const model = isFishProvider
      ? fishSettings.model
      : localSettings.engine + ':' + localSettings.engineConfigs.indexTts.baseUrl
    const referenceId = isFishProvider
      ? resolveFishCharacterReferenceId(request.characterId, appSettings.tts.characterVoices)
      : request.characterId
    if (isFishProvider && (!fishSettings.apiKey || !referenceId)) {
      throw new AppError('TTS_RUNTIME_ERROR', 'Fish Audio credentials are incomplete', {
        safeMessage: referenceId
          ? '请先配置 Fish Audio API Key。'
          : '请先为当前角色配置 Fish Audio 音色 ID。'
      })
    }
    const voicePath = isFishProvider ? '' : getCharacterTtsVoicePath(request.characterId)
    if (!isFishProvider && !(await isUsableAudio(voicePath, 44))) {
      throw new AppError('TTS_RUNTIME_ERROR', 'Index-TTS character voice is unavailable', {
        safeMessage: '请先下载当前角色的 index-tts 音色。'
      })
    }
    await mkdir(getTtsAudioRoot(), { recursive: true })
    const extension: AudioExtension = isFishProvider ? 'mp3' : 'wav'
    const cacheFileName = createCacheFileName(
      text,
      appSettings.tts.provider,
      model,
      referenceId,
      extension
    )
    const outputPath = join(getTtsAudioRoot(), cacheFileName)
    if (await isUsableAudio(outputPath, isFishProvider ? 128 : 44)) {
      return { audioUrl: getTtsAudioUrl(cacheFileName), cacheHit: true }
    }
    const temporaryPath = join(getTtsAudioRoot(), `${request.requestId}.tmp.${extension}`)
    const active: ActiveSynthesis = {
      requestId: request.requestId,
      child: null,
      controller: new AbortController(),
      cancelled: false
    }
    this.active = active
    try {
      await logger.info(
        'tts',
        'tts-synthesis-started',
        `Starting ${appSettings.tts.provider} TTS synthesis`,
        {
          requestId: request.requestId,
          messageId: request.messageId,
          textLength: text.length,
          compatibilityReplacementCount: replacementCount,
          provider: appSettings.tts.provider
        }
      )
      if (isFishProvider) {
        await runFishAudio(
          fishSettings.apiKey,
          model,
          referenceId,
          text,
          temporaryPath,
          active.controller
        )
      } else {
        await createLocalTtsEngine(localSettings).synthesize({
          text,
          voicePath,
          outputPath: temporaryPath,
          signal: active.controller.signal
        })
      }
      if (!(await isUsableAudio(temporaryPath, isFishProvider ? 128 : 44))) {
        throw new AppError('TTS_RUNTIME_ERROR', 'TTS provider returned no usable audio', {
          safeMessage: '语音合成未生成有效音频。'
        })
      }
      await rm(outputPath, { force: true })
      await rename(temporaryPath, outputPath)
      await logger.info(
        'tts',
        'tts-synthesis-finished',
        `${appSettings.tts.provider} TTS synthesis completed`,
        {
          requestId: request.requestId,
          messageId: request.messageId,
          outputPath,
          textLength: text.length,
          compatibilityReplacementCount: replacementCount,
          provider: appSettings.tts.provider
        }
      )
      return { audioUrl: getTtsAudioUrl(cacheFileName), cacheHit: false }
    } catch (error) {
      await logger.error(
        'tts',
        'tts-synthesis-failed',
        `${appSettings.tts.provider} TTS synthesis failed`,
        {
          requestId: request.requestId,
          messageId: request.messageId,
          provider: appSettings.tts.provider,
          error: error instanceof Error ? error.message : String(error),
          cause:
            error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined
        }
      )
      throw error
    } finally {
      if (this.active?.requestId === request.requestId) this.active = null
      try {
        await rm(temporaryPath, { force: true })
      } catch (error) {
        await logger.warn(
          'tts',
          'tts-temp-cleanup-failed',
          'Failed to remove temporary TTS audio',
          {
            requestId: request.requestId,
            temporaryPath,
            error: error instanceof Error ? error.message : String(error)
          }
        )
      }
    }
  }

  /**
   * @description 请求停止指定的正在运行的 TTS 合成任务。
   * @param requestId 渲染进程创建的合成请求标识。
   * @returns 是否找到了并停止了对应任务。
   */
  cancel(requestId: string): boolean {
    if (!requestId.trim() || this.active?.requestId !== requestId) return false
    this.active.cancelled = true
    this.active.controller.abort()
    return this.active.child ? this.active.child.kill() : true
  }

  /**
   * @description 测试当前本地 TTS 引擎的 HTTP 服务是否可访问。
   * @returns 可展示给用户的连接成功说明。
   */
  async testLocalEngineConnection(): Promise<TtsConnectionTestResult> {
    const settings = await getAppSettings()
    return { message: await createLocalTtsEngine(settings.tts.providers.local).testConnection() }
  }

  /** @description 停止应用退出时仍在运行的 TTS 任务。 */
  shutdown(): void {
    if (!this.active) return
    this.active.cancelled = true
    this.active.controller.abort()
    this.active.child?.kill()
  }
}

export const ttsService = new TtsService()
