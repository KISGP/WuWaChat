import type { StoryEvidence, StoryLoadStatus, StoryScopeResult } from '@shared/story'
import { JsonStoryLoader } from './json-loader'

/**
 * @description 管理本地 JSON 故事资料，并提供严格角色范围内的只读读取。
 */
export class StoryService {
  private readonly loader = new JsonStoryLoader()

  /**
   * @description 返回当前 JSON 故事目录的加载状态。
   * @returns 故事资料状态。
   * */
  getStatus(): Promise<StoryLoadStatus> {
    return this.loader.getStatus()
  }

  /**
   * @description 为当前角色建立任务和场景候选范围。
   * @param characterName 当前角色显示名。
   * @returns 严格参与人匹配得到的候选范围。
   * */
  getScope(characterName: string): Promise<StoryScopeResult> {
    return this.loader.getScope(characterName)
  }

  /**
   * @description 读取候选范围内明确指定的场景正文。
   * @param sceneKeys 复合场景键列表。
   * @param scope 当前请求的候选范围。
   * @returns 原始场景证据。
   * */
  readScenes(sceneKeys: string[], scope: StoryScopeResult): Promise<StoryEvidence[]> {
    return this.loader.readScenes(sceneKeys, scope)
  }

  /**
   * @description 丢弃 Story 内存快照，使下次读取反映磁盘内容。
   * */
  invalidate(): void {
    this.loader.invalidate()
  }
}
