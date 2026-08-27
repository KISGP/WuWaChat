import type { RendererLogEventPayload } from '@shared/logging'
/**
 * @description 记录一条 renderer 日志事件。
 * @param payload 包含事件名、消息和可选上下文的日志载荷。
 * @returns 主进程接收日志事件后的 Promise。
 */
export function track(payload: RendererLogEventPayload): ReturnType<typeof window.logs.track> {
  return window.logs.track(payload)
}
/**
 * @description 读取日志查看器状态。
 * @returns 日志目录和查看器可用状态的 Promise。
 */
export function getViewerState(): ReturnType<typeof window.logs.getViewerState> {
  return window.logs.getViewerState()
}
/**
 * @description 读取持久化日志内容。
 * @returns 当前持久化日志文本的 Promise。
 */
export function readLogs(): ReturnType<typeof window.logs.readLogs> {
  return window.logs.readLogs()
}
/**
 * @description 在系统文件管理器打开日志目录。
 * @returns 主进程发起打开目录操作后的 Promise。
 */
export function openDirectory(): ReturnType<typeof window.logs.openDirectory> {
  return window.logs.openDirectory()
}
/**
 * @description 清除持久化日志。
 * @returns 主进程完成日志清理后的 Promise。
 */
export function clearLogs(): ReturnType<typeof window.logs.clearLogs> {
  return window.logs.clearLogs()
}
