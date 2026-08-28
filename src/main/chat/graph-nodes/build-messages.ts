import type { GraphStateValue } from '@main/chat/graph-state'
import { buildSystemPromptText, toConversationMessages } from '@main/chat/model-message-builder'

export function createBuildMessagesNode() {
  return (state: GraphStateValue) => ({
    systemPromptText: buildSystemPromptText(state.prompt),
    llmMessages: toConversationMessages(state.history, {
      messageIds: new Set(state.currentMessageIds),
      images: state.currentImages
    })
  })
}
