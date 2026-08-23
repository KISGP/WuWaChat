import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  CharacterCatalog,
  CharacterInfo,
  CharacterPromptDocument,
  CharacterSummary,
  LocalCharacterEntry,
  RemoteCharacterEntry
} from '@shared/chat'
import {
  getCharacterAvatarPath,
  getCharactersCachePath,
  getCharacterCardBgPath,
  getCharacterDirectoryPath,
  getCharacterInfoPath,
  getCharacterManifestPath,
  getCharacterPromptPath,
  getCharactersRoot,
  pathExists,
  readDirectoryNames,
  readImageDataUrl,
  readOptionalFile,
  writeJsonFileAtomic
} from '@main/utils'
import { logger } from '@main/logging'
import { PROMPT_FILE_NAME } from './constants'
import { normalizeCharacterVersion, pickDisplayText } from './mappers'
import {
  fetchRemoteCharacterFile,
  fetchRemoteCharacterIds,
  fetchRemoteCharacterUpdatedAt,
  fetchText,
  getRemoteCharacterPromptUrl
} from './remote-client'
import {
  CHARACTER_REMOTE_FILE_NAMES,
  type CharacterRemoteFileName,
  type LocalCharacterManifest,
  type LocalCharacterRecord,
  type RemoteCharacterCacheDocument,
  type RemoteCharacterRecord
} from './types'

type RemoteFile = { content: Buffer; etag?: string; notModified: boolean }
type Bundle = {
  info: CharacterInfo
  prompt: string
  avatar: Buffer
  cardBg: Buffer
  etags: Partial<Record<CharacterRemoteFileName, string>>
  notModified: Record<CharacterRemoteFileName, boolean>
}

let remoteCatalogCache: RemoteCharacterRecord[] = []
let remoteCatalogRefreshedAt: string | null = null
let characterSyncPromise: Promise<CharacterCatalog> | null = null
let lastCharacterSyncError = ''
const syncingIds = new Set<string>()

/** @description 生成目录尚未获取时的最小角色展示信息。 */
function fallbackInfo(id: string): CharacterInfo {
  return { name: { cn: id }, description: {} }
}

/** @description 更新内存中的远端角色目录缓存。 */
function setCache(records: RemoteCharacterRecord[], updatedAt: string | null): void {
  remoteCatalogCache = records
  remoteCatalogRefreshedAt = updatedAt
}

/** @description 读取持久化的远端角色目录缓存。 */
async function readCache(): Promise<RemoteCharacterCacheDocument | null> {
  const content = await readOptionalFile(getCharactersCachePath())
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as Partial<RemoteCharacterCacheDocument>
    const characters = Array.isArray(parsed.characters)
      ? parsed.characters.filter(
          (item): item is RemoteCharacterRecord =>
            Boolean(item) && typeof item.id === 'string' && Boolean(item.info)
        )
      : []
    return {
      updatedAt: normalizeCharacterVersion(
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
      ),
      characters
    }
  } catch (error) {
    await logger.warn('main', 'character-cache-read-failed', 'Failed to parse character cache', {
      error: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}

/** @description 持久化远端角色目录缓存。 */
async function writeCache(): Promise<void> {
  await writeJsonFileAtomic(getCharactersCachePath(), {
    updatedAt: remoteCatalogRefreshedAt,
    characters: remoteCatalogCache
  } satisfies RemoteCharacterCacheDocument)
}

/** @description 确保内存中已加载角色目录缓存。 */
async function ensureCache(): Promise<void> {
  if (remoteCatalogCache.length || remoteCatalogRefreshedAt) return
  const cache = await readCache()
  if (cache) setCache(cache.characters, cache.updatedAt)
}

/** @description 读取一个角色的本地同步清单。 */
async function readManifest(id: string): Promise<LocalCharacterManifest | null> {
  const content = await readOptionalFile(getCharacterManifestPath(id))
  if (!content) return null
  try {
    return JSON.parse(content) as LocalCharacterManifest
  } catch (error) {
    await logger.warn(
      'main',
      'character-manifest-read-failed',
      'Failed to parse character manifest',
      { characterId: id, error: error instanceof Error ? error.message : String(error) }
    )
    return null
  }
}

/** @description 将同步清单写入角色目录。 */
async function writeManifest(id: string, manifest: LocalCharacterManifest): Promise<void> {
  await writeJsonFileAtomic(getCharacterManifestPath(id), manifest)
}

/** @description 读取已安装角色及其同步展示状态。 */
async function loadLocal(id: string): Promise<LocalCharacterRecord | null> {
  if (
    !(await pathExists(getCharacterInfoPath(id))) ||
    !(await pathExists(getCharacterPromptPath(id)))
  )
    return null
  const info = JSON.parse(await readFile(getCharacterInfoPath(id), 'utf-8')) as CharacterInfo
  const prompt = await readFile(getCharacterPromptPath(id), 'utf-8')
  const manifest = await readManifest(id)
  const hasStatus = Boolean(
    manifest?.pendingRemotePrompt || manifest?.remoteUnavailable || manifest?.syncError
  )
  return {
    id,
    name: pickDisplayText(info.name, id),
    description: pickDisplayText(info.description),
    avatar: (await pathExists(getCharacterAvatarPath(id)))
      ? await readImageDataUrl(getCharacterAvatarPath(id))
      : '',
    cardBg: (await pathExists(getCharacterCardBgPath(id)))
      ? await readImageDataUrl(getCharacterCardBgPath(id))
      : undefined,
    source: manifest?.source || 'custom',
    syncStatus: hasStatus
      ? {
          promptUpdateAvailable: Boolean(manifest?.pendingRemotePrompt),
          remoteUnavailable: Boolean(manifest?.remoteUnavailable),
          syncError: manifest?.syncError
        }
      : undefined,
    prompt,
    promptFileName: PROMPT_FILE_NAME
  }
}

/** @description 读取全部完整的本地角色记录。 */
async function getLocalRecords(): Promise<LocalCharacterRecord[]> {
  const ids = await readDirectoryNames(getCharactersRoot())
  const records = await Promise.all(ids.map(loadLocal))
  return records.filter((item): item is LocalCharacterRecord => Boolean(item))
}

/** @description 根据当前缓存构建角色目录。 */
async function buildCatalog(): Promise<CharacterCatalog> {
  const records = await getLocalRecords()
  const localIds = new Set(records.map((item) => item.id))
  const local: LocalCharacterEntry[] = records.map(
    ({ id, name, description, avatar, cardBg, source, syncStatus }) => ({
      id,
      name,
      description,
      avatar,
      cardBg,
      source,
      syncStatus
    })
  )
  const remote = remoteCatalogCache
    .filter((item) => !localIds.has(item.id) && (syncingIds.has(item.id) || item.syncError))
    .map<RemoteCharacterEntry>((item) => ({
      id: item.id,
      name: pickDisplayText(item.info.name, item.id),
      description: pickDisplayText(item.info.description),
      isDownloaded: false,
      syncState: syncingIds.has(item.id) ? 'downloading' : 'failed',
      syncError: item.syncError
    }))
  return {
    local,
    remote,
    refreshedAt: remoteCatalogRefreshedAt,
    isSyncing: Boolean(characterSyncPromise),
    syncError: lastCharacterSyncError || undefined
  }
}

/** @description 读取 304 响应所需的本地角色文件。 */
async function readLocalFile(id: string, name: CharacterRemoteFileName): Promise<Buffer> {
  const paths: Record<CharacterRemoteFileName, string> = {
    'info.json': getCharacterInfoPath(id),
    'prompt.md': getCharacterPromptPath(id),
    'avatar.png': getCharacterAvatarPath(id),
    'cardBg.png': getCharacterCardBgPath(id)
  }
  return readFile(paths[name])
}

/** @description 以 ETag 条件请求一个远端文件，并在未修改时复用本地内容。 */
async function getFile(
  id: string,
  name: CharacterRemoteFileName,
  etag?: string,
  local = false
): Promise<RemoteFile> {
  let result = await fetchRemoteCharacterFile(id, name, etag)
  if (!result.notModified && result.content)
    return { content: result.content, etag: result.etag, notModified: false }
  try {
    if (!local) throw new Error('Missing local file')
    return { content: await readLocalFile(id, name), etag: result.etag, notModified: true }
  } catch (error) {
    await logger.warn('main', 'character-etag-recovery', 'ETag cache could not reuse local file', {
      characterId: id,
      fileName: name,
      error: error instanceof Error ? error.message : String(error)
    })
    result = await fetchRemoteCharacterFile(id, name)
    if (!result.content) throw new Error('Remote character file is missing content: ' + name)
    return { content: result.content, etag: result.etag, notModified: false }
  }
}

/** @description 串行准备一个角色的完整远端文件集。 */
async function getBundle(
  id: string,
  etags: Partial<Record<CharacterRemoteFileName, string>> = {},
  local = false
): Promise<Bundle> {
  const files = {} as Record<CharacterRemoteFileName, RemoteFile>
  for (const name of CHARACTER_REMOTE_FILE_NAMES)
    files[name] = await getFile(id, name, etags[name], local)
  const nextEtags: Partial<Record<CharacterRemoteFileName, string>> = {}
  for (const name of CHARACTER_REMOTE_FILE_NAMES)
    if (files[name].etag) nextEtags[name] = files[name].etag
  return {
    info: JSON.parse(files['info.json'].content.toString('utf-8')) as CharacterInfo,
    prompt: files['prompt.md'].content.toString('utf-8'),
    avatar: files['avatar.png'].content,
    cardBg: files['cardBg.png'].content,
    etags: nextEtags,
    notModified: {
      'info.json': files['info.json'].notModified,
      'prompt.md': files['prompt.md'].notModified,
      'avatar.png': files['avatar.png'].notModified,
      'cardBg.png': files['cardBg.png'].notModified
    }
  }
}

/** @description 在暂存目录写入完整且已校验的角色数据。 */
async function writeStaging(
  root: string,
  bundle: Bundle,
  prompt: string,
  manifest: LocalCharacterManifest
): Promise<void> {
  await mkdir(root, { recursive: true })
  await Promise.all([
    writeJsonFileAtomic(join(root, 'info.json'), bundle.info),
    writeFile(join(root, PROMPT_FILE_NAME), prompt, 'utf-8'),
    writeFile(join(root, 'avatar.png'), bundle.avatar),
    writeFile(join(root, 'cardBg.png'), bundle.cardBg),
    writeJsonFileAtomic(join(root, 'manifest.json'), manifest)
  ])
}

/** @description 通过目录交换提交角色更新，失败时恢复旧目录。 */
async function commitDirectory(id: string, staging: string): Promise<void> {
  const target = getCharacterDirectoryPath(id)
  if (!(await pathExists(target))) {
    await rename(staging, target)
    return
  }
  const backup = target + '.backup-' + process.pid + '-' + Date.now()
  await rename(target, backup)
  try {
    await rename(staging, target)
  } catch (error) {
    try {
      await rename(backup, target)
    } catch (restoreError) {
      await logger.error(
        'main',
        'character-directory-restore-failed',
        'Failed to restore character directory',
        {
          characterId: id,
          error: restoreError instanceof Error ? restoreError.message : String(restoreError)
        }
      )
    }
    throw error
  }
  try {
    await rm(backup, { recursive: true, force: true })
  } catch (error) {
    await logger.warn(
      'main',
      'character-backup-cleanup-failed',
      'Failed to clean character backup directory',
      { characterId: id, error: error instanceof Error ? error.message : String(error) }
    )
  }
}

/** @description 将暂存的角色数据安全提交到本地目录。 */
async function install(
  id: string,
  bundle: Bundle,
  prompt: string,
  manifest: LocalCharacterManifest
): Promise<void> {
  const staging = getCharacterDirectoryPath(id) + '.staging-' + process.pid + '-' + Date.now()
  try {
    await writeStaging(staging, bundle, prompt, manifest)
    await commitDirectory(id, staging)
  } finally {
    try {
      await rm(staging, { recursive: true, force: true })
    } catch (error) {
      await logger.warn(
        'main',
        'character-staging-cleanup-failed',
        'Failed to clean character staging directory',
        { characterId: id, error: error instanceof Error ? error.message : String(error) }
      )
    }
  }
}

/** @description 自动同步单个远端角色，并保护自定义角色和本地 Prompt。 */
async function syncCharacter(id: string, remote: RemoteCharacterRecord): Promise<void> {
  const local = await loadLocal(id)
  if (local?.source === 'custom') return
  syncingIds.add(id)
  try {
    if (!local) {
      const bundle = await getBundle(id)
      await install(id, bundle, bundle.prompt, { source: 'preset', remoteEtags: bundle.etags })
      remote.info = bundle.info
    } else {
      const manifest = (await readManifest(id)) || { source: 'preset' as const }
      const bundle = await getBundle(id, manifest.remoteEtags, true)
      const pendingRemotePrompt = bundle.notModified['prompt.md']
        ? manifest.pendingRemotePrompt
        : bundle.prompt === local.prompt
          ? undefined
          : bundle.prompt
      await install(id, bundle, local.prompt, {
        source: 'preset',
        remoteEtags: bundle.etags,
        pendingRemotePrompt,
        remoteUnavailable: false
      })
      remote.info = bundle.info
    }
    delete remote.syncError
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    remote.syncError = message
    if (local?.source === 'preset') {
      const manifest = (await readManifest(id)) || { source: 'preset' as const }
      await writeManifest(id, { ...manifest, syncError: message })
    }
    await logger.warn('main', 'character-sync-failed', 'Failed to synchronize character', {
      characterId: id,
      error: message
    })
  } finally {
    syncingIds.delete(id)
  }
}

/** @description 标记远端目录中不存在的本地预设角色。 */
async function markUnavailable(ids: Set<string>): Promise<void> {
  const locals = await getLocalRecords()
  await Promise.all(
    locals
      .filter((item) => item.source === 'preset' && !ids.has(item.id))
      .map(async (item) => {
        const manifest = (await readManifest(item.id)) || { source: 'preset' as const }
        await writeManifest(item.id, { ...manifest, remoteUnavailable: true })
      })
  )
}

/** @description 执行一次完整的后台角色同步。 */
async function runSync(): Promise<CharacterCatalog> {
  await ensureCache()
  lastCharacterSyncError = ''
  const updatedAt = await fetchRemoteCharacterUpdatedAt()
  if (remoteCatalogRefreshedAt === updatedAt && !remoteCatalogCache.some((item) => item.syncError))
    return buildCatalog()
  const ids = await fetchRemoteCharacterIds()
  const prior = new Map(remoteCatalogCache.map((item) => [item.id, item]))
  const records = ids.map((id) => prior.get(id) || { id, info: fallbackInfo(id) })
  setCache(records, updatedAt)
  for (const record of records) await syncCharacter(record.id, record)
  await markUnavailable(new Set(ids))
  await writeCache()
  return buildCatalog()
}

/** @description 启动或复用应用启动时的后台角色同步任务。 */
export function synchronizeCharacters(): Promise<CharacterCatalog> {
  if (characterSyncPromise) return characterSyncPromise
  characterSyncPromise = runSync()
    .catch(async (error) => {
      lastCharacterSyncError = error instanceof Error ? error.message : String(error)
      await logger.warn(
        'main',
        'character-sync-run-failed',
        'Failed to synchronize character catalog',
        { error: lastCharacterSyncError }
      )
      return buildCatalog()
    })
    .finally(() => {
      characterSyncPromise = null
    })
  return characterSyncPromise
}

/** @description 返回指定本地角色的摘要信息。 */
export async function getCharacterSummaryById(id: string): Promise<CharacterSummary> {
  const record = await loadLocal(id)
  if (!record) throw new Error('Character not found: ' + id)
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    avatar: record.avatar,
    cardBg: record.cardBg
  }
}

/** @description 返回所有可用于聊天的本地角色。 */
export async function getCharacters(): Promise<CharacterSummary[]> {
  const records = await getLocalRecords()
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    description: record.description,
    avatar: record.avatar,
    cardBg: record.cardBg
  }))
}

/** @description 读取指定本地角色的 Prompt 文档。 */
export async function getCharacterPrompt(id: string): Promise<CharacterPromptDocument> {
  const record = await loadLocal(id)
  if (!record) throw new Error('Character not found: ' + id)
  return { characterId: record.id, prompt: record.prompt, promptFileName: record.promptFileName }
}

/** @description 保存用户修改后的角色 Prompt。 */
export async function saveCharacterPrompt(
  id: string,
  promptText: string
): Promise<CharacterPromptDocument> {
  if (!(await pathExists(getCharacterInfoPath(id)))) throw new Error('Character not found: ' + id)
  await mkdir(getCharacterDirectoryPath(id), { recursive: true })
  await writeFile(getCharacterPromptPath(id), promptText, 'utf-8')
  return { characterId: id, prompt: promptText, promptFileName: PROMPT_FILE_NAME }
}

/** @description 返回包含当前后台同步状态的角色目录。 */
export async function getCharacterCatalog(): Promise<CharacterCatalog> {
  await ensureCache()
  return buildCatalog()
}

/** @description 仅重试一个下载失败的远端角色。 */
export async function retryCharacterSync(id: string): Promise<CharacterCatalog> {
  await ensureCache()
  const record = remoteCatalogCache.find((item) => item.id === id)
  if (!record) throw new Error('Remote character not found: ' + id)
  await syncCharacter(id, record)
  await writeCache()
  return buildCatalog()
}

/** @description 读取等待用户确认覆盖的远端 Prompt。 */
export async function getPendingRemoteCharacterPrompt(id: string): Promise<string> {
  const manifest = await readManifest(id)
  return manifest?.pendingRemotePrompt ?? fetchText(getRemoteCharacterPromptUrl(id))
}

/** @description 使用待确认的远端 Prompt 覆盖本地 Prompt。 */
export async function applyPendingRemoteCharacterPrompt(id: string): Promise<CharacterSummary> {
  const manifest = await readManifest(id)
  if (!manifest?.pendingRemotePrompt)
    throw new Error('No pending remote prompt update for character: ' + id)
  await writeFile(getCharacterPromptPath(id), manifest.pendingRemotePrompt, 'utf-8')
  await writeManifest(id, { ...manifest, pendingRemotePrompt: undefined })
  return getCharacterSummaryById(id)
}
