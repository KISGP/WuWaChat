import type { ChatRunAccepted, ChatRunRequest, ConversationSession } from '@shared/chat'
import { logger } from '@main/logging'
import { SessionStore } from './session-store'
import { createAiGraph } from './graph-factory'
import type { GraphStateValue } from './graph-state'
import { handleRunError } from './run-error-handler'
import { RunEventPublisher } from './run-event-publisher'
import { RunRegistry } from './run-registry'
import type { ChatRuntimeDependencies, ChatContextProvider } from './types'

export class ChatRuntime {
  private readonly sessionStore = new SessionStore()
  private readonly runRegistry = new RunRegistry()
  private readonly eventPublisher = new RunEventPublisher()
  private readonly graph

  constructor(
    dependencies: ChatRuntimeDependencies,
    private readonly chatContext: ChatContextProvider
  ) {
    this.graph = createAiGraph({
      dependencies,
      chatContext: this.chatContext,
      sessionStore: this.sessionStore,
      runRegistry: this.runRegistry,
      eventPublisher: this.eventPublisher
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
