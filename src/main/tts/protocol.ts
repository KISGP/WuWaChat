import { net, protocol } from 'electron'
import { constants } from 'fs'
import { access } from 'fs/promises'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { logger } from '@main/logging'
import { getTtsAudioRoot } from '@main/utils'

const TTS_AUDIO_SCHEME = 'wuwachat-tts'
const TTS_AUDIO_HOST = 'audio'
const TTS_CACHE_FILE_NAME_PATTERN = /^[a-f0-9]{64}\.(?:mp3|wav)$/u

/**
 * @description 在 Electron ready 事件之前声明 TTS 音频协议所需的 Chromium 权限。
 * @remarks stream 与 bypassCSP 均为 HTML 媒体元素加载自定义协议资源所需的权限。
 */
export function registerTtsAudioScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: TTS_AUDIO_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        corsEnabled: true,
        stream: true,
        supportFetchAPI: true,
        bypassCSP: true
      }
    }
  ])
}

/**
 * @description 为缓存 WAV 注册受限的自定义协议处理器。
 * @remarks 仅允许固定 SHA-256 文件名，避免 renderer 通过 URL 读取任意本地文件。
 */
export function registerTtsAudioProtocol(): void {
  protocol.handle(TTS_AUDIO_SCHEME, async (request) => {
    const url = new URL(request.url)
    const fileName = url.pathname.slice(1)

    if (url.host !== TTS_AUDIO_HOST || !TTS_CACHE_FILE_NAME_PATTERN.test(fileName)) {
      await logger.warn('tts', 'tts-audio-request-rejected', 'Rejected invalid TTS audio request', {
        url: request.url
      })
      return new Response('Not found', { status: 404 })
    }

    const filePath = join(getTtsAudioRoot(), fileName)
    try {
      await access(filePath, constants.R_OK)
      const response = await net.fetch(pathToFileURL(filePath).toString())
      await logger.info('tts', 'tts-audio-served', 'Served synthesized TTS audio', {
        fileName,
        status: response.status
      })
      return response
    } catch (error) {
      await logger.error('tts', 'tts-audio-serve-failed', 'Failed to serve synthesized TTS audio', {
        fileName,
        error: error instanceof Error ? error.message : String(error)
      })
      return new Response('Not found', { status: 404 })
    }
  })
}

/**
 * @description 为缓存文件名构造 renderer 可使用的受限音频地址。
 * @param fileName 已由主进程生成的 SHA-256 WAV 文件名。
 * @returns TTS 自定义协议 URL。
 */
export function getTtsAudioUrl(fileName: string): string {
  return `${TTS_AUDIO_SCHEME}://${TTS_AUDIO_HOST}/${fileName}`
}
