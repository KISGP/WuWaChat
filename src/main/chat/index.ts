import type { ChatRunAccepted, ChatRunRequest, ConversationSession } from '@shared/chat'
import {
  getCharacterPrompt,
  getCharacterSummaryById,
  getCharacters,
  saveCharacterPrompt
} from '@main/characters'
import { MemoryService } from '@main/memory'
import { getProfiles } from '@main/settings'
import { ChatRuntime } from './runtime'

const memoryService = new MemoryService()

const runtime = new ChatRuntime(
  {
    getCharacter: async (characterId) => getCharacterSummaryById(characterId),
    getCharacterPrompt: async (characterId) => getCharacterPrompt(characterId),
    getProfiles
  },
  {
    getRecentMessageCount: () => memoryService.getRecentMessageCount(),
    retrieveWorldContext: (query) => memoryService.retrieveWorldContext(query),
    retrieveMemoryContext: (query, session) => memoryService.retrieveMemoryContext(query, session),
    syncSessions: (sessions) => memoryService.syncSessions(sessions)
  }
)

export { getCharacters, getCharacterPrompt, saveCharacterPrompt }

export async function initializeAi(): Promise<void> {
  await memoryService.initialize()
  await runtime.initialize()
}

export function getSessions(): ConversationSession[] {
  return runtime.getSessions()
}

export function sendMessage(request: ChatRunRequest): ChatRunAccepted {
  return runtime.sendMessage(request)
}

export function abortRun(requestId: string): boolean {
  return runtime.abortRun(requestId)
}

export function getMemoryService(): MemoryService {
  return memoryService
}
