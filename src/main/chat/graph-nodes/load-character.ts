import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createLoadCharacterNode(context: ChatGraphNodeContext) {
  return async (state: GraphStateValue) => ({
    character: await context.dependencies.getCharacter(state.characterId)
  })
}
