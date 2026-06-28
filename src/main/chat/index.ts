import type {
  ChatDeleteMessageRequest,
  ChatDeleteMessageResult,
  ChatPromptPreviewRequest,
  ChatPromptPreviewResult,
  ChatRunAccepted,
  ChatRunRequest,
  ConversationSession
} from '@shared/chat'
import {
  getCharacterPrompt,
  getCharacterSummaryById,
  getCharacters,
  saveCharacterPrompt
} from '@main/characters'
import { MemoryService } from '@main/memory'
import { getProfiles } from '@main/settings'
import { ChatRuntime } from './runtime'

const memoryService = new MemoryService()

const runtime = new ChatRuntime(
  {
    getCharacter: async (characterId) => getCharacterSummaryById(characterId),
    getCharacterPrompt: async (characterId) => getCharacterPrompt(characterId),
    getProfiles
  },
  {
    getRecentMessageCount: () => memoryService.getRecentMessageCount(),
    retrieveStoryContext: (query) => memoryService.retrieveStoryContext(query),
    retrieveGlossaryContext: (query) => memoryService.retrieveGlossaryContext(query),
    retrieveChatMemoryContext: (query, session) =>
      memoryService.retrieveChatMemoryContext(query, session),
    previewPromptContext: (query, session) => memoryService.previewPromptContext(query, session),
    syncSessions: (sessions) => memoryService.syncSessions(sessions)
  }
)

export { getCharacters, getCharacterPrompt, saveCharacterPrompt }

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
 * @description 发送一个新的聊天运行请求，调度模型执行并返回已接受的运行信息。
 * @param request 运行请求对象。
 * @returns 已接受的运行信息，包含请求 ID 等元数据。
 */
export function sendMessage(request: ChatRunRequest): ChatRunAccepted {
  return runtime.sendMessage(request)
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
 * @description 生成一次只读的聊天提示词预览，不触发模型请求或会话写入。
 * @param request 预览请求，包含角色、配置、会话与模拟用户输入。
 * @returns 提示词拆分结果与最终模型消息列表。
 */
export async function previewModelInput(
  request: ChatPromptPreviewRequest
): Promise<ChatPromptPreviewResult> {
  return runtime.previewModelInput(request)
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
 * @description 导出全局的 MemoryService 实例，供 IPC 与其它模块使用。
 * @returns 全局 MemoryService 实例。
 */
export function getMemoryService(): MemoryService {
  return memoryService
}
