import type { CharacterSummary, ConversationSession, ModelProfile } from '@shared/chat'
import type { LoreRouteDecision } from '@shared/lore'
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
  loreRoute: LoreRouteDecision | null
  runtimeSummary: MemoryDebugRuntimeSummary
}

export type ChatContextProvider = {
  getRecentMessageCount: () => number
  retrieveLoreContext: (
    query: string,
    character: CharacterSummary,
    history: ConversationSession['messages'],
    profile: ModelProfile,
    abortSignal?: AbortSignal
  ) => Promise<Pick<PromptContextPreview, 'storyHits' | 'glossaryHits'>>
  retrieveChatMemoryContext: (
    query: string,
    session: ConversationSession
  ) => Promise<MemoryDebugRetrievalHit[]>
  previewPromptContext: (
    query: string,
    character: CharacterSummary,
    session: ConversationSession | null,
    profile: ModelProfile
  ) => Promise<PromptContextPreview>
  syncSessions: (sessions: ConversationSession[]) => void
}
