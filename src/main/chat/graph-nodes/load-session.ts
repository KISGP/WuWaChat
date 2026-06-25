import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createLoadSessionNode(context: ChatGraphNodeContext) {
  return (state: GraphStateValue) => {
    const session = context.sessionStore.getSession(state.sessionId)
    if (!session) {
      throw new Error(`Session not found: ${state.sessionId}`)
    }

    return { session }
  }
}
