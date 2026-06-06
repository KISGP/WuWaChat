import { logger } from '@main/logging'
import { serializeError } from '@main/errors'
import type { AppErrorCode } from '@main/errors'
import type { LogSource } from '@shared/logging'

type ErrorMonitorInput = {
  scope: LogSource
  action: string
  message: string
  error: unknown
  code?: AppErrorCode
  context?: Record<string, unknown>
}

const SENSITIVE_KEY_PATTERN = /(api[-_]?key|token|secret|password|authorization)/i

function sanitizeContext(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeContext(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeContext(item)
    ])
  )
}

/**
 * @description 统一捕获主进程异常并写入结构化日志。
 * @param input 异常所属范围、动作、展示消息、原始错误和附加上下文。
 * @returns 可等待的日志写入 Promise。
 * @remarks 该函数只负责监控和日志，不吞掉异常；调用方仍决定是否继续抛出或降级。
 */
export async function captureError(input: ErrorMonitorInput): Promise<void> {
  const error = serializeError(input.error, input.code)
  await logger.error(input.scope, input.action, input.message, {
    ...(input.context ? (sanitizeContext(input.context) as Record<string, unknown>) : {}),
    error
  })
}
