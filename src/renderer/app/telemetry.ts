import type { RendererLogEventPayload } from '@shared/logging'
import { track } from '@renderer/services/logs'

/**
 * @description 记录 renderer 中发生的用户界面事件。
 * @param event 事件名称。
 * @param message 事件说明。
 * @param context 可选的结构化上下文。
 * @returns 无返回值。
 * @remarks 日志写入以非阻塞方式发起，调用方无需等待其完成。
 */
export function trackUiEvent(
  event: string,
  message: string,
  context?: RendererLogEventPayload['context']
): void {
  void track({
    source: 'renderer',
    event,
    message,
    context
  })
}
