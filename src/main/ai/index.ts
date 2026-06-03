import type { ChatRunAccepted, ChatRunRequest, ConversationSession } from '../../shared/ai'
import {
  getCharacterPrompt,
  getCharacterSummaryById,
  getCharacters,
  saveCharacterPrompt
} from '../characters'
import { MemoryService } from '../memory'
import { AiRuntime } from './runtime'

const memoryService = new MemoryService()

const runtime = new AiRuntime(
  {
    getCharacter: async (characterId) => getCharacterSummaryById(characterId),
    getCharacterPrompt: async (characterId) => getCharacterPrompt(characterId)
  },
  memoryService
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
