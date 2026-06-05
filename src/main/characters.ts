import { mkdir, readFile, writeFile } from 'fs/promises'
import type {
  CharacterCatalog,
  CharacterInfo,
  CharacterPromptDocument,
  CharacterSource,
  CharacterSummary,
  LocalCharacterEntry,
  RemoteCharacterEntry
} from '../shared/ai'
import {
  getCharacterAvatarPath,
  getCharactersCachePath,
  getCharacterCardBgPath,
  getCharacterDirectoryPath,
  getCharacterInfoPath,
  getCharacterManifestPath,
  getCharacterPromptPath,
  getCharactersRoot,
  joinUrl,
  pathExists,
  readDirectoryNames,
  readImageDataUrl,
  readOptionalFile,
  writeJsonFileAtomic
} from './utils'

type LocalCharacterManifest = {
  source: CharacterSource
}

type LocalCharacterRecord = LocalCharacterEntry & {
  prompt: string
  promptFileName: string
}

type RemoteCharacterRecord = {
  id: string
  info: CharacterInfo
}

type RemoteCharacterCacheDocument = {
  updatedAt: string | null
  characters: RemoteCharacterRecord[]
}

const PROMPT_FILE_NAME = 'prompt.md'
const CHARACTER_REPO_API_URL = 'https://api.github.com/repos/KISGP/WuWaChatChars'
const REMOTE_REPOSITORY_ROOT = 'https://raw.githubusercontent.com/KISGP/WuWaChatChars/main'

let remoteCatalogCache: RemoteCharacterRecord[] = []
let remoteCatalogRefreshedAt: string | null = null

function normalizeCharacterVersion(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const normalizedDate = new Date(value)
  if (Number.isNaN(normalizedDate.getTime())) {
    return null
  }

  return normalizedDate.toISOString()
}

function getRemoteCharacterFileUrl(characterId: string, fileName: string): string {
  return joinUrl(joinUrl(REMOTE_REPOSITORY_ROOT, encodeURIComponent(characterId)), fileName)
}

function getRemoteCharacterListUrl(): string {
  return joinUrl(REMOTE_REPOSITORY_ROOT, 'chars.json')
}

function pickDisplayText(
  value: CharacterInfo['name'] | CharacterInfo['description'],
  fallback = ''
): string {
  return value.cn?.trim() || value.en?.trim() || value.jp?.trim() || fallback
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

function setRemoteCatalogCache(records: RemoteCharacterRecord[], updatedAt: string | null): void {
  remoteCatalogCache = records
  remoteCatalogRefreshedAt = updatedAt
}

async function readRemoteCharacterCache(): Promise<RemoteCharacterCacheDocument | null> {
  const content = await readOptionalFile(getCharactersCachePath())
  if (!content) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as Partial<RemoteCharacterCacheDocument>
    const updatedAt = normalizeCharacterVersion(
      typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
    )
    const characters = Array.isArray(parsed.characters)
      ? parsed.characters.filter(
          (character): character is RemoteCharacterRecord =>
            Boolean(character) &&
            typeof character.id === 'string' &&
            Boolean(character.id.trim()) &&
            Boolean(character.info) &&
            typeof character.info === 'object'
        )
      : []

    return {
      updatedAt,
      characters
    }
  } catch {
    return null
  }
}

async function writeRemoteCharacterCache(
  records: RemoteCharacterRecord[],
  updatedAt: string | null
): Promise<void> {
  await writeJsonFileAtomic(getCharactersCachePath(), {
    updatedAt,
    characters: records
  } satisfies RemoteCharacterCacheDocument)
}

async function ensureRemoteCatalogCacheLoaded(): Promise<void> {
  if (remoteCatalogCache.length > 0 || remoteCatalogRefreshedAt) {
    return
  }

  const cache = await readRemoteCharacterCache()
  if (!cache) {
    return
  }

  setRemoteCatalogCache(cache.characters, cache.updatedAt)
}

async function readLocalManifest(characterId: string): Promise<LocalCharacterManifest | null> {
  const content = await readOptionalFile(getCharacterManifestPath(characterId))
  if (!content) {
    return null
  }

  try {
    return JSON.parse(content) as LocalCharacterManifest
  } catch {
    return null
  }
}

async function writeLocalManifest(
  characterId: string,
  manifest: LocalCharacterManifest
): Promise<void> {
  await writeJsonFileAtomic(getCharacterManifestPath(characterId), manifest)
}

async function ensureLocalCharacterDirectory(characterId: string): Promise<void> {
  await mkdir(getCharacterDirectoryPath(characterId), { recursive: true })
}

async function loadLocalCharacterRecord(characterId: string): Promise<LocalCharacterRecord | null> {
  const infoPath = getCharacterInfoPath(characterId)
  const promptPath = getCharacterPromptPath(characterId)

  if (!(await pathExists(infoPath)) || !(await pathExists(promptPath))) {
    return null
  }

  const info = JSON.parse(await readFile(infoPath, 'utf-8')) as CharacterInfo
  const prompt = await readFile(promptPath, 'utf-8')
  const manifest = await readLocalManifest(characterId)
  const avatarPath = getCharacterAvatarPath(characterId)
  const cardBgPath = getCharacterCardBgPath(characterId)

  return {
    id: characterId,
    name: pickDisplayText(info.name, characterId),
    description: pickDisplayText(info.description),
    avatar: (await pathExists(avatarPath)) ? await readImageDataUrl(avatarPath) : '',
    cardBg: (await pathExists(cardBgPath)) ? await readImageDataUrl(cardBgPath) : undefined,
    source: manifest?.source || 'custom',
    prompt,
    promptFileName: PROMPT_FILE_NAME
  }
}

async function getLocalCharacterRecords(): Promise<LocalCharacterRecord[]> {
  const characterIds = await readDirectoryNames(getCharactersRoot())
  const records = await Promise.all(
    characterIds.map((characterId) => loadLocalCharacterRecord(characterId))
  )
  return records.filter((record): record is LocalCharacterRecord => Boolean(record))
}

async function fetchRemoteCharacterInfo(characterId: string): Promise<CharacterInfo> {
  return fetchJson<CharacterInfo>(getRemoteCharacterFileUrl(characterId, 'info.json'))
}

async function fetchRemoteCharacterUpdatedAt(): Promise<string> {
  const response = await fetch(CHARACTER_REPO_API_URL)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${CHARACTER_REPO_API_URL}: ${response.status} ${response.statusText}`
    )
  }

  const payload = (await response.json()) as { pushed_at?: unknown }
  const updatedAt =
    typeof payload?.pushed_at === 'string' ? normalizeCharacterVersion(payload.pushed_at) : null
  if (!updatedAt) {
    throw new Error(`Character repo metadata from ${CHARACTER_REPO_API_URL} is missing pushed_at.`)
  }

  return updatedAt
}

async function fetchRemoteCharacterList(): Promise<RemoteCharacterRecord[]> {
  const ids = await fetchJson<string[]>(getRemoteCharacterListUrl())
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]

  const records = await Promise.all(
    uniqueIds.map(async (id) => ({
      id,
      info: await fetchRemoteCharacterInfo(id)
    }))
  )

  return records.sort((left, right) => left.id.localeCompare(right.id))
}

async function buildCharacterCatalog(): Promise<CharacterCatalog> {
  const localRecords = await getLocalCharacterRecords()
  const localIds = new Set(localRecords.map((character) => character.id))

  return {
    local: localRecords.map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      avatar: character.avatar,
      cardBg: character.cardBg,
      source: character.source
    })),
    remote: remoteCatalogCache.map<RemoteCharacterEntry>((character) => ({
      id: character.id,
      name: pickDisplayText(character.info.name, character.id),
      description: pickDisplayText(character.info.description),
      isDownloaded: localIds.has(character.id)
    })),
    refreshedAt: remoteCatalogRefreshedAt
  }
}

async function writeDownloadedCharacterBundle(
  characterId: string,
  info: CharacterInfo,
  prompt: string,
  avatar: Buffer,
  cardBg: Buffer
): Promise<void> {
  await ensureLocalCharacterDirectory(characterId)

  await Promise.all([
    writeJsonFileAtomic(getCharacterInfoPath(characterId), info),
    writeFile(getCharacterPromptPath(characterId), prompt, 'utf-8'),
    writeFile(getCharacterAvatarPath(characterId), avatar),
    writeFile(getCharacterCardBgPath(characterId), cardBg),
    writeLocalManifest(characterId, { source: 'preset' })
  ])
}

async function downloadRemoteCharacterBundle(characterId: string): Promise<void> {
  const [info, prompt, avatar, cardBg] = await Promise.all([
    fetchRemoteCharacterInfo(characterId),
    fetchText(getRemoteCharacterFileUrl(characterId, PROMPT_FILE_NAME)),
    fetchBuffer(getRemoteCharacterFileUrl(characterId, 'avatar.png')),
    fetchBuffer(getRemoteCharacterFileUrl(characterId, 'cardBg.png'))
  ])

  await writeDownloadedCharacterBundle(characterId, info, prompt, avatar, cardBg)
}

export async function getCharacterSummaryById(characterId: string): Promise<CharacterSummary> {
  const record = await loadLocalCharacterRecord(characterId)
  if (!record) {
    throw new Error(`Character not found: ${characterId}`)
  }

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    avatar: record.avatar,
    cardBg: record.cardBg
  }
}

export async function getCharacters(): Promise<CharacterSummary[]> {
  const records = await getLocalCharacterRecords()
  return records.map((character) => ({
    id: character.id,
    name: character.name,
    description: character.description,
    avatar: character.avatar,
    cardBg: character.cardBg
  }))
}

export async function getCharacterPrompt(characterId: string): Promise<CharacterPromptDocument> {
  const record = await loadLocalCharacterRecord(characterId)
  if (!record) {
    throw new Error(`Character not found: ${characterId}`)
  }

  return {
    characterId: record.id,
    prompt: record.prompt,
    promptFileName: record.promptFileName
  }
}

export async function saveCharacterPrompt(
  characterId: string,
  promptText: string
): Promise<CharacterPromptDocument> {
  if (!(await pathExists(getCharacterInfoPath(characterId)))) {
    throw new Error(`Character not found: ${characterId}`)
  }

  await ensureLocalCharacterDirectory(characterId)
  await writeFile(getCharacterPromptPath(characterId), promptText, 'utf-8')

  return {
    characterId,
    prompt: promptText,
    promptFileName: PROMPT_FILE_NAME
  }
}

export async function getCharacterCatalog(): Promise<CharacterCatalog> {
  await ensureRemoteCatalogCacheLoaded()
  return buildCharacterCatalog()
}

export async function refreshRemoteCharacters(): Promise<CharacterCatalog> {
  const cachedCatalog = await readRemoteCharacterCache()
  if (cachedCatalog) {
    setRemoteCatalogCache(cachedCatalog.characters, cachedCatalog.updatedAt)
  }

  try {
    const remoteUpdatedAt = await fetchRemoteCharacterUpdatedAt()
    if (cachedCatalog && cachedCatalog.updatedAt === remoteUpdatedAt) {
      setRemoteCatalogCache(cachedCatalog.characters, cachedCatalog.updatedAt)
      return buildCharacterCatalog()
    }

    const records = await fetchRemoteCharacterList()
    setRemoteCatalogCache(records, remoteUpdatedAt)
    await writeRemoteCharacterCache(records, remoteUpdatedAt)
    return buildCharacterCatalog()
  } catch (error) {
    if (cachedCatalog) {
      setRemoteCatalogCache(cachedCatalog.characters, cachedCatalog.updatedAt)
      return buildCharacterCatalog()
    }

    throw error
  }
}

export async function getRemoteCharacterPrompt(characterId: string): Promise<string> {
  return fetchText(getRemoteCharacterFileUrl(characterId, PROMPT_FILE_NAME))
}

export async function downloadCharacter(characterId: string): Promise<CharacterSummary> {
  await downloadRemoteCharacterBundle(characterId)
  return getCharacterSummaryById(characterId)
}

export async function resetPresetCharacter(characterId: string): Promise<CharacterSummary> {
  await downloadRemoteCharacterBundle(characterId)
  return getCharacterSummaryById(characterId)
}
