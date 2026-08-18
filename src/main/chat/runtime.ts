import type {
  ChatDeleteMessageRequest,
  ChatDeleteMessageResult,
  ChatPromptPreviewRequest,
  ChatPromptPreviewResult,
  ChatRunAccepted,
  ChatRunRequest,
  ConversationMessage,
  ConversationSession
} from '@shared/chat'
import { logger } from '@main/logging'
import { SessionStore } from './session-store'
import { createAiGraph } from './graph-factory'
import type { GraphStateValue } from './graph-state'
import { buildSystemPromptText, toLoggableMessages, toModelMessages } from './model-message-builder'
import { handleRunError } from './run-error-handler'
import { RunEventPublisher } from './run-event-publisher'
import { RunRegistry } from './run-registry'
import type { ChatRuntimeDependencies, ChatContextProvider } from './types'
import type { ChatAgent } from './agent'

export class ChatRuntime {
  private readonly sessionStore = new SessionStore()
  private readonly runRegistry = new RunRegistry()
  private readonly eventPublisher = new RunEventPublisher()
  private readonly graph

  constructor(
    private readonly dependencies: ChatRuntimeDependencies,
    private readonly chatContext: ChatContextProvider,
    private readonly agent: ChatAgent
  ) {
    this.graph = createAiGraph({
      dependencies: this.dependencies,
      chatContext: this.chatContext,
      sessionStore: this.sessionStore,
      runRegistry: this.runRegistry,
      eventPublisher: this.eventPublisher,
      agent: this.agent
    })
  }

  async initialize(): Promise<void> {
    await this.sessionStore.initialize()
    this.chatContext.syncSessions(this.sessionStore.getSessions())
  }

  getSessions(): ConversationSession[] {
    return this.sessionStore.getSessions()
  }

  sendMessage(request: ChatRunRequest): ChatRunAccepted {
    const { session, assistantMessage } = this.sessionStore.startRun({
      sessionId: request.sessionId,
      characterId: request.characterId,
      userMessage: request.userMessage
    })
    const activeRun = this.runRegistry.register(request.requestId, session.id, assistantMessage.id)

    void logger.info('ai', 'run-accepted', 'Accepted chat run request', {
      requestId: request.requestId,
      sessionId: session.id,
      characterId: request.characterId,
      profileId: request.profileId,
      messageId: assistantMessage.id,
      messageLength: request.userMessage.length
    })

    this.eventPublisher.publish({
      type: 'session-synced',
      requestId: request.requestId,
      session
    })
    this.eventPublisher.publish({
      type: 'run-started',
      requestId: request.requestId,
      session,
      messageId: assistantMessage.id
    })
    void logger.info('ai', 'run-started', 'Chat run started', {
      requestId: request.requestId,
      sessionId: session.id,
      characterId: request.characterId,
      profileId: request.profileId,
      messageId: assistantMessage.id
    })
    this.chatContext.syncSessions(this.sessionStore.getSessions())

    void this.executeRun({
      requestId: request.requestId,
      sessionId: session.id,
      assistantMessageId: assistantMessage.id,
      profileId: request.profileId,
      characterId: request.characterId,
      userMessage: request.userMessage,
      assistantDraft: '',
      abortSignal: activeRun.controller.signal
    })

    return {
      requestId: request.requestId,
      sessionId: session.id,
      messageId: assistantMessage.id
    }
  }

  /**
   * @description 删除指定会话中的单条消息，并同步 memory 视图所依赖的会话快照。
   * @param request 删除请求，包含会话 ID 与消息 ID。
   * @returns 删除后最新的会话快照。
   */
  deleteMessage(request: ChatDeleteMessageRequest): ChatDeleteMessageResult {
    const session = this.sessionStore.deleteMessage(request.sessionId, request.messageId)
    this.chatContext.syncSessions(this.sessionStore.getSessions())
    void logger.info('ai', 'message-deleted', 'Chat message deleted', {
      sessionId: request.sessionId,
      messageId: request.messageId,
      remainingMessageCount: session.messages.length
    })

    return { session }
  }

  /**
   * @description 基于当前角色和会话构建一次不执行工具的模型输入预览。
   * @param request 预览请求，包含角色、配置、会话与模拟用户输入。
   * @returns 最终 system prompt、可用工具和完整消息列表。
   * @remarks 该方法不会写入 session、不会注册角色回复或执行 Agent 工具。
   */
  async previewModelInput(request: ChatPromptPreviewRequest): Promise<ChatPromptPreviewResult> {
    const userMessage = request.userMessage.trim()
    if (!userMessage) {
      throw new Error('Prompt preview requires a non-empty user message.')
    }

    const profilesStore = await this.dependencies.getProfiles()
    const profile = profilesStore.profiles.find((item) => item.id === request.profileId)
    if (!profile) {
      throw new Error(`Profile not found: ${request.profileId}`)
    }

    const promptDocument = await this.dependencies.getCharacterPrompt(request.characterId)
    const session = this.resolvePreviewSession(request.sessionId || null, request.characterId)
    const history = this.buildPreviewHistory(session, userMessage)
    const systemPromptText = buildSystemPromptText(promptDocument.prompt)
    const messages = toLoggableMessages(toModelMessages(promptDocument.prompt, history))
    const agentPolicy = await this.chatContext.getAgentPolicy()

    void logger.info('ai', 'prompt-preview-built', 'Built chat prompt preview', {
      characterId: request.characterId,
      profileId: profile.id,
      sessionId: session?.id || null,
      historyMessageCount: history.length,
      systemPromptText,
      chatMessages: messages
    })

    return {
      sessionId: session?.id || null,
      characterId: request.characterId,
      profileId: profile.id,
      userMessage,
      prompt: promptDocument.prompt,
      agentTools: this.chatContext.getAgentToolNames(agentPolicy),
      agentTrace: [],
      systemPromptText,
      messages
    }
  }

  abortRun(requestId: string): boolean {
    const activeRun = this.runRegistry.abort(requestId)
    if (!activeRun) {
      return false
    }

    void logger.info('ai', 'run-abort-requested', 'Abort requested for active chat run', {
      requestId,
      sessionId: activeRun.sessionId,
      messageId: activeRun.messageId,
      durationMs: Date.now() - activeRun.startedAt
    })
    return true
  }

  /**
   * @description 解析预览请求应使用的会话，仅在显式选择了会话时才返回真实历史。
   * @param sessionId 预览请求携带的会话 ID。
   * @param characterId 当前角色 ID。
   * @returns 匹配的会话；若未选择或会话与角色不匹配则返回 `null`。
   */
  private resolvePreviewSession(
    sessionId: string | null,
    characterId: string
  ): ConversationSession | null {
    if (!sessionId) {
      return null
    }

    const session = this.sessionStore.getSession(sessionId)
    return session && session.characterId === characterId ? session : null
  }

  /**
   * @description 构造一次预览请求的虚拟历史消息，不写入真实 session。
   * @param session 当前选中的真实会话；为空时仅使用本次模拟用户输入。
   * @param userMessage 本次模拟用户输入。
   * @returns 与真实发送链路一致的历史消息数组。
   */
  private buildPreviewHistory(
    session: ConversationSession | null,
    userMessage: string
  ): ConversationMessage[] {
    const virtualMessages: ConversationMessage[] = [
      ...(session?.messages || []),
      {
        id: 'preview-user-message',
        role: 'user',
        content: userMessage,
        status: 'complete',
        createdAt: new Date().toISOString()
      }
    ]

    return virtualMessages
      .filter(
        (message) =>
          Boolean(message.content.trim()) &&
          (message.role === 'user' || message.status !== 'pending')
      )
      .slice(-this.chatContext.getRecentMessageCount())
  }

  private async executeRun(input: Partial<GraphStateValue>): Promise<void> {
    const requestId = String(input.requestId)
    const activeRun = this.runRegistry.get(requestId)

    if (!activeRun) {
      return
    }

    try {
      await this.graph.invoke(input)
    } catch (error) {
      await handleRunError(requestId, error, activeRun, {
        sessionStore: this.sessionStore,
        eventPublisher: this.eventPublisher
      })
    } finally {
      this.runRegistry.delete(requestId)
    }
  }
}
