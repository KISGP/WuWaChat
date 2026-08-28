import type { CharacterInfo } from '@shared/chat'
import { request, requestJson } from '@main/download'
import {
  getGithubRawFileUrl,
  resolveGithubUrl,
  type GithubRequestContext
} from '@main/download/github'
import { CHARACTER_REPO_API_URL, CHARACTER_REPOSITORY, PROMPT_FILE_NAME } from './constants'
import { normalizeCharacterVersion } from './mappers'
import type { RemoteCharacterRecord } from './types'

/**
 * @description 构造远端角色文件的 raw 下载地址。
 * @param characterId 角色标识。
 * @param fileName 角色目录内的文件名。
 * @param context 本次操作固定使用的 GitHub 来源。
 * @returns 远端文件地址。
 */
export function getRemoteCharacterFileUrl(
  characterId: string,
  fileName: string,
  context?: GithubRequestContext
): string {
  return getGithubRawFileUrl(CHARACTER_REPOSITORY, characterId + '/' + fileName, context)
}

/**
 * @description 返回远端角色目录清单地址。
 * @returns 角色目录清单的远端地址。
 */
function getRemoteCharacterListUrl(context?: GithubRequestContext): string {
  return getGithubRawFileUrl(CHARACTER_REPOSITORY, 'chars.json', context)
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
 * @param context 本次操作固定使用的 GitHub 来源。
 * @returns 是否变更、最新 ETag 与变更后的文件内容。
 */
export async function fetchRemoteCharacterFile(
  characterId: string,
  fileName: string,
  etag?: string,
  context?: GithubRequestContext
): Promise<{ notModified: boolean; etag?: string; content?: Buffer }> {
  const response = await request(getRemoteCharacterFileUrl(characterId, fileName, context), {
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
 * @param context 本次操作固定使用的 GitHub 来源。
 * @returns 角色的展示信息。
 */
export async function fetchRemoteCharacterInfo(
  characterId: string,
  context?: GithubRequestContext
): Promise<CharacterInfo> {
  return requestJson<CharacterInfo>(getRemoteCharacterFileUrl(characterId, 'info.json', context), {
    headers: { 'User-Agent': 'WuWaChat' }
  })
}

/**
 * @description 读取远端仓库最后推送时间。
 * @param context 本次操作固定使用的 GitHub 来源。
 * @returns 标准化后的远端更新时间。
 */
export async function fetchRemoteCharacterUpdatedAt(
  context?: GithubRequestContext
): Promise<string> {
  const payload = await requestJson<{ pushed_at?: unknown }>(
    resolveGithubUrl(CHARACTER_REPO_API_URL, context),
    {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'WuWaChat' }
    }
  )
  const updatedAt =
    typeof payload?.pushed_at === 'string' ? normalizeCharacterVersion(payload.pushed_at) : null
  if (!updatedAt) {
    throw new Error(`Character repo metadata from ${CHARACTER_REPO_API_URL} is missing pushed_at.`)
  }

  return updatedAt
}

/**
 * @description 拉取、清洗并排序远端角色标识列表。
 * @param context 本次操作固定使用的 GitHub 来源。
 * @returns 远端角色标识列表。
 */
export async function fetchRemoteCharacterIds(context?: GithubRequestContext): Promise<string[]> {
  const ids = await requestJson<string[]>(getRemoteCharacterListUrl(context), {
    headers: { 'User-Agent': 'WuWaChat' }
  })

  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  )
}

/**
 * @description 拉取远端角色清单及展示信息。
 * @param context 本次操作固定使用的 GitHub 来源。
 * @returns 按角色标识排序的远端角色记录。
 */
export async function fetchRemoteCharacterList(
  context?: GithubRequestContext
): Promise<RemoteCharacterRecord[]> {
  const ids = await fetchRemoteCharacterIds(context)

  const records = await Promise.all(
    ids.map(async (id) => ({
      id,
      info: await fetchRemoteCharacterInfo(id, context)
    }))
  )

  return records.sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * @description 返回远端角色 Prompt 的下载地址。
 * @param characterId 角色标识。
 * @param context 本次操作固定使用的 GitHub 来源。
 * @returns Prompt 的远端地址。
 */
export function getRemoteCharacterPromptUrl(
  characterId: string,
  context?: GithubRequestContext
): string {
  return getRemoteCharacterFileUrl(characterId, PROMPT_FILE_NAME, context)
}
