import type {
  ChatDiagnosticRunRequest,
  ChatDiagnosticMessage,
  ChatDiagnosticToolCall,
  ChatTokenUsage,
  ChatDeleteMessageRequest,
  ChatDeleteMessageResult,
  ChatRunAccepted,
  ChatRunRequest,
  ConversationMessage,
  ConversationSession
} from '@shared/chat'
import type { AgentPolicy, AgentToolTrace } from '@shared/agent'
import { logger } from '@main/logging'
import { SessionStore } from './session-store'
import { createAiGraph } from './graph-factory'
import type { GraphStateValue } from './graph-state'
import { buildSystemPromptText, toConversationMessages } from './model-message-builder'
import { contentToText } from './message-content'
import { handleRunError } from './run-error-handler'
import { RunEventPublisher } from './run-event-publisher'
import { RunRegistry } from './run-registry'
import type { ChatRuntimeDependencies, ChatContextProvider } from './types'
import type { ChatAgent } from './agent'

export class ChatRuntime {
  private readonly sessionStore = new SessionStore()
  private readonly runRegistry = new RunRegistry()
  private readonly eventPublisher = new RunEventPublisher()
  private readonly diagnosticControllers = new Map<string, AbortController>()
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
   * @description 启动一次不写入会话的 Agent 诊断运行，并向渲染进程发布执行事件。
   * @param request 当前角色、会话、模型配置、用户输入和本次工具开关。
   * @returns 已接受的诊断请求标识。
   * @remarks 诊断运行复用全局 Agent 策略；关闭工具时仅覆盖本次请求的可见工具包。
   */
  async startDiagnosticRun(request: ChatDiagnosticRunRequest): Promise<{ requestId: string }> {
    const userMessage = request.userMessage.trim()
    if (!userMessage) {
      throw new Error('Diagnostic run requires a non-empty user message.')
    }
    if (this.diagnosticControllers.has(request.requestId)) {
      throw new Error(`Diagnostic run already exists: ${request.requestId}`)
    }

    const agentPolicy = await this.chatContext.getAgentPolicy()
    const agentTools = request.toolsEnabled ? this.chatContext.getAgentToolNames(agentPolicy) : []
    const controller = new AbortController()
    this.diagnosticControllers.set(request.requestId, controller)
    this.eventPublisher.publishDiagnostic({
      type: 'started',
      requestId: request.requestId,
      toolsEnabled: request.toolsEnabled,
      agentTools
    })
    void this.executeDiagnosticRun({ ...request, userMessage }, controller, agentPolicy)
    return { requestId: request.requestId }
  }

  /**
   * @description 中断正在执行的诊断运行。
   * @param requestId 要中断的诊断请求标识。
   * @returns 找到并发出中断信号时返回 `true`。
   */
  abortDiagnosticRun(requestId: string): boolean {
    const controller = this.diagnosticControllers.get(requestId)
    if (!controller) {
      return false
    }

    controller.abort()
    return true
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

  /**
   * @description 在隔离的上下文中执行 Agent，并持续发布模型和工具诊断事件。
   * @param request 已校验的诊断运行请求。
   * @param controller 当前诊断运行的中断控制器。
   * @param agentPolicy 诊断启动时固定的全局 Agent 策略快照。
   * @remarks 不调用 SessionStore 的写入方法，避免诊断运行污染真实会话与记忆。
   */
  private async executeDiagnosticRun(
    request: ChatDiagnosticRunRequest,
    controller: AbortController,
    agentPolicy: AgentPolicy
  ): Promise<void> {
    const startedAt = Date.now()
    let sequence = 0
    let tokenUsage: ChatTokenUsage | undefined

    try {
      const profilesStore = await this.dependencies.getProfiles()
      const profile = profilesStore.profiles.find((item) => item.id === request.profileId)
      if (!profile) {
        throw new Error(`Profile not found: ${request.profileId}`)
      }

      const [character, promptDocument] = await Promise.all([
        this.dependencies.getCharacter(request.characterId),
        this.dependencies.getCharacterPrompt(request.characterId)
      ])
      const session = this.resolvePreviewSession(request.sessionId || null, request.characterId)
      const history = this.buildPreviewHistory(session, request.userMessage)
      const diagnosticSession = session || {
        id: `diagnostic-${request.requestId}`,
        characterId: request.characterId,
        messages: [],
        status: 'idle' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const policy = request.toolsEnabled
        ? session
          ? agentPolicy
          : { ...agentPolicy, memoryScope: 'none' as const }
        : { ...agentPolicy, enabledToolPackageIds: [] }
      const result = await this.agent({
        profile,
        history: toConversationMessages(history),
        systemPromptText: buildSystemPromptText(promptDocument.prompt),
        context: {
          character,
          session: diagnosticSession,
          policy,
          accessedResourceIds: new Set(),
          abortSignal: controller.signal
        },
        abortSignal: controller.signal,
        onChunk: () => {},
        onProviderRequest: (body, phase) => {
          sequence += 1
          this.eventPublisher.publishDiagnostic({
            type: 'llm-request',
            requestId: request.requestId,
            sequence,
            phase,
            body
          })
        },
        onModelResponse: (response, phase) => {
          const usage = getDiagnosticTokenUsage(response)
          if (usage) {
            tokenUsage = mergeDiagnosticTokenUsage(tokenUsage, usage)
          }
          this.eventPublisher.publishDiagnostic({
            type: 'llm-response',
            requestId: request.requestId,
            sequence,
            phase,
            content: contentToText(response.content),
            tool_calls: getDiagnosticToolCalls(response.tool_calls),
            ...(usage ? { usage } : {})
          })
        },
        onTrace: (trace) => {
          this.eventPublisher.publishDiagnostic({
            type: 'tool-result',
            requestId: request.requestId,
            round: trace.round,
            message: toDiagnosticToolMessage(trace)
          })
        }
      })

      this.eventPublisher.publishDiagnostic({
        type: 'completed',
        requestId: request.requestId,
        assistantDraft: result.assistantDraft,
        toolRounds: result.toolRounds,
        incomplete: result.incomplete,
        durationMs: Date.now() - startedAt,
        ...(tokenUsage ? { tokenUsage } : {})
      })
    } catch (cause) {
      if (controller.signal.aborted) {
        this.eventPublisher.publishDiagnostic({ type: 'aborted', requestId: request.requestId })
      } else {
        const error = cause instanceof Error ? cause.message : String(cause)
        void logger.error('ai', 'diagnostic-run-failed', 'Diagnostic Agent run failed', {
          requestId: request.requestId,
          error
        })
        this.eventPublisher.publishDiagnostic({
          type: 'error',
          requestId: request.requestId,
          error
        })
      }
    } finally {
      this.diagnosticControllers.delete(request.requestId)
    }
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

/**
 * @description 将模型原生工具调用转换为可跨进程传输的诊断数据。
 * @param calls 模型响应携带的工具调用。
 * @returns 可安全展示的工具调用数组。
 */
function getDiagnosticToolCalls(
  calls: Array<{ id?: string; name?: string; args?: unknown; type?: unknown }> | undefined
): ChatDiagnosticToolCall[] {
  return (calls || [])
    .filter((call) => typeof call.id === 'string' && typeof call.name === 'string')
    .map((call) => ({
      id: call.id as string,
      name: call.name as string,
      args:
        call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {},
      ...(typeof call.type === 'string' ? { type: call.type } : {})
    }))
}

/**
 * @description 将工具执行轨迹还原成最终模型请求实际携带的 tool message。
 * @param trace 单次工具调用的执行轨迹。
 * @returns 可在诊断界面展示的原生工具消息。
 */
function toDiagnosticToolMessage(trace: AgentToolTrace): ChatDiagnosticMessage {
  return {
    role: 'tool',
    tool_call_id: trace.toolCallId,
    name: trace.toolName,
    content: serializeDiagnosticToolOutput(trace.output)
  }
}

/**
 * @description 序列化工具输出，使诊断内容与模型接收的 ToolMessage 文本一致。
 * @param output 结构化工具输出。
 * @returns 稳定的 JSON 文本；无法序列化时返回失败状态文本。
 */
function serializeDiagnosticToolOutput(output: unknown): string {
  try {
    return JSON.stringify(output)
  } catch (cause) {
    return JSON.stringify({
      status: 'failed',
      error: `Unable to serialize tool result: ${cause instanceof Error ? cause.message : String(cause)}`
    })
  }
}

/**
 * @description 从 LangChain AI 消息中提取 provider 返回的标准 token 用量。
 * @param message 模型响应消息。
 * @returns provider 提供完整用量时返回标准结构，否则返回 `undefined`。
 */
function getDiagnosticTokenUsage(message: unknown): ChatTokenUsage | undefined {
  if (!message || typeof message !== 'object') {
    return undefined
  }

  const value = message as { usage_metadata?: unknown; response_metadata?: unknown }
  const responseMetadata =
    value.response_metadata && typeof value.response_metadata === 'object'
      ? (value.response_metadata as Record<string, unknown>)
      : undefined
  const usage =
    value.usage_metadata && typeof value.usage_metadata === 'object'
      ? (value.usage_metadata as Record<string, unknown>)
      : responseMetadata?.tokenUsage && typeof responseMetadata.tokenUsage === 'object'
        ? (responseMetadata.tokenUsage as Record<string, unknown>)
        : undefined

  if (!usage) {
    return undefined
  }

  const inputTokens = readTokenCount(usage.input_tokens ?? usage.promptTokens)
  const outputTokens = readTokenCount(usage.output_tokens ?? usage.completionTokens)
  const totalTokens = readTokenCount(usage.total_tokens ?? usage.totalTokens)
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? inputTokens + outputTokens
  }
}

/**
 * @description 将单次 provider 用量累加到诊断运行总计。
 * @param total 当前累计用量。
 * @param usage 本次模型调用用量。
 * @returns 累加后的用量。
 */
function mergeDiagnosticTokenUsage(
  total: ChatTokenUsage | undefined,
  usage: ChatTokenUsage
): ChatTokenUsage {
  return {
    inputTokens: (total?.inputTokens || 0) + usage.inputTokens,
    outputTokens: (total?.outputTokens || 0) + usage.outputTokens,
    totalTokens: (total?.totalTokens || 0) + usage.totalTokens
  }
}

/** @description 将未知 token 数转换为非负有限整数。 @param value 未知数值。 @returns 合法 token 数。 */
function readTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}
