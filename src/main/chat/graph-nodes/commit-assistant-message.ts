import { logger } from '@main/logging'
import { splitAssistantMessageSegments } from '@main/chat/assistant-message-splitter'
import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createCommitAssistantMessageNode(context: ChatGraphNodeContext) {
  return (state: GraphStateValue) => {
    const segments = splitAssistantMessageSegments(
      state.assistantDraft,
      new Set(state.characterEmoticons.map((item) => item.id))
    )
    if (segments.length === 0) {
      const session = context.sessionStore.completeEmptyAssistantRun(
        state.sessionId,
        state.assistantMessageId
      )
      context.chatContext.syncSessions(context.sessionStore.getSessions())
      context.eventPublisher.publish({
        type: 'session-synced',
        requestId: state.requestId,
        session
      })
      context.eventPublisher.publish({
        type: 'run-finished',
        requestId: state.requestId,
        sessionId: state.sessionId,
        messageId: state.assistantMessageId
      })
      return { session }
    }
    const syncedSession = context.sessionStore.syncAssistantRunMessages(
      state.sessionId,
      state.assistantMessageId,
      segments,
      new Map(state.characterEmoticons.map((item) => [item.id, item.description] as const)),
      'complete',
      'idle',
      'immediate'
    )
    context.chatContext.syncSessions(context.sessionStore.getSessions())
    const message =
      [...syncedSession.messages].reverse().find((item) => item.role === 'assistant') ||
      syncedSession.messages[syncedSession.messages.length - 1]

    context.eventPublisher.publish({
      type: 'message-updated',
      requestId: state.requestId,
      sessionId: state.sessionId,
      message
    })
    context.eventPublisher.publish({
      type: 'session-synced',
      requestId: state.requestId,
      session: syncedSession
    })
    context.eventPublisher.publish({
      type: 'run-finished',
      requestId: state.requestId,
      sessionId: state.sessionId,
      messageId: state.assistantMessageId
    })

    const activeRun = context.runRegistry.get(state.requestId)
    void logger.info('ai', 'run-finished', 'Chat run finished', {
      requestId: state.requestId,
      sessionId: state.sessionId,
      messageId: state.assistantMessageId,
      durationMs: activeRun ? Date.now() - activeRun.startedAt : undefined,
      chunkCount: activeRun?.chunkCount ?? 0,
      charCount: activeRun?.charCount ?? state.assistantDraft.length
    })

    return { session: syncedSession }
  }
}
