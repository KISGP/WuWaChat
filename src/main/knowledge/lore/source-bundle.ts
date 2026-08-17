import AdmZip from 'adm-zip'
import { randomUUID } from 'crypto'
import { mkdir, readdir, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { logger } from '@main/logging'
import {
  getAppDataRoot,
  getLoreMarkdownSourceMetadataPath,
  getLoreMarkdownSourceRoot,
  pathExists,
  readOptionalFile,
  writeJsonFileAtomic
} from '@main/utils'

const LORE_SOURCE_ZIP_URL = 'https://codeload.github.com/KISGP/WuWaChatWorld/zip/refs/heads/main'
const LORE_SOURCE_REPO_URL = 'https://api.github.com/repos/KISGP/WuWaChatWorld'

type LoreSourceMetadata = {
  updatedAt: string
}

/**
 * @description 管理原作 Markdown 源包的本地安装与原子更新。
 * @remarks 源包是 Lore 的唯一内容来源；更新完成后由调用方重编译派生缓存。
 */
export class LoreSourceBundle {
  private readyPromise: Promise<void> | null = null

  /**
   * @description 确保本地原作 Markdown 已可供 Lore 编译。
   * @remarks 首次缺少资料时会下载完整源包；已有资料不会发起网络请求。
   */
  async ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.ensureReadyInternal().catch((error) => {
        this.readyPromise = null
        throw error
      })
    }

    await this.readyPromise
  }

  /**
   * @description 获取远端版本并在有更新时原子替换本地原作 Markdown 源包。
   * @returns 实际生效的原作版本时间。
   */
  async update(): Promise<string> {
    await this.ensureReady()
    const localUpdatedAt = await this.getLocalUpdatedAt()
    const remoteUpdatedAt = await this.fetchRemoteUpdatedAt()

    if (localUpdatedAt === remoteUpdatedAt) {
      return localUpdatedAt
    }

    await this.downloadAndInstall(remoteUpdatedAt)
    return remoteUpdatedAt
  }

  /**
   * @description 返回当前本地原作源包的版本时间。
   * @returns 已记录的版本时间；未记录时返回 `null`。
   */
  async getUpdatedAt(): Promise<string | null> {
    return this.getLocalUpdatedAt()
  }

  /**
   * @description 在本地源包缺失时下载并安装当前远端版本。
   */
  private async ensureReadyInternal(): Promise<void> {
    if (await this.hasContent()) {
      return
    }

    const remoteUpdatedAt = await this.fetchRemoteUpdatedAt()
    await this.downloadAndInstall(remoteUpdatedAt)
  }

  /**
   * @description 读取本地源包元数据中的版本时间。
   * @returns 规范化后的版本时间；无有效元数据时返回 `null`。
   */
  private async getLocalUpdatedAt(): Promise<string | null> {
    const content = await readOptionalFile(getLoreMarkdownSourceMetadataPath())
    if (!content) {
      return null
    }

    try {
      const metadata = JSON.parse(content) as Partial<LoreSourceMetadata>
      return this.normalizeVersion(metadata.updatedAt)
    } catch (error) {
      void logger.warn('ai', 'source-metadata-read-failed', 'Failed to read lore source metadata', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  /**
   * @description 查询远端原作仓库的最近更新时间。
   * @returns 远端规范化版本时间。
   */
  private async fetchRemoteUpdatedAt(): Promise<string> {
    const response = await this.fetchResource(LORE_SOURCE_REPO_URL, 'fetch lore source metadata')
    const payload = (await response.json()) as { pushed_at?: unknown }
    const updatedAt =
      typeof payload.pushed_at === 'string' ? this.normalizeVersion(payload.pushed_at) : null
    if (!updatedAt) {
      throw new Error(`Lore source metadata from ${LORE_SOURCE_REPO_URL} is missing pushed_at.`)
    }

    return updatedAt
  }

  /**
   * @description 下载远端压缩包并原子替换本地原作源目录。
   * @param updatedAt 即将写入元数据的远端版本时间。
   */
  private async downloadAndInstall(updatedAt: string): Promise<void> {
    const tempRoot = join(getAppDataRoot(), 'tmp', `lore-source-${randomUUID()}`)
    const archivePath = join(tempRoot, 'source.zip')
    const extractRoot = join(tempRoot, 'extracted')
    const stagedRoot = join(tempRoot, 'lore-markdown-source')
    const targetRoot = getLoreMarkdownSourceRoot()
    const backupRoot = join(getAppDataRoot(), `lore-source-backup-${randomUUID()}`)

    await mkdir(extractRoot, { recursive: true })
    try {
      const response = await this.fetchResource(LORE_SOURCE_ZIP_URL, 'download lore source archive')
      await writeFile(archivePath, Buffer.from(await response.arrayBuffer()))
      new AdmZip(archivePath).extractAllTo(extractRoot, true)

      const bundleRoot = await this.findBundleRoot(extractRoot)
      if (!bundleRoot) {
        throw new Error('Downloaded lore source does not contain recognizable Markdown content.')
      }

      await rename(bundleRoot, stagedRoot)
      await this.replaceDirectory(stagedRoot, targetRoot, backupRoot)
      await writeJsonFileAtomic(getLoreMarkdownSourceMetadataPath(), {
        updatedAt
      } satisfies LoreSourceMetadata)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(backupRoot, { recursive: true, force: true })
    }
  }

  /**
   * @description 用已完成下载的目录替换当前原作源目录，失败时恢复旧目录。
   * @param sourceRoot 已验证的临时源目录。
   * @param targetRoot 当前原作源目录。
   * @param backupRoot 临时备份目录。
   */
  private async replaceDirectory(
    sourceRoot: string,
    targetRoot: string,
    backupRoot: string
  ): Promise<void> {
    if (await pathExists(targetRoot)) {
      await rename(targetRoot, backupRoot)
    }

    try {
      await rename(sourceRoot, targetRoot)
    } catch (error) {
      if (await pathExists(backupRoot)) {
        await rm(targetRoot, { recursive: true, force: true })
        await rename(backupRoot, targetRoot)
      }
      throw error
    }
  }

  /**
   * @description 查找解压目录中可作为原作资料根目录的节点。
   * @param rootPath 当前待检查目录。
   * @returns 找到的资料根目录；无有效内容时返回 `null`。
   */
  private async findBundleRoot(rootPath: string): Promise<string | null> {
    const entries = await readdir(rootPath, { withFileTypes: true })
    if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))) {
      return rootPath
    }

    const directories = entries.filter((entry) => entry.isDirectory())
    if (entries.length === 1 && directories.length === 1) {
      return this.findBundleRoot(join(rootPath, directories[0].name))
    }

    return directories.length > 0 ? rootPath : null
  }

  /**
   * @description 判断本地原作目录是否至少含有一个 Markdown 文件。
   * @returns 含有资料时返回 `true`。
   */
  private async hasContent(): Promise<boolean> {
    const root = getLoreMarkdownSourceRoot()
    if (!(await pathExists(root))) {
      return false
    }

    const entries = await readdir(root, { withFileTypes: true })
    return (
      entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md')) ||
      entries.some((entry) => entry.isDirectory())
    )
  }

  /**
   * @description 发起原作源包网络请求并规范化失败信息。
   * @param url 请求地址。
   * @param action 当前请求动作。
   * @returns 成功响应。
   */
  private async fetchResource(url: string, action: string): Promise<Response> {
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) {
      throw new Error(`Failed to ${action}: ${response.status} ${response.statusText}`)
    }

    return response
  }

  /**
   * @description 规范化原作版本时间字符串。
   * @param value 待处理时间字符串。
   * @returns ISO 版本时间；无效时返回 `null`。
   */
  private normalizeVersion(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null
    }

    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
}
