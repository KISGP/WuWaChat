import type { WorldSyncProgress, WorldSyncResult, WorldSyncStatus } from '@shared/world'
import { GlossaryService } from './glossary'
import { StoryService } from './story'
import { checkWorldSync, getWorldSyncStatus, syncWorld } from './sync'

/**
 * @description 聚合 World 下的 Story、Glossary 和资料同步能力。
 * @remarks Story 与 Glossary 共用同一个 WorldService 生命周期；World 同步成功后会清除两者的缓存。
 */
export class WorldService {
  readonly story = new StoryService()
  readonly glossary = new GlossaryService()

  /**
   * @description 返回当前本地 World 资料的同步状态。
   * @returns 当前 World 同步状态。
   */
  getSyncStatus(): Promise<WorldSyncStatus> {
    return getWorldSyncStatus()
  }

  /**
   * @description 查询远端 World 资料版本并与本地版本比较。
   * @returns 包含远端版本和更新标记的同步状态。
   */
  checkSync(): Promise<WorldSyncStatus> {
    return checkWorldSync()
  }

  /**
   * @description 同步 World 资料并刷新 Story、Glossary 的本地缓存。
   * @param onProgress 可选的同步进度回调。
   * @returns 同步完成后的 World 状态。
   */
  async sync(onProgress?: (progress: WorldSyncProgress) => void): Promise<WorldSyncResult> {
    const result = await syncWorld(onProgress)
    this.invalidate()
    return result
  }

  /**
   * @description 清除 World 内容服务的内存缓存，使下一次读取反映磁盘内容。
   */
  invalidate(): void {
    this.story.invalidate()
    this.glossary.invalidate()
  }
}

export { StoryService } from './story'
export { GlossaryService } from './glossary'
export { checkWorldSync, getWorldSyncStatus, syncWorld } from './sync'
export {
  getWorldGlossaryRoot,
  getWorldManifestPath,
  getWorldRoot,
  getWorldStoryRoot
} from './paths'
