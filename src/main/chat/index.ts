import type {
  ChatDiagnosticRunRequest,
  ChatDeleteMessageRequest,
  ChatDeleteMessageResult,
  ChatRunAccepted,
  ChatAppendMessageRequest,
  ChatAppendMessageResult,
  ChatTriggerRunRequest,
  ChatImageReadRequest,
  ChatImageReadResult,
  ChatDebugRunListRequest,
  ChatDebugRunReadRequest,
  ChatDebugRunRecord,
  ChatDebugRunSummary,
  ConversationSession
} from '@shared/chat'
import {
  getCharacterPrompt,
  getCharacterEmoticons,
  getCharacterSummaryById,
  saveCharacterPrompt
} from '@main/characters'
import { getUserEmoticons } from './emoticons'
import { memoryService, worldService } from '@main/app/services'
import { getProfiles } from '@main/settings'
import { getUnifiedSettingsStore } from '@main/settings/store'
import { createAgentLoopPolicy } from '@main/agent/runtime/loop-policy'
import { ChatRuntime } from './runtime'
import { createChatAgent, getEnabledChatAgentToolNames } from './agent'

const chatAgent = createChatAgent(worldService.story, memoryService, worldService.glossary)

const runtime = new ChatRuntime(
  {
    getCharacter: async (characterId) => getCharacterSummaryById(characterId),
    getCharacterEmoticons,
    getCharacterPrompt: async (characterId) => getCharacterPrompt(characterId),
    getProfiles
  },
  {
    getRecentMessageCount: () => memoryService.getRecentMessageCount(),
    getAgentPolicy: async () => {
      const settings = await getUnifiedSettingsStore().get()
      return {
        ...createAgentLoopPolicy(settings.agent.maxToolRounds),
        memoryScope: memoryService.getSettings().crossSessionCharacterMemory
          ? 'character-all-sessions'
          : 'current-session',
        enabledToolPackageIds: settings.agent.enabledToolPackageIds,
        moegirlpedia: settings.agent.moegirlpedia
      }
    },
    getAgentToolNames: (policy) =>
      getEnabledChatAgentToolNames(
        worldService.story,
        memoryService,
        worldService.glossary,
        policy.enabledToolPackageIds,
        policy.moegirlpedia
      ),
    syncSessions: (sessions) => memoryService.syncSessions(sessions)
  },
  chatAgent
)

export { getCharacterPrompt, saveCharacterPrompt, getCharacterEmoticons, getUserEmoticons }

/**
 * @description 初始化聊天运行时并加载 MemoryService 的设置。
 */
export async function initializeChat(): Promise<void> {
  await memoryService.initializeSettings()
  await runtime.initialize()
}

/**
 * @description 返回当前管理的会话列表，供界面或其它模块使用。
 * @returns 当前会话数组。
 */
export function getSessions(): ConversationSession[] {
  return runtime.getSessions()
}

/**
 * @description 读取指定会话下的 Agent 调试运行摘要。
 * @param request 会话定位请求。
 * @returns 调试运行摘要列表。
 */
export async function listDebugRuns(request: ChatDebugRunListRequest): Promise<ChatDebugRunSummary[]> {
  return runtime.listDebugRuns(request)
}

/**
 * @description 读取指定 Agent 调试运行的完整原始事件。
 * @param request 调试运行定位请求。
 * @returns 完整运行记录；不存在时返回 `null`。
 */
export async function readDebugRun(request: ChatDebugRunReadRequest): Promise<ChatDebugRunRecord | null> {
  return runtime.readDebugRun(request)
}

/**
 * @description 读取会话中的图片资源并返回界面可展示的 Data URL。
 * @param request 图片读取请求，包含会话 ID 与资源索引 ID。
 * @returns 图片内容与 MIME 类型；资源不存在时返回 `null`。
 */
export async function readImageResource(
  request: ChatImageReadRequest
): Promise<ChatImageReadResult | null> {
  const result = await runtime.readImageResource(request)
  return result ? { dataUrl: result.dataUrl, mimeType: result.attachment.mimeType } : null
}

/**
 * @description 发送一个新的聊天运行请求，调度模型执行并返回已接受的运行信息。
 * @param request 运行请求对象。
 * @returns 已接受的运行信息，包含请求 ID 等元数据。
 */
export async function appendMessage(request: ChatAppendMessageRequest): Promise<ChatAppendMessageResult> {
  return runtime.appendMessage(request)
}

/**
 * @description 触发等待窗口对应的一次聊天运行。
 * @param request 触发请求。
 * @returns 已接受的运行信息。
 */
export async function triggerRun(request: ChatTriggerRunRequest): Promise<ChatRunAccepted> {
  return runtime.triggerRun(request)
}

/**
 * @description 删除一条会话消息；若目标为用户消息，则同时删除该轮紧随其后的角色回复。
 * @param request 删除请求，包含会话 ID 与消息 ID。
 * @returns 删除后的最新会话快照。
 */
export function deleteMessage(request: ChatDeleteMessageRequest): ChatDeleteMessageResult {
  return runtime.deleteMessage(request)
}

/**
 * @description 取消当前正在执行的请求任务。
 * @param requestId 要取消的请求 ID。
 * @returns 成功取消则返回 `true`。
 */
export function abortRun(requestId: string): boolean {
  return runtime.abortRun(requestId)
}

/**
 * @description 启动一次不写入真实会话的 Agent 诊断运行。
 * @param request 诊断运行请求与本次工具开关。
 * @returns 已接受的诊断请求标识。
 */
export async function startDiagnosticRun(
  request: ChatDiagnosticRunRequest
): Promise<{ requestId: string }> {
  return runtime.startDiagnosticRun(request)
}

/**
 * @description 中断指定的 Agent 诊断运行。
 * @param requestId 要中断的诊断请求标识。
 * @returns 请求存在且已发出中断信号时返回 `true`。
 */
export function abortDiagnosticRun(requestId: string): boolean {
  return runtime.abortDiagnosticRun(requestId)
}
