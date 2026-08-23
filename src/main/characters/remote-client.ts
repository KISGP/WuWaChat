import type { CharacterInfo } from '@shared/chat'
import { request, requestJson } from '@main/download'
import { getGithubRawFileUrl } from '@main/download/github'
import { CHARACTER_REPO_API_URL, CHARACTER_REPOSITORY, PROMPT_FILE_NAME } from './constants'
import { normalizeCharacterVersion } from './mappers'
import type { CharacterRemoteFileName, RemoteCharacterRecord } from './types'

/**
 * @description 构造远端角色文件的 raw 下载地址。
 * @param characterId 角色标识。
 * @param fileName 角色目录内的文件名。
 * @returns 远端文件地址。
 */
export function getRemoteCharacterFileUrl(characterId: string, fileName: string): string {
  return getGithubRawFileUrl(CHARACTER_REPOSITORY, characterId + '/' + fileName)
}

/**
 * @description 返回远端角色目录清单地址。
 * @returns 角色目录清单的远端地址。
 */
function getRemoteCharacterListUrl(): string {
  return getGithubRawFileUrl(CHARACTER_REPOSITORY, 'chars.json')
}

/**
 * @description 拉取远端文本内容。
 * @param url 待请求的远端地址。
 * @returns 文本响应内容。
 */
export async function fetchText(url: string): Promise<string> {
  const response = await request(url, { headers: { 'User-Agent': 'WuWaChat' } })
  return response.text()
}

/**
 * @description 拉取远端二进制内容。
 * @param url 待请求的远端地址。
 * @returns 二进制响应内容。
 */
export async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await request(url, { headers: { 'User-Agent': 'WuWaChat' } })
  return Buffer.from(await response.arrayBuffer())
}

/**
 * @description 按本地 ETag 条件请求一个远端角色文件。
 * @param characterId 角色标识。
 * @param fileName 角色文件名。
 * @param etag 上次保存的 ETag。
 * @returns 是否变更、最新 ETag 与变更后的文件内容。
 */
export async function fetchRemoteCharacterFile(
  characterId: string,
  fileName: CharacterRemoteFileName,
  etag?: string
): Promise<{ notModified: boolean; etag?: string; content?: Buffer }> {
  const response = await request(getRemoteCharacterFileUrl(characterId, fileName), {
    allowNotModified: true,
    headers: {
      'User-Agent': 'WuWaChat',
      ...(etag ? { 'If-None-Match': etag } : {})
    }
  })
  const nextEtag = response.headers.get('etag') || etag
  if (response.status === 304) {
    return { notModified: true, etag: nextEtag }
  }

  return {
    notModified: false,
    etag: nextEtag,
    content: Buffer.from(await response.arrayBuffer())
  }
}

/**
 * @description 拉取远端角色信息。
 * @param characterId 角色标识。
 * @returns 角色的展示信息。
 */
export async function fetchRemoteCharacterInfo(characterId: string): Promise<CharacterInfo> {
  return requestJson<CharacterInfo>(getRemoteCharacterFileUrl(characterId, 'info.json'), {
    headers: { 'User-Agent': 'WuWaChat' }
  })
}

/**
 * @description 读取远端仓库最后推送时间。
 * @returns 标准化后的远端更新时间。
 */
export async function fetchRemoteCharacterUpdatedAt(): Promise<string> {
  const payload = await requestJson<{ pushed_at?: unknown }>(CHARACTER_REPO_API_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'WuWaChat' }
  })
  const updatedAt =
    typeof payload?.pushed_at === 'string' ? normalizeCharacterVersion(payload.pushed_at) : null
  if (!updatedAt) {
    throw new Error(`Character repo metadata from ${CHARACTER_REPO_API_URL} is missing pushed_at.`)
  }

  return updatedAt
}

/**
 * @description 拉取、清洗并排序远端角色标识列表。
 * @returns 远端角色标识列表。
 */
export async function fetchRemoteCharacterIds(): Promise<string[]> {
  const ids = await requestJson<string[]>(getRemoteCharacterListUrl(), {
    headers: { 'User-Agent': 'WuWaChat' }
  })

  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  )
}

/**
 * @description 拉取远端角色清单及展示信息。
 * @returns 按角色标识排序的远端角色记录。
 */
export async function fetchRemoteCharacterList(): Promise<RemoteCharacterRecord[]> {
  const ids = await fetchRemoteCharacterIds()

  const records = await Promise.all(
    ids.map(async (id) => ({
      id,
      info: await fetchRemoteCharacterInfo(id)
    }))
  )

  return records.sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * @description 返回远端角色 Prompt 的下载地址。
 * @param characterId 角色标识。
 * @returns Prompt 的远端地址。
 */
export function getRemoteCharacterPromptUrl(characterId: string): string {
  return getRemoteCharacterFileUrl(characterId, PROMPT_FILE_NAME)
}
