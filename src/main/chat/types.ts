import type { CharacterSummary, ConversationSession } from '@shared/chat'
import type { MemoryDebugRetrievalHit, MemoryDebugRuntimeSummary } from '@shared/memory-settings'
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

export type PromptContextPreview = {
  storyHits: MemoryDebugRetrievalHit[]
  glossaryHits: MemoryDebugRetrievalHit[]
  chatMemoryHits: MemoryDebugRetrievalHit[]
  runtimeSummary: MemoryDebugRuntimeSummary
}

export type ChatContextProvider = {
  getRecentMessageCount: () => number
  retrieveStoryContext: (query: string) => Promise<MemoryDebugRetrievalHit[]>
  retrieveGlossaryContext: (query: string) => Promise<MemoryDebugRetrievalHit[]>
  retrieveChatMemoryContext: (
    query: string,
    session: ConversationSession
  ) => Promise<MemoryDebugRetrievalHit[]>
  previewPromptContext: (
    query: string,
    session: ConversationSession | null
  ) => Promise<PromptContextPreview>
  syncSessions: (sessions: ConversationSession[]) => void
}
