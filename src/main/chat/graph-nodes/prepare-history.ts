import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createPrepareHistoryNode(context: ChatGraphNodeContext) {
  return (state: GraphStateValue) => ({
    history: state.session.messages
      .filter(
        (message) =>
          message.id !== state.assistantMessageId &&
          Boolean(message.content.trim()) &&
          (message.role === 'user' || message.status !== 'pending')
      )
      .slice(-context.chatContext.getRecentMessageCount())
  })
}
