import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'
import { formatRetrievalContextHit } from '@main/chat/model-message-builder'

export function createRetrieveContextNode(context: ChatGraphNodeContext) {
  return async (state: GraphStateValue) => {
    const [storyContext, glossaryContext, chatMemoryContext] = await Promise.all([
      context.chatContext.retrieveStoryContext(state.userMessage),
      context.chatContext.retrieveGlossaryContext(state.userMessage),
      context.chatContext.retrieveChatMemoryContext(state.userMessage, state.session)
    ])

    return {
      retrievalContext: [
        ...glossaryContext.map(formatRetrievalContextHit),
        ...storyContext.map(formatRetrievalContextHit),
        ...chatMemoryContext.map(formatRetrievalContextHit)
      ]
    }
  }
}
