import type { CharacterSummary, ConversationSession } from '@shared/chat'
import type { ProfilesStore } from '@shared/model-settings'

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
  retrieveWorldContext: (query: string) => Promise<string[]>
  retrieveMemoryContext: (query: string, session: ConversationSession) => Promise<string[]>
  syncSessions: (sessions: ConversationSession[]) => void
}
