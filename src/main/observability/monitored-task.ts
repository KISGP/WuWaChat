import { captureError } from './error-monitor'
import type { AppErrorCode } from '@main/errors'
import type { LogSource } from '@shared/logging'

type MonitoredTaskInput<Result> = {
  scope: LogSource
  action: string
  message: string
  code?: AppErrorCode
  context?: Record<string, unknown>
  shouldCaptureError?: (error: unknown) => boolean
  run: () => Promise<Result>
}

/**
 * @description 执行异步任务，并在失败时通过统一错误监控记录结构化日志。
 * @param input 任务描述、上下文和实际执行函数。
 * @returns 任务执行结果。
 * @throws 会重新抛出原始异常，确保业务层原有失败语义不变。
 */
export async function runMonitoredTask<Result>(input: MonitoredTaskInput<Result>): Promise<Result> {
  try {
    return await input.run()
  } catch (error) {
    if (input.shouldCaptureError && !input.shouldCaptureError(error)) {
      throw error
    }
    await captureError({
      scope: input.scope,
      action: input.action,
      message: input.message,
      code: input.code,
      context: input.context,
      error
    })
    throw error
  }
}
