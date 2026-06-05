import type { CharacterInfo } from '../../shared/ai'
import { joinUrl } from '../utils'
import { CHARACTER_REPO_API_URL, PROMPT_FILE_NAME, REMOTE_REPOSITORY_ROOT } from './constants'
import { normalizeCharacterVersion } from './mappers'
import type { RemoteCharacterRecord } from './types'

export function getRemoteCharacterFileUrl(characterId: string, fileName: string): string {
  return joinUrl(joinUrl(REMOTE_REPOSITORY_ROOT, encodeURIComponent(characterId)), fileName)
}

function getRemoteCharacterListUrl(): string {
  return joinUrl(REMOTE_REPOSITORY_ROOT, 'chars.json')
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

export async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

export async function fetchRemoteCharacterInfo(characterId: string): Promise<CharacterInfo> {
  return fetchJson<CharacterInfo>(getRemoteCharacterFileUrl(characterId, 'info.json'))
}

export async function fetchRemoteCharacterUpdatedAt(): Promise<string> {
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

export async function fetchRemoteCharacterList(): Promise<RemoteCharacterRecord[]> {
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

export function getRemoteCharacterPromptUrl(characterId: string): string {
  return getRemoteCharacterFileUrl(characterId, PROMPT_FILE_NAME)
}
