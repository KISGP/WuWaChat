import { spawn, type ChildProcess } from 'child_process'
import { constants } from 'fs'
import { access, readFile } from 'fs/promises'
import { basename, join } from 'path'
import { AppError } from '@main/errors/AppError'
import { getTtsModelRoot } from '@main/utils'

const SYNTHESIS_TIMEOUT_MS = 120_000
const MAX_SIDECAR_OUTPUT_LENGTH = 16_000
const REQUIRED_MODEL_NAMES = [
  'cnhubert_base.onnx',
  'sovits_prompt_encoder.onnx',
  'sv_embedder.onnx',
  's1v3_prefill.onnx',
  's1v3_decode.onnx',
  's2Gv2ProPlus_decode.onnx'
] as const

export type TtsRuntimePaths = {
  root: string
  sidecar: string
  preprocessLibrary: string
  onnxRuntime: string
  modelDirectory: string
  referenceWav: string
  referenceText: string
}

export type TtsSidecarRunOptions = {
  isCancelled: () => boolean
  onStarted: (child: ChildProcess) => void
}

/**
 * @description 判断环境变量中的运行时根目录是否可作为单个 Windows 文件系统路径使用。
 * @param root 从环境变量读取并去除首尾空白后的路径。
 * @returns 路径未混入命令行重定向、控制字符或多行输出时返回 true。
 */
/**
 * @description 从应用托管目录解析固定 TTS 运行时的文件路径。
 * @param modelId 应用设置中的模型标识。
 * @returns 可供 Windows sidecar 使用的运行时路径集合。
 * @remarks 当前阶段仅支持已验证的 Windows 运行时，后续下载器会替换此解析方式。
 */
export function resolveTtsRuntimePaths(modelId: string): TtsRuntimePaths {
  if (process.platform !== 'win32') {
    throw new AppError(
      'TTS_RUNTIME_ERROR',
      'The baseline TTS runtime currently supports Windows only',
      {
        safeMessage: '当前本地语音运行时仅支持 Windows。'
      }
    )
  }

  const root = getTtsModelRoot(modelId)
  const runtimeDirectory = join(root, 'windows-x64')
  return {
    root,
    sidecar: join(runtimeDirectory, 'tts-sidecar.exe'),
    preprocessLibrary: join(runtimeDirectory, 'gpt_sovits_preprocess.dll'),
    onnxRuntime: join(runtimeDirectory, 'onnxruntime.dll'),
    modelDirectory: join(root, 'onnx_models'),
    referenceWav: join(root, 'f9tx5-76w56.wav'),
    referenceText: join(root, 'f9tx5-76w56.txt')
  }
}

/**
 * @description 确认 TTS 运行时所需的文件均存在且可读取。
 * @param paths 已解析的运行时路径集合。
 */
export async function validateTtsRuntime(paths: TtsRuntimePaths): Promise<void> {
  const filePaths = [
    paths.sidecar,
    paths.preprocessLibrary,
    paths.onnxRuntime,
    paths.referenceWav,
    paths.referenceText,
    ...REQUIRED_MODEL_NAMES.map((name) => join(paths.modelDirectory, name))
  ]
  for (const filePath of filePaths) {
    try {
      await access(filePath, constants.R_OK)
    } catch (error) {
      throw new AppError('TTS_RUNTIME_ERROR', `Required TTS asset is unavailable: ${filePath}`, {
        cause: error,
        safeMessage: `本地语音运行时缺少文件：${basename(filePath)}。`
      })
    }
  }
}

/**
 * @description 将 sidecar 输出压缩为有限长度的诊断文本。
 * @param chunks 已捕获的输出片段。
 * @returns 有长度上限的文本输出。
 */
function formatSidecarOutput(chunks: Buffer[]): string {
  const output = Buffer.concat(chunks).toString('utf-8').trim()
  return output.length > MAX_SIDECAR_OUTPUT_LENGTH
    ? `${output.slice(0, MAX_SIDECAR_OUTPUT_LENGTH)}...`
    : output
}

/**
 * @description 调用 Windows sidecar 执行一次 ONNX 语音合成。
 * @param paths 已校验的运行时路径。
 * @param text 已规范化的待合成文本。
 * @param outputPath sidecar 应写入的临时 WAV 路径。
 * @param options 用于关联取消状态和记录已启动进程的回调。
 * @returns sidecar 的标准输出文本。
 */
export async function runTtsSidecar(
  paths: TtsRuntimePaths,
  text: string,
  outputPath: string,
  options: TtsSidecarRunOptions
): Promise<string> {
  const referenceText = (await readFile(paths.referenceText, 'utf-8')).trim()
  if (!referenceText) {
    throw new AppError('TTS_RUNTIME_ERROR', 'TTS reference transcript is empty', {
      safeMessage: '本地语音参考文本为空。'
    })
  }
  if (options.isCancelled()) {
    throw new AppError('TTS_RUNTIME_ERROR', 'TTS synthesis was cancelled before startup', {
      safeMessage: '已停止语音合成。'
    })
  }

  const child = spawn(
    paths.sidecar,
    [
      'synthesize',
      paths.preprocessLibrary,
      paths.modelDirectory,
      paths.onnxRuntime,
      paths.referenceWav,
      referenceText,
      text,
      outputPath,
      '--ref-lang',
      'all_zh',
      '--text-lang',
      'all_zh',
      '--seed',
      '42'
    ],
    { cwd: paths.root, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
  )
  options.onStarted(child)

  return new Promise((resolvePromise, rejectPromise) => {
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false
    const settle = (callback: () => void): void => {
      if (!settled) {
        settled = true
        callback()
      }
    }
    const timeout = setTimeout(() => {
      child.kill()
      settle(() =>
        rejectPromise(
          new AppError('TTS_RUNTIME_ERROR', 'TTS sidecar timed out', {
            safeMessage: '语音合成超时，请缩短文本后重试。'
          })
        )
      )
    }, SYNTHESIS_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
    child.once('error', (error) => {
      clearTimeout(timeout)
      settle(() =>
        rejectPromise(
          new AppError('TTS_RUNTIME_ERROR', 'Failed to start TTS sidecar', {
            cause: error,
            safeMessage: '本地语音运行时无法启动。'
          })
        )
      )
    })
    child.once('close', (code, signal) => {
      clearTimeout(timeout)
      const stdout = formatSidecarOutput(stdoutChunks)
      const stderr = formatSidecarOutput(stderrChunks)
      if (options.isCancelled()) {
        settle(() =>
          rejectPromise(
            new AppError('TTS_RUNTIME_ERROR', 'TTS synthesis was cancelled', {
              safeMessage: '已停止语音合成。'
            })
          )
        )
      } else if (code !== 0) {
        settle(() =>
          rejectPromise(
            new AppError('TTS_RUNTIME_ERROR', 'TTS sidecar exited with an error', {
              details: { code, signal, stderr, stdout },
              safeMessage: '语音合成失败，请重试。'
            })
          )
        )
      } else {
        settle(() => resolvePromise(stdout))
      }
    })
  })
}
