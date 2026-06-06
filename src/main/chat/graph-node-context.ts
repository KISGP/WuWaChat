import type { ChatContextProvider, ChatRuntimeDependencies } from './types'
import type { SessionStore } from './session-store'
import type { RunRegistry } from './run-registry'
import type { RunEventPublisher } from './run-event-publisher'

export type ChatGraphNodeContext = {
  dependencies: ChatRuntimeDependencies
  chatContext: ChatContextProvider
  sessionStore: SessionStore
  runRegistry: RunRegistry
  eventPublisher: RunEventPublisher
}
