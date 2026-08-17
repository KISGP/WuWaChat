import type { LorePackage } from '@shared/lore'
import {
  getLorePackagePath,
  getLoreMarkdownSourceRoot,
  readOptionalFile,
  writeJsonFileAtomic
} from '@main/utils'
import { compileLorePackage } from './parser'
import { LoreSourceBundle } from './source-bundle'

/**
 * @description 定义 Lore 资料包的安装与读取边界，使运行时不依赖具体资料来源。
 */
export type LorePackageLoader = {
  ensurePackage: () => Promise<LorePackage>
  rebuildPackage: () => Promise<LorePackage>
  updatePackage: () => Promise<LorePackage>
  getSourceUpdatedAt: () => Promise<string | null>
}

/**
 * @description 读取并校验本地已安装的 LorePackage。
 * @returns 有效资料包；文件缺失或格式无效时返回 `null`。
 */
async function readInstalledPackage(): Promise<LorePackage | null> {
  const content = await readOptionalFile(getLorePackagePath())
  if (!content) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as Partial<LorePackage>
    if (
      !parsed.source ||
      (parsed.source.kind !== 'markdown-build' && parsed.source.kind !== 'remote-package') ||
      typeof parsed.source.sourceFingerprint !== 'string' ||
      typeof parsed.source.builtAt !== 'string' ||
      !parsed.story ||
      !Array.isArray(parsed.story.tasks) ||
      !Array.isArray(parsed.story.scenes) ||
      !Array.isArray(parsed.story.summaries) ||
      !parsed.glossary ||
      !Array.isArray(parsed.glossary.terms) ||
      !parsed.glossary.terms.every(
        (term) =>
          term &&
          typeof term === 'object' &&
          Array.isArray((term as { knownByTaskIds?: unknown }).knownByTaskIds)
      )
    ) {
      return null
    }

    return parsed as LorePackage
  } catch {
    return null
  }
}

/**
 * @description 从当前本地 Markdown 构建并安装 LorePackage。
 * @remarks 此 Loader 是当前唯一实现；未来远程预编译包应实现相同接口而不改变检索运行时。
 */
export class MarkdownLorePackageLoader implements LorePackageLoader {
  private readonly sourceBundle = new LoreSourceBundle()
  private packageData: LorePackage | null = null
  private loadingPromise: Promise<LorePackage> | null = null

  /**
   * @description 确保当前 Markdown 对应的 LorePackage 已安装并返回内存快照。
   * @returns 当前原作资料包。
   */
  async ensurePackage(): Promise<LorePackage> {
    if (this.packageData) {
      return this.packageData
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadPackage().finally(() => {
        this.loadingPromise = null
      })
    }

    this.packageData = await this.loadingPromise
    return this.packageData
  }

  /**
   * @description 忽略已安装缓存并从当前 Markdown 强制重建资料包。
   * @returns 新安装的原作资料包。
   */
  async rebuildPackage(): Promise<LorePackage> {
    this.packageData = null
    await this.sourceBundle.ensureReady()
    const compiled = await compileLorePackage(getLoreMarkdownSourceRoot())
    await writeJsonFileAtomic(getLorePackagePath(), compiled)
    this.packageData = compiled
    return compiled
  }

  /**
   * @description 更新 Markdown 源包并安装对应的新资料包。
   * @returns 更新后的原作资料包。
   */
  async updatePackage(): Promise<LorePackage> {
    await this.sourceBundle.update()
    return this.rebuildPackage()
  }

  /**
   * @description 获取当前 Markdown 源包记录的更新时间。
   * @returns 源包更新时间；未记录时返回 `null`。
   */
  async getSourceUpdatedAt(): Promise<string | null> {
    return this.sourceBundle.getUpdatedAt()
  }

  /**
   * @description 比较当前 Markdown 与已安装资料包，必要时原子写入新资料包。
   * @returns 与当前 Markdown 内容一致的 LorePackage。
   */
  private async loadPackage(): Promise<LorePackage> {
    await this.sourceBundle.ensureReady()
    const compiled = await compileLorePackage(getLoreMarkdownSourceRoot())
    const installed = await readInstalledPackage()
    if (
      installed &&
      installed.source.kind === 'markdown-build' &&
      installed.source.sourceFingerprint === compiled.source.sourceFingerprint
    ) {
      return installed
    }

    await writeJsonFileAtomic(getLorePackagePath(), compiled)
    return compiled
  }
}
