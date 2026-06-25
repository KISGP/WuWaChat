import type { GraphStateValue } from '@main/chat/graph-state'
import { toModelMessages } from '@main/chat/model-message-builder'

export function createBuildMessagesNode() {
  return (state: GraphStateValue) => ({
    llmMessages: toModelMessages(state.prompt, state.history, state.retrievalContext)
  })
}
