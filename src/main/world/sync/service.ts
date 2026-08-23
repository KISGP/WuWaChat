import { mkdir, rename, rm } from 'fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'path'
import { downloadFiles } from '@main/download'
import { fetchGithubSnapshot } from '@main/download/github'
import { logger } from '@main/logging'
import { getWorldRoot } from '@main/world/paths'
import type {
  WorldSyncProgress,
  WorldSyncResult,
  WorldPackageFile,
  WorldManifest,
  WorldSyncStatus
} from '@shared/world'
import { readWorldManifest, writeWorldManifest } from './manifest-store'
import { WORLD_FILE_EXTENSION, WORLD_REPOSITORY, WORLD_REPOSITORY_PREFIX } from './constants'

/**
 * @description 返回本地 world 资料状态。
 * @returns 当前本地版本和待检查的远端状态。
 */
export async function getWorldSyncStatus(): Promise<WorldSyncStatus> {
  const localManifest = await readWorldManifest()
  return {
    rootPath: getWorldRoot(),
    installed: Boolean(localManifest && localManifest.files.length > 0),
    localManifest,
    remoteVersion: null,
    updateAvailable: null
  }
}

/**
 * @description 查询 GitHub world 资料版本并与本地清单比较。
 * @returns 包含远端版本的资料状态。
 */
export async function checkWorldSync(): Promise<WorldSyncStatus> {
  const [localManifest, remote] = await Promise.all([
    readWorldManifest(),
    fetchGithubSnapshot(WORLD_REPOSITORY, WORLD_REPOSITORY_PREFIX, WORLD_FILE_EXTENSION)
  ])
  return {
    rootPath: getWorldRoot(),
    installed: Boolean(localManifest && localManifest.files.length > 0),
    localManifest,
    remoteVersion: remote.version,
    updateAvailable: localManifest?.version !== remote.version
  }
}

/**
 * @description 下载并安装 GitHub world 资料。
 * @param onProgress 下载进度回调。
 * @returns 安装结果和完成后的资料状态。
 * @remarks 版本一致时直接返回现有状态；需要更新时先下载到临时目录，再逐文件提交，失败时保留既有本地资料。
 */
export async function syncWorld(
  onProgress?: (progress: WorldSyncProgress) => void
): Promise<WorldSyncResult> {
  const [remote, localManifest] = await Promise.all([
    fetchGithubSnapshot(WORLD_REPOSITORY, WORLD_REPOSITORY_PREFIX, WORLD_FILE_EXTENSION),
    readWorldManifest()
  ])
  if (localManifest?.version === remote.version) {
    return {
      rootPath: getWorldRoot(),
      installed: localManifest.files.length > 0,
      localManifest,
      remoteVersion: remote.version,
      updateAvailable: false,
      outcome: 'unchanged'
    }
  }

  const stagingRoot = `${getWorldRoot()}.staging-${process.pid}-${Date.now()}`
  const remoteFiles: WorldPackageFile[] = remote.files.map((file) => ({
    path: file.path,
    url: file.url,
    sizeBytes: file.sizeBytes
  }))

  try {
    await mkdir(stagingRoot, { recursive: true })
    await downloadFiles(remoteFiles, stagingRoot, {
      onProgress: (progress) => onProgress?.(progress)
    })
    await commitWorldPackageFiles(stagingRoot, remoteFiles, localManifest?.files ?? [])
    const manifest: WorldManifest = {
      version: remote.version,
      downloadedAt: new Date().toISOString(),
      files: remoteFiles,
      totalBytes: remoteFiles.reduce((total, file) => total + file.sizeBytes, 0)
    }
    await writeWorldManifest(manifest)
    return {
      rootPath: getWorldRoot(),
      installed: true,
      localManifest: manifest,
      remoteVersion: remote.version,
      updateAvailable: false,
      outcome: localManifest?.files.length ? 'updated' : 'downloaded'
    }
  } catch (error) {
    await logger.error('main', 'world-download-failed', 'Failed to download world data', {
      stagingRoot,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  } finally {
    try {
      await rm(stagingRoot, { recursive: true, force: true })
    } catch (error) {
      await logger.error(
        'main',
        'world-staging-cleanup-failed',
        'Failed to clean world staging directory',
        {
          stagingRoot,
          error: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }
}

/**
 * @description 将临时目录中的 world 文件提交到应用数据目录，并移除旧清单文件。
 * @param stagingRoot 临时下载目录。
 * @param files 新版本文件清单。
 * @param previousFiles 旧版本文件清单。
 */
async function commitWorldPackageFiles(
  stagingRoot: string,
  files: WorldPackageFile[],
  previousFiles: WorldPackageFile[]
): Promise<void> {
  for (const file of files) {
    const stagedPath = resolveSafePath(stagingRoot, file.path)
    const targetPath = resolveSafePath(getWorldRoot(), file.path)
    await mkdir(dirname(targetPath), { recursive: true })
    await rm(targetPath, { force: true })
    await rename(stagedPath, targetPath)
  }

  const currentPaths = new Set(files.map((file) => file.path))
  for (const previousFile of previousFiles) {
    if (!currentPaths.has(previousFile.path)) {
      await rm(resolveSafePath(getWorldRoot(), previousFile.path), { force: true })
    }
  }
}

/**
 * @description 将相对资料路径限制在指定根目录内。
 * @param rootPath 根目录。
 * @param filePath 相对文件路径。
 * @returns 安全的绝对路径。
 */
function resolveSafePath(rootPath: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new Error(`World file path must be relative: ${filePath}`)
  }
  const root = resolve(rootPath)
  const target = resolve(root, filePath)
  const relativePath = relative(root, target)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`World file path escapes root: ${filePath}`)
  }
  return target
}
