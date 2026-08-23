import { splitStreamingAssistantMessages } from '@main/chat/assistant-message-splitter'
import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createInvokeModelNode(context: ChatGraphNodeContext) {
  return async (state: GraphStateValue) => {
    let assistantDraft = ''
    const result = await context.agent({
      profile: state.profile,
      history: state.llmMessages,
      systemPromptText: state.systemPromptText,
      context: {
        character: state.character,
        session: state.session,
        policy: await context.chatContext.getAgentPolicy(),
        accessedResourceIds: new Set(),
        abortSignal: state.abortSignal
      },
      abortSignal: state.abortSignal,
      onChunk: (text) => {
        assistantDraft += text
        const assistantMessages = splitStreamingAssistantMessages(assistantDraft)
        const syncedSession = context.sessionStore.syncAssistantRunMessages(
          state.sessionId,
          state.assistantMessageId,
          assistantMessages,
          'streaming'
        )
        const message =
          [...syncedSession.messages].reverse().find((item) => item.role === 'assistant') ||
          syncedSession.messages[syncedSession.messages.length - 1]

        context.runRegistry.trackChunk(state.requestId, text)
        context.eventPublisher.publish({
          type: 'chunk',
          requestId: state.requestId,
          sessionId: state.sessionId,
          messageId: state.assistantMessageId,
          chunk: text
        })
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
      }
    })

    if (!assistantDraft && result.assistantDraft) {
      assistantDraft = result.assistantDraft
    }

    if (!assistantDraft.trim()) {
      throw new Error('Model returned no displayable text output.')
    }

    return { assistantDraft }
  }
}
