import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createLoadPromptNode(context: ChatGraphNodeContext) {
  return async (state: GraphStateValue) => {
    const promptDocument = await context.dependencies.getCharacterPrompt(state.characterId)
    return { prompt: promptDocument.prompt }
  }
}
