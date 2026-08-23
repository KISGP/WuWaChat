import type { CharacterSummary, ConversationSession } from '@shared/chat'
import type { ProfilesStore } from '@shared/model-settings'
import type { AgentPolicy } from '@shared/agent'

export type CharacterPromptRecord = {
  characterId: string
  prompt: string
}

export type ChatRuntimeDependencies = {
  getCharacter: (characterId: string) => Promise<CharacterSummary>
  getCharacterPrompt: (characterId: string) => Promise<CharacterPromptRecord>
  getProfiles: () => Promise<ProfilesStore>
}

export type ChatContextProvider = {
  getRecentMessageCount: () => number
  getAgentPolicy: () => Promise<AgentPolicy>
  getAgentToolNames: (policy: AgentPolicy) => string[]
  syncSessions: (sessions: ConversationSession[]) => void
}
