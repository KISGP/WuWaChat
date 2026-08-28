import type { CharacterSummary, ConversationSession } from '@shared/chat'
import type { ChatEmoticonImage } from '@shared/chat-emoticons'
import type { ProfilesStore } from '@shared/model-settings'
import type { AgentPolicy } from '@shared/agent'

export type CharacterPromptRecord = {
  characterId: string
  prompt: string
}

export type ChatRuntimeDependencies = {
  getCharacter: (characterId: string) => Promise<CharacterSummary>
  getCharacterEmoticons: (characterId: string) => Promise<ChatEmoticonImage[]>
  getCharacterPrompt: (characterId: string) => Promise<CharacterPromptRecord>
  getProfiles: () => Promise<ProfilesStore>
}

export type ChatContextProvider = {
  getRecentMessageCount: () => number
  getAgentPolicy: () => Promise<AgentPolicy>
  getAgentToolNames: (policy: AgentPolicy) => string[]
  syncSessions: (sessions: ConversationSession[]) => void
}
