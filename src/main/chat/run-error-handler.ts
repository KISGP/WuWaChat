import { logger } from '@main/logging'
import type { SessionStore } from './session-store'
import type { RunEventPublisher } from './run-event-publisher'
import type { ActiveRun } from './run-registry'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

type RunErrorHandlerContext = {
  sessionStore: SessionStore
  eventPublisher: RunEventPublisher
}

export async function handleRunError(
  requestId: string,
  error: unknown,
  activeRun: ActiveRun,
  context: RunErrorHandlerContext
): Promise<void> {
  if (activeRun.controller.signal.aborted || isAbortError(error)) {
    const abortedSession = context.sessionStore.abortRun(activeRun.sessionId, activeRun.messageId)
    context.eventPublisher.publish({
      type: 'message-updated',
      requestId,
      sessionId: abortedSession.id,
      message:
        context.sessionStore.getMessage(activeRun.sessionId, activeRun.messageId) ||
        abortedSession.messages[abortedSession.messages.length - 1]
    })
    context.eventPublisher.publish({
      type: 'session-synced',
      requestId,
      session: abortedSession
    })
    context.eventPublisher.publish({
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
    return
  }

  const failedSession = context.sessionStore.failRun(
    activeRun.sessionId,
    activeRun.messageId,
    error instanceof Error ? error.message : String(error)
  )
  context.eventPublisher.publish({
    type: 'message-updated',
    requestId,
    sessionId: failedSession.id,
    message:
      context.sessionStore.getMessage(activeRun.sessionId, activeRun.messageId) ||
      failedSession.messages[failedSession.messages.length - 1]
  })
  context.eventPublisher.publish({
    type: 'session-synced',
    requestId,
    session: failedSession
  })
  context.eventPublisher.publish({
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
