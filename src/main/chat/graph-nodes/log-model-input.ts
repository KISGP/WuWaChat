import { SystemMessage } from '@langchain/core/messages'
import { logger } from '@main/logging'
import type { GraphStateValue } from '@main/chat/graph-state'
import { contentToText } from '@main/chat/message-content'
import { toLoggableMessages } from '@main/chat/model-message-builder'

export function createLogModelInputNode() {
  return async (state: GraphStateValue) => {
    const chatMessages = toLoggableMessages(state.llmMessages)
    const systemPromptText = state.llmMessages
      .filter((message) => message instanceof SystemMessage)
      .map((message) => contentToText(message.content))
      .filter(Boolean)
      .join('\n\n')
    const retrievalContextText = state.retrievalContext.join('\n\n')

    await logger.info('ai', 'run-model-input-built', 'Built chat model input', {
      requestId: state.requestId,
      sessionId: state.sessionId,
      characterId: state.characterId,
      profileId: state.profileId,
      messageCount: state.llmMessages.length,
      historyMessageCount: state.history.length,
      retrievalContextCount: state.retrievalContext.length,
      systemPromptText,
      retrievalContextText,
      chatMessages,
      modelInput: {
        systemPromptText,
        retrievalContextText,
        chatMessages
      }
    })

    return {}
  }
}
