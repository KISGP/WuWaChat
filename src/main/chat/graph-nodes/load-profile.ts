import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createLoadProfileNode(context: ChatGraphNodeContext) {
  return async (state: GraphStateValue) => {
    const store = await context.dependencies.getProfiles()
    const profile = store.profiles.find((item) => item.id === state.profileId)

    if (!profile) {
      throw new Error(`Profile not found: ${state.profileId}`)
    }

    return { profile }
  }
}
