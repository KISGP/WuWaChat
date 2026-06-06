import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createRetrieveContextNode(context: ChatGraphNodeContext) {
  return async (state: GraphStateValue) => ({
    retrievalContext: [
      ...(await context.chatContext.retrieveWorldContext(state.userMessage)),
      ...(await context.chatContext.retrieveMemoryContext(state.userMessage, state.session))
    ]
  })
}
