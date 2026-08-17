import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'
import { formatRetrievalContextHit } from '@main/chat/model-message-builder'

export function createRetrieveContextNode(context: ChatGraphNodeContext) {
  return async (state: GraphStateValue) => {
    const [loreContext, chatMemoryContext] = await Promise.all([
      context.chatContext.retrieveLoreContext(
        state.userMessage,
        state.character,
        state.history,
        state.profile,
        state.abortSignal
      ),
      context.chatContext.retrieveChatMemoryContext(state.userMessage, state.session)
    ])

    return {
      retrievalContext: [
        ...loreContext.glossaryHits.map(formatRetrievalContextHit),
        ...loreContext.storyHits.map(formatRetrievalContextHit),
        ...chatMemoryContext.map(formatRetrievalContextHit)
      ]
    }
  }
}
