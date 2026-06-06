import { logger } from '@main/logging'
import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createCommitAssistantMessageNode(context: ChatGraphNodeContext) {
  return (state: GraphStateValue) => {
    const syncedSession = context.sessionStore.completeRun(
      state.sessionId,
      state.assistantMessageId,
      state.assistantDraft
    )
    context.chatContext.syncSessions(context.sessionStore.getSessions())
    const message =
      context.sessionStore.getMessage(state.sessionId, state.assistantMessageId) ||
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
