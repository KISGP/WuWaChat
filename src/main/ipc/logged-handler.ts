import { ipcMain } from 'electron'
import { logger } from '@main/logging'
import { captureError } from '@main/observability/error-monitor'

function summarizeValue(value: unknown): unknown {
  if (value == null) {
    return value
  }

  if (typeof value === 'string') {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return { type: 'array', length: value.length }
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
  }

  return typeof value
}

export function getSenderContext(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): {
  webContentsId: number
} {
  return {
    webContentsId: event.sender.id
  }
}

/**
 * @description 注册带结构化日志和统一错误监控的 IPC handler。
 * @param channel IPC channel 名称。
 * @param handler 实际处理函数。
 * @param describe 可选的参数摘要函数，避免日志记录完整大对象或敏感数据。
 */
export function handleLogged<Args extends unknown[], Result>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: Args) => Promise<Result> | Result,
  describe?: (...args: Args) => Record<string, unknown>
): void {
  ipcMain.handle(channel, async (event, ...args: Args) => {
    const context = {
      channel,
      ...getSenderContext(event),
      ...(describe ? describe(...args) : {})
    }

    await logger.info('ipc', 'invoke-start', `IPC ${channel} started`, context)

    try {
      const result = await handler(event, ...args)
      void logger.info('ipc', 'invoke-success', `IPC ${channel} completed`, {
        ...context,
        result: summarizeValue(result)
      })
      return result
    } catch (error) {
      void captureError({
        scope: 'ipc',
        action: 'invoke-error',
        message: `IPC ${channel} failed`,
        code: 'IPC_HANDLER_ERROR',
        context,
        error
      })
      throw error
    }
  })
}
