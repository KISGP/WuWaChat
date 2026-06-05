import { AppError } from './AppError'
import type { AppErrorCode } from './error-codes'

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function toErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

/**
 * @description 将任意异常归一化为 `AppError`，方便日志、IPC 和任务系统统一处理。
 * @param error 任意被捕获的异常值。
 * @param fallbackCode 无法识别错误类型时使用的错误码。
 * @param safeMessage 可选的安全错误提示，适合返回给渲染器或用户界面。
 * @returns 归一化后的 `AppError` 实例。
 */
export function normalizeError(
  error: unknown,
  fallbackCode: AppErrorCode = 'UNKNOWN_ERROR',
  safeMessage?: string
): AppError {
  if (error instanceof AppError) {
    return error
  }

  return new AppError(fallbackCode, toErrorMessage(error), {
    cause: error,
    safeMessage
  })
}
