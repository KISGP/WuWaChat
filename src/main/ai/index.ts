import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  CharacterPromptDocument,
  CharacterSummary,
  ChatRunAccepted,
  ChatRunRequest,
  ConversationSession
} from '../../shared/ai'
import {
  getBundledCharactersRoot,
  getCharacterPromptOverridePath,
  pathExists,
  readDirectoryNames,
  readImageDataUrl
} from '../utils'
import { AiRuntime } from './runtime'
import { MemoryService } from '../memory'

type CharacterResourceRecord = CharacterSummary & {
  prompt: string
  promptFileName: string
}

type CharacterResourceInfo = {
  name: { en?: string; cn?: string; jp?: string }
  description: { en?: string; cn?: string; jp?: string }
}

const PROMPT_FILE_NAME = 'prompt.md'
const AVATAR_FILE_NAME = 'avatar.png'
const CARD_BG_FILE_NAME = 'cardBg.png'
const INFO_FILE_NAME = 'info.json'

/**
 * @description 加载角色资源记录
 * @param id 角色ID
 * @returns 角色资源记录，如果角色不存在或资源不完整则返回null
 */
async function loadCharacterRecord(id: string): Promise<CharacterResourceRecord | null> {
  const characterDir = join(getBundledCharactersRoot(), id)
  const bundledPromptPath = join(characterDir, PROMPT_FILE_NAME)
  const overridePromptPath = getCharacterPromptOverridePath(id)
  const infoPath = join(characterDir, INFO_FILE_NAME)

  if (!(await pathExists(bundledPromptPath)) || !(await pathExists(infoPath))) {
    return null
  }

  const promptPath = (await pathExists(overridePromptPath)) ? overridePromptPath : bundledPromptPath
  const prompt = await readFile(promptPath, 'utf-8')
  const avatarPath = join(characterDir, AVATAR_FILE_NAME)
  const cardPath = join(characterDir, CARD_BG_FILE_NAME)
  const info = JSON.parse(await readFile(infoPath, 'utf-8')) as CharacterResourceInfo

  return {
    id,
    name: info.name.cn ?? id,
    description: info.description.cn ?? '',
    prompt,
    promptFileName: PROMPT_FILE_NAME,
    avatar: (await pathExists(avatarPath)) ? await readImageDataUrl(avatarPath) : '',
    cardBg: (await pathExists(cardPath)) ? await readImageDataUrl(cardPath) : undefined
  }
}

async function loadCharacterResource(characterId: string): Promise<CharacterResourceRecord> {
  const character = await loadCharacterRecord(characterId)

  if (!character) {
    throw new Error(`Character not found: ${characterId}`)
  }

  return character
}

export async function getCharacters(): Promise<CharacterSummary[]> {
  const characterIds = await readDirectoryNames(getBundledCharactersRoot())
  const characters = await Promise.all(characterIds.map((id) => loadCharacterRecord(id)))

  return characters
    .filter((character): character is CharacterResourceRecord => Boolean(character))
    .map((character) => ({
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      cardBg: character.cardBg
    }))
}

export async function getCharacterPrompt(characterId: string): Promise<CharacterPromptDocument> {
  const character = await loadCharacterResource(characterId)

  return {
    characterId: character.id,
    prompt: character.prompt,
    promptFileName: character.promptFileName
  }
}

export async function saveCharacterPrompt(
  characterId: string,
  promptText: string
): Promise<CharacterPromptDocument> {
  const character = await loadCharacterResource(characterId)
  const targetPath = getCharacterPromptOverridePath(characterId)

  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, promptText, 'utf-8')

  return {
    characterId,
    prompt: promptText,
    promptFileName: character.promptFileName
  }
}

const memoryService = new MemoryService()

const runtime = new AiRuntime(
  {
    getCharacter: async (characterId) => {
      const character = await loadCharacterResource(characterId)

      return {
        id: character.id,
        name: character.name,
        avatar: character.avatar,
        cardBg: character.cardBg
      }
    },
    getCharacterPrompt: async (characterId) => {
      const character = await loadCharacterResource(characterId)

      return {
        characterId: character.id,
        prompt: character.prompt
      }
    }
  },
  memoryService
)

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
