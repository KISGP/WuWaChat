import type {
  ChatImageReadRequest,
  ChatDeleteMessageRequest,
  ChatDiagnosticRunRequest,
  ChatRunEvent,
  ChatAppendMessageRequest,
  ChatTriggerRunRequest
} from '@shared/chat'
import type { ChatDebugRunListRequest, ChatDebugRunReadRequest } from '@shared/chat'
import type { ChatDiagnosticRunEvent } from '@shared/chat'

/**
 * @description 读取角色的当前 Prompt 文档。
 * @param characterId 要读取 Prompt 的角色标识。
 * @returns 主进程返回的 Prompt 内容 Promise。
 */
export function getCharacterPrompt(
  characterId: string
): ReturnType<typeof window.ai.getCharacterPrompt> {
  return window.ai.getCharacterPrompt(characterId)
}

/**
 * @description 保存角色的 Prompt 文档。
 * @param characterId 要更新 Prompt 的角色标识。
 * @param prompt 要保存的完整 Prompt 内容。
 * @returns 主进程确认保存后的 Promise。
 */
export function saveCharacterPrompt(
  characterId: string,
  prompt: string
): ReturnType<typeof window.ai.saveCharacterPrompt> {
  return window.ai.saveCharacterPrompt(characterId, prompt)
}

/**
 * @description 读取当前会话快照。
 * @returns 按主进程当前状态返回的会话列表 Promise。
 */
export function getSessions(): ReturnType<typeof window.ai.getSessions> {
  return window.ai.getSessions()
}

/**
 * @description 读取会话中的 Agent 调试运行摘要。
 * @param request 会话定位请求。
 * @returns 调试运行摘要列表。
 */
export function listDebugRuns(request: ChatDebugRunListRequest): ReturnType<typeof window.ai.listDebugRuns> {
  return window.ai.listDebugRuns(request)
}

/**
 * @description 读取一次 Agent 调试运行的完整事件记录。
 * @param request 运行定位请求。
 * @returns 完整调试记录或空值。
 */
export function readDebugRun(request: ChatDebugRunReadRequest): ReturnType<typeof window.ai.readDebugRun> {
  return window.ai.readDebugRun(request)
}

/**
 * @description 删除指定的会话消息。
 * @param request 包含会话和消息定位信息的删除请求。
 * @returns 主进程处理删除请求后的 Promise。
 */
export function deleteMessage(
  request: ChatDeleteMessageRequest
): ReturnType<typeof window.ai.deleteMessage> {
  return window.ai.deleteMessage(request)
}

/**
 * @description 发送一条聊天消息并启动运行。
 * @param request 包含会话、角色和消息内容的运行请求。
 * @returns 主进程创建聊天运行后的 Promise。
 */
export function appendMessage(request: ChatAppendMessageRequest): ReturnType<typeof window.ai.appendMessage> {
  return window.ai.appendMessage(request)
}

/**
 * @description 触发一次等待窗口对应的聊天运行。
 * @param request 触发请求。
 * @returns 主进程接受的运行信息。
 */
export function triggerRun(request: ChatTriggerRunRequest): ReturnType<typeof window.ai.triggerRun> {
  return window.ai.triggerRun(request)
}

/**
 * @description 按会话和资源标识读取已保存的聊天图片。
 * @param request 图片读取请求，包含会话 ID 与资源 ID。
 * @returns 主进程返回的图片 Data URL 与 MIME 类型。
 */
export function readImageResource(
  request: ChatImageReadRequest
): ReturnType<typeof window.ai.readImageResource> {
  return window.ai.readImageResource(request)
}

/**
 * @description 中止指定的聊天运行。
 * @param requestId 要中止的聊天运行标识。
 * @returns 主进程处理取消请求后的 Promise。
 */
export function abortRun(requestId: string): ReturnType<typeof window.ai.abortRun> {
  return window.ai.abortRun(requestId)
}

/**
 * @description 订阅聊天运行事件。
 * @param listener 接收主进程聊天运行事件的回调。
 * @returns 用于取消订阅的清理函数。
 * @remarks 调用方应在组件或页面卸载时执行返回的清理函数。
 */
export function onRunEvent(
  listener: (event: ChatRunEvent) => void
): ReturnType<typeof window.ai.onRunEvent> {
  return window.ai.onRunEvent(listener)
}

/**
 * @description 启动隔离的 Agent 诊断运行。
 * @param request 包含诊断上下文和请求标识的运行请求。
 * @returns 主进程接受诊断请求后的 Promise。
 */
export function startDiagnosticRun(
  request: ChatDiagnosticRunRequest
): ReturnType<typeof window.ai.startDiagnosticRun> {
  return window.ai.startDiagnosticRun(request)
}

/**
 * @description 中止指定的 Agent 诊断运行。
 * @param requestId 要中止的诊断运行标识。
 * @returns 主进程处理取消请求后的 Promise。
 */
export function abortDiagnosticRun(
  requestId: string
): ReturnType<typeof window.ai.abortDiagnosticRun> {
  return window.ai.abortDiagnosticRun(requestId)
}

/**
 * @description 订阅 Agent 诊断运行事件。
 * @param listener 接收主进程诊断运行事件的回调。
 * @returns 用于取消订阅的清理函数。
 * @remarks 调用方应在组件或页面卸载时执行返回的清理函数。
 */
export function onDiagnosticRunEvent(
  listener: (event: ChatDiagnosticRunEvent) => void
): ReturnType<typeof window.ai.onDiagnosticRunEvent> {
  return window.ai.onDiagnosticRunEvent(listener)
}
