import type { ChatDiagnosticRunEvent } from '@shared/chat'

/**
 * @description 将未知结构格式化为可复制的 JSON。
 * @param value 待格式化的数据。
 * @returns JSON 文本。
 */
export function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch (cause) {
    return 'Unable to serialize value: ' + (cause instanceof Error ? cause.message : String(cause))
  }
}

/**
 * @description 格式化诊断运行耗时。
 * @param durationMs 毫秒数。
 * @returns 可读时长。
 */
export function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? durationMs + ' ms' : (durationMs / 1000).toFixed(2) + ' s'
}

/**
 * @description 格式化 token 数量。
 * @param count token 数量。
 * @returns 带千位分隔符的数量。
 */
export function formatTokenCount(count: number): string {
  return count.toLocaleString('en-US')
}

/**
 * @description 控制 JSON 预览初始展开层级，保留根节点和第一层字段可见。
 * @param level 当前层级。
 * @returns 是否展开。
 */
export function shouldExpandJsonNode(level: number): boolean {
  return level < 2
}

/**
 * @description 返回事件的时间线标题。
 * @param event 诊断事件。
 * @returns 标题文本。
 */
export function getEventLabel(event: ChatDiagnosticRunEvent): string {
  if (event.type === 'llm-request')
    return (
      (event.phase === 'tool-routing' ? '工具路由' : '最终回复') + ' · 模型请求 #' + event.sequence
    )
  if (event.type === 'llm-response')
    return (
      (event.phase === 'tool-routing' ? '工具路由' : '最终回复') + ' · 模型响应 #' + event.sequence
    )
  if (event.type === 'tool-result')
    return '工具返回 · ' + (event.message.name || '未知工具') + ' · 第 ' + event.round + ' 轮'
  if (event.type === 'completed') return '运行完成'
  if (event.type === 'error') return '运行失败'
  if (event.type === 'aborted') return '运行已停止'
  return '运行开始'
}

/**
 * @description 提取事件对应的 provider body 或响应数据。
 * @param event 诊断事件。
 * @returns 诊断数据。
 */
export function getRawEventValue(event: ChatDiagnosticRunEvent): unknown {
  if (event.type === 'llm-request') return event.body
  if (event.type === 'llm-response') {
    return {
      content: event.content,
      tool_calls: event.tool_calls,
      ...(event.usage ? { usage: event.usage } : {})
    }
  }
  if (event.type === 'tool-result') return event.message
  if (event.type === 'completed') return event.assistantDraft
  return event
}
