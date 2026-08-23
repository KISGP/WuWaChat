import { SystemMessage } from '@langchain/core/messages'
import { logger } from '@main/logging'
import type { GraphStateValue } from '@main/chat/graph-state'
import { contentToText } from '@main/chat/message-content'
import { toLoggableMessages } from '@main/chat/model-message-builder'

export function createLogModelInputNode() {
  return async (state: GraphStateValue) => {
    const modelMessages = [new SystemMessage(state.systemPromptText), ...state.llmMessages]
    const chatMessages = toLoggableMessages(modelMessages)
    const systemPromptText = contentToText(modelMessages[0].content)

    await logger.info('ai', 'run-model-input-built', 'Built chat model input', {
      requestId: state.requestId,
      sessionId: state.sessionId,
      characterId: state.characterId,
      profileId: state.profileId,
      messageCount: modelMessages.length,
      historyMessageCount: state.history.length,
      systemPromptText,
      chatMessages,
      modelInput: {
        systemPromptText,
        chatMessages
      }
    })

    return {}
  }
}
