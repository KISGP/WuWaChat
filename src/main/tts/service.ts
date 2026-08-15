import { type ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { mkdir, rename, rm, stat } from 'fs/promises'
import { join } from 'path'
import type { TtsSynthesisRequest, TtsSynthesisResult } from '@shared/tts'
import { AppError } from '@main/errors/AppError'
import { logger } from '@main/logging'
import { getTtsAudioRoot } from '@main/utils'
import { getTtsAudioUrl } from './protocol'
import { normalizeTextForTts } from './text-normalizer'
import { resolveTtsRuntimePaths, runTtsSidecar, validateTtsRuntime } from './runtime'

const TTS_PROFILE_VERSION = 'v2proplus-baseline-v2'
const MAX_TTS_TEXT_LENGTH = 500

type ActiveSynthesis = {
  requestId: string
  child: ChildProcess | null
  cancelled: boolean
}

/**
 * @description 校验来自渲染进程的 TTS 合成请求。
 * @param request 待合成的消息请求。
 * @returns 去除首尾空白后的文本。
 */
function validateSynthesisRequest(request: TtsSynthesisRequest): string {
  const text = request.text.trim()
  if (!request.requestId.trim() || !request.messageId.trim()) {
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
 * @description 为固定音色和输入文本生成稳定的缓存文件名。
 * @param text 已规范化的待合成文本。
 * @returns 不含目录的 WAV 文件名。
 */
function createCacheFileName(text: string): string {
  return `${createHash('sha256').update(`${TTS_PROFILE_VERSION}\n${text}`).digest('hex')}.wav`
}

/**
 * @description 判断候选路径是否为非空的 WAV 缓存文件。
 * @param filePath 候选音频文件路径。
 * @returns 文件存在且大于 WAV 头最小长度时返回 true。
 */
async function isUsableWav(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile() && fileStat.size > 44
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
 * @description 管理固定默认音色的本地 sidecar 合成、缓存与取消操作。
 * @remarks 服务进程范围内只允许一个合成任务，避免 CPU 模型并发争用。
 */
class TtsService {
  private active: ActiveSynthesis | null = null

  /**
   * @description 通过本地 Windows sidecar 合成中文文本并返回可播放音频地址。
   * @param request 来自受控 IPC 的消息合成请求。
   * @returns 已生成或命中缓存的 WAV 地址。
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

    const paths = resolveTtsRuntimePaths()
    await validateTtsRuntime(paths)
    await mkdir(getTtsAudioRoot(), { recursive: true })
    const cacheFileName = createCacheFileName(text)
    const outputPath = join(getTtsAudioRoot(), cacheFileName)
    if (await isUsableWav(outputPath)) {
      return { audioUrl: getTtsAudioUrl(cacheFileName), cacheHit: true }
    }

    const temporaryPath = join(getTtsAudioRoot(), `${request.requestId}.tmp.wav`)
    const active: ActiveSynthesis = { requestId: request.requestId, child: null, cancelled: false }
    this.active = active
    try {
      await logger.info('tts', 'tts-synthesis-started', 'Starting local TTS synthesis', {
        requestId: request.requestId,
        messageId: request.messageId,
        textLength: text.length,
        compatibilityReplacementCount: replacementCount
      })
      const output = await runTtsSidecar(paths, text, temporaryPath, {
        isCancelled: () => active.cancelled,
        onStarted: (child) => {
          active.child = child
        }
      })
      if (!(await isUsableWav(temporaryPath))) {
        throw new AppError(
          'TTS_RUNTIME_ERROR',
          'TTS sidecar returned success without a valid WAV',
          {
            details: { output },
            safeMessage: '语音合成未生成有效音频。'
          }
        )
      }
      await rm(outputPath, { force: true })
      await rename(temporaryPath, outputPath)
      await logger.info('tts', 'tts-synthesis-finished', 'Local TTS synthesis completed', {
        requestId: request.requestId,
        messageId: request.messageId,
        outputPath,
        textLength: text.length,
        compatibilityReplacementCount: replacementCount
      })
      return { audioUrl: getTtsAudioUrl(cacheFileName), cacheHit: false }
    } catch (error) {
      await logger.error('tts', 'tts-synthesis-failed', 'Local TTS synthesis failed', {
        requestId: request.requestId,
        messageId: request.messageId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    } finally {
      if (this.active?.requestId === request.requestId) {
        this.active = null
      }
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
   * @description 请求停止指定的正在运行的 sidecar 合成任务。
   * @param requestId 渲染进程创建的合成请求标识。
   * @returns 是否找到了并停止了对应任务。
   */
  cancel(requestId: string): boolean {
    if (!requestId.trim() || this.active?.requestId !== requestId) {
      return false
    }
    this.active.cancelled = true
    return this.active.child ? this.active.child.kill() : true
  }

  /**
   * @description 停止应用退出时仍在运行的 sidecar 进程。
   */
  shutdown(): void {
    if (this.active) {
      this.active.cancelled = true
      this.active.child?.kill()
    }
  }
}

export const ttsService = new TtsService()
