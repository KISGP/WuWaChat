import { createChatModel } from '@main/chat/model-factory'
import { contentToText } from '@main/chat/message-content'
import {
  splitAssistantMessages,
  splitStreamingAssistantMessages
} from '@main/chat/assistant-message-splitter'
import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createInvokeModelNode(context: ChatGraphNodeContext) {
  return async (state: GraphStateValue) => {
    const model = createChatModel(state.profile)
    const stream = await model.stream(state.llmMessages, {
      signal: state.abortSignal
    })

    let assistantDraft = ''

    for await (const chunk of stream) {
      const text = contentToText(chunk.content)
      if (!text) {
        continue
      }

      assistantDraft += text
      context.runRegistry.trackChunk(state.requestId, text)
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

    if (splitAssistantMessages(assistantDraft).length === 0) {
      throw new Error('Model returned no displayable text output.')
    }

    return { assistantDraft }
  }
}
