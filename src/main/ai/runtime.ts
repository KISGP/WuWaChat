import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { BrowserWindow } from 'electron'
import type {
  CharacterSummary,
  ChatRunAccepted,
  ChatRunEvent,
  ChatRunRequest,
  ConversationMessage,
  ConversationSession,
  ModelProfile
} from '../../shared/ai'
import { getProfiles } from '../settings'
import { logger } from '../logger'
import { createChatModel } from './model-factory'
import { SessionStore } from './session-store'
import { MemoryService } from '../memory'

type CharacterPromptRecord = {
  characterId: string
  prompt: string
}

type RuntimeDependencies = {
  getCharacter: (characterId: string) => Promise<CharacterSummary>
  getCharacterPrompt: (characterId: string) => Promise<CharacterPromptRecord>
}

const GraphState = Annotation.Root({
  requestId: Annotation<string>,
  sessionId: Annotation<string>,
  assistantMessageId: Annotation<string>,
  profileId: Annotation<string>,
  characterId: Annotation<string>,
  userMessage: Annotation<string>,
  profile: Annotation<ModelProfile>,
  session: Annotation<ConversationSession>,
  character: Annotation<CharacterSummary>,
  prompt: Annotation<string>,
  history: Annotation<ConversationMessage[]>(),
  retrievalContext: Annotation<string[]>(),
  llmMessages: Annotation<BaseMessage[]>(),
  assistantDraft: Annotation<string>,
  abortSignal: Annotation<AbortSignal>
})

type GraphStateValue = typeof GraphState.State

function emitRunEvent(event: ChatRunEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('ai:run:event', event)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part
      }

      if (!part || typeof part !== 'object') {
        return ''
      }

      const data = part as { text?: unknown; content?: unknown }
      if (typeof data.text === 'string') {
        return data.text
      }

      return typeof data.content === 'string' ? data.content : ''
    })
    .join('')
}

function toModelMessages(prompt: string, history: ConversationMessage[], retrievalContext: string[]): BaseMessage[] {
  const systemSections = [prompt.trim()]

  if (retrievalContext.length > 0) {
    systemSections.push(`Relevant context:\n${retrievalContext.join('\n\n')}`)
  }

  const messages: BaseMessage[] = []
  const systemPrompt = systemSections.filter(Boolean).join('\n\n')
  if (systemPrompt) {
    messages.push(new SystemMessage(systemPrompt))
  }

  for (const message of history) {
    if (!message.content.trim()) continue

    messages.push(
      message.role === 'assistant'
        ? new AIMessage(message.content)
        : new HumanMessage(message.content)
    )
  }

  return messages
}

export class AiRuntime {
  private readonly sessionStore = new SessionStore()
  private readonly controllers = new Map<
    string,
    {
      controller: AbortController
      sessionId: string
      messageId: string
      startedAt: number
      chunkCount: number
      charCount: number
    }
  >()
  private readonly graph

  constructor(
    private readonly dependencies: RuntimeDependencies,
    private readonly memoryService: MemoryService
  ) {
    this.graph = this.buildGraph()
  }

  async initialize(): Promise<void> {
    await this.sessionStore.initialize()
    this.memoryService.setSessions(this.sessionStore.getSessions())
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
    const controller = new AbortController()

    this.controllers.set(request.requestId, {
      controller,
      sessionId: session.id,
      messageId: assistantMessage.id,
      startedAt: Date.now(),
      chunkCount: 0,
      charCount: 0
    })

    void logger.info('ai', 'run-accepted', 'Accepted chat run request', {
      requestId: request.requestId,
      sessionId: session.id,
      characterId: request.characterId,
      profileId: request.profileId,
      messageId: assistantMessage.id,
      messageLength: request.userMessage.length
    })

    emitRunEvent({
      type: 'session-synced',
      requestId: request.requestId,
      session
    })
    emitRunEvent({
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
    this.memoryService.setSessions(this.sessionStore.getSessions())

    void this.executeRun({
      requestId: request.requestId,
      sessionId: session.id,
      assistantMessageId: assistantMessage.id,
      profileId: request.profileId,
      characterId: request.characterId,
      userMessage: request.userMessage,
      assistantDraft: '',
      abortSignal: controller.signal
    })

    return {
      requestId: request.requestId,
      sessionId: session.id,
      messageId: assistantMessage.id
    }
  }

  abortRun(requestId: string): boolean {
    const activeRun = this.controllers.get(requestId)
    if (!activeRun) {
      return false
    }

    activeRun.controller.abort()
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
    const activeRun = this.controllers.get(requestId)

    if (!activeRun) {
      return
    }

    try {
      await this.graph.invoke(input)
    } catch (error) {
      if (activeRun.controller.signal.aborted || isAbortError(error)) {
        const abortedSession = this.sessionStore.abortRun(activeRun.sessionId, activeRun.messageId)
        emitRunEvent({
          type: 'message-updated',
          requestId,
          sessionId: abortedSession.id,
          message:
            this.sessionStore.getMessage(activeRun.sessionId, activeRun.messageId) ||
            abortedSession.messages[abortedSession.messages.length - 1]
        })
        emitRunEvent({
          type: 'session-synced',
          requestId,
          session: abortedSession
        })
        emitRunEvent({
          type: 'run-aborted',
          requestId,
          sessionId: abortedSession.id,
          messageId: activeRun.messageId
        })
        void logger.warn('ai', 'run-aborted', 'Chat run aborted', {
          requestId,
          sessionId: abortedSession.id,
          messageId: activeRun.messageId,
          durationMs: Date.now() - activeRun.startedAt,
          chunkCount: activeRun.chunkCount,
          charCount: activeRun.charCount
        })
      } else {
        const failedSession = this.sessionStore.failRun(
          activeRun.sessionId,
          activeRun.messageId,
          error instanceof Error ? error.message : String(error)
        )
        emitRunEvent({
          type: 'message-updated',
          requestId,
          sessionId: failedSession.id,
          message:
            this.sessionStore.getMessage(activeRun.sessionId, activeRun.messageId) ||
            failedSession.messages[failedSession.messages.length - 1]
        })
        emitRunEvent({
          type: 'session-synced',
          requestId,
          session: failedSession
        })
        emitRunEvent({
          type: 'run-error',
          requestId,
          sessionId: failedSession.id,
          messageId: activeRun.messageId,
          error: error instanceof Error ? error.message : String(error)
        })
        void logger.error('ai', 'run-error', 'Chat run failed', {
          requestId,
          sessionId: failedSession.id,
          messageId: activeRun.messageId,
          durationMs: Date.now() - activeRun.startedAt,
          chunkCount: activeRun.chunkCount,
          charCount: activeRun.charCount,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    } finally {
      this.controllers.delete(requestId)
    }
  }

  private buildGraph(): {
    invoke: (input: Partial<GraphStateValue>) => Promise<unknown>
  } {
    return new StateGraph(GraphState)
      .addNode('loadProfile', async (state) => {
        const store = await getProfiles()
        const profile = store.profiles.find((item) => item.id === state.profileId)

        if (!profile) {
          throw new Error(`Profile not found: ${state.profileId}`)
        }

        return { profile }
      })
      .addNode('loadSession', (state) => {
        const session = this.sessionStore.getSession(state.sessionId)
        if (!session) {
          throw new Error(`Session not found: ${state.sessionId}`)
        }

        return { session }
      })
      .addNode('loadCharacter', async (state) => ({
        character: await this.dependencies.getCharacter(state.characterId)
      }))
      .addNode('loadPrompt', async (state) => {
        const promptDocument = await this.dependencies.getCharacterPrompt(state.characterId)
        return { prompt: promptDocument.prompt }
      })
      .addNode('prepareHistory', (state) => ({
        history: state.session.messages.filter(
          (message) =>
            message.id !== state.assistantMessageId &&
            Boolean(message.content.trim()) &&
            (message.role === 'user' || message.status !== 'pending')
        ).slice(-this.memoryService.getRecentMessageCount())
      }))
      .addNode('retrieveContext', async (state) => ({
        retrievalContext: [
          ...(await this.memoryService.retrieveWorldContext(state.userMessage)),
          ...(await this.memoryService.retrieveMemoryContext(state.userMessage, state.session))
        ]
      }))
      .addNode('buildMessages', (state) => ({
        llmMessages: toModelMessages(state.prompt, state.history, state.retrievalContext)
      }))
      .addNode('invokeModel', async (state) => {
        const model = createChatModel(state.profile)
        const stream = await model.stream(state.llmMessages, {
          signal: state.abortSignal
        })

        let assistantDraft = ''
        const activeRun = this.controllers.get(state.requestId)

        for await (const chunk of stream) {
          const text = contentToText(chunk.content)
          if (!text) {
            continue
          }

          assistantDraft += text
          if (activeRun) {
            activeRun.chunkCount += 1
            activeRun.charCount += text.length
          }
          const syncedSession = this.sessionStore.updateAssistantMessage(
            state.sessionId,
            state.assistantMessageId,
            assistantDraft
          )
          const message =
            this.sessionStore.getMessage(state.sessionId, state.assistantMessageId) ||
            syncedSession.messages[syncedSession.messages.length - 1]

          emitRunEvent({
            type: 'chunk',
            requestId: state.requestId,
            sessionId: state.sessionId,
            messageId: state.assistantMessageId,
            chunk: text
          })
          emitRunEvent({
            type: 'message-updated',
            requestId: state.requestId,
            sessionId: state.sessionId,
            message
          })
          emitRunEvent({
            type: 'session-synced',
            requestId: state.requestId,
            session: syncedSession
          })
        }

        return { assistantDraft }
      })
      .addNode('commitAssistantMessage', (state) => {
        const syncedSession = this.sessionStore.completeRun(
          state.sessionId,
          state.assistantMessageId,
          state.assistantDraft
        )
        this.memoryService.setSessions(this.sessionStore.getSessions())
        const message =
          this.sessionStore.getMessage(state.sessionId, state.assistantMessageId) ||
          syncedSession.messages[syncedSession.messages.length - 1]

        emitRunEvent({
          type: 'message-updated',
          requestId: state.requestId,
          sessionId: state.sessionId,
          message
        })
        emitRunEvent({
          type: 'session-synced',
          requestId: state.requestId,
          session: syncedSession
        })
        emitRunEvent({
          type: 'run-finished',
          requestId: state.requestId,
          sessionId: state.sessionId,
          messageId: state.assistantMessageId
        })
        const activeRun = this.controllers.get(state.requestId)
        void logger.info('ai', 'run-finished', 'Chat run finished', {
          requestId: state.requestId,
          sessionId: state.sessionId,
          messageId: state.assistantMessageId,
          durationMs: activeRun ? Date.now() - activeRun.startedAt : undefined,
          chunkCount: activeRun?.chunkCount ?? 0,
          charCount: activeRun?.charCount ?? state.assistantDraft.length
        })

        return { session: syncedSession }
      })
      .addEdge(START, 'loadProfile')
      .addEdge('loadProfile', 'loadSession')
      .addEdge('loadSession', 'loadCharacter')
      .addEdge('loadCharacter', 'loadPrompt')
      .addEdge('loadPrompt', 'prepareHistory')
      .addEdge('prepareHistory', 'retrieveContext')
      .addEdge('retrieveContext', 'buildMessages')
      .addEdge('buildMessages', 'invokeModel')
      .addEdge('invokeModel', 'commitAssistantMessage')
      .addEdge('commitAssistantMessage', END)
      .compile()
  }
}
