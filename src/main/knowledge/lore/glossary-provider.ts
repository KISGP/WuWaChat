import type { CharacterSummary } from '@shared/chat'
import type {
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeProviderStatus,
  KnowledgeRequest
} from '@shared/knowledge'
import type { LoreTask } from '@shared/lore'
import type { LorePackageLoader } from './package-loader'
import { normalizeSpeakerLabel } from './parser'

const CHARACTER_LABEL_ALIASES: Record<string, string> = { 漂泊着: '漂泊者' }
const MAX_GLOSSARY_HITS = 2

/**
 * @description 判断任务是否在当前角色可合理知晓的经历范围内。
 * @param task 原作任务。
 * @param character 当前角色。
 * @returns 角色出现在任务说话人标签中时返回 `true`。
 */
function isKnownTask(task: LoreTask, character: CharacterSummary): boolean {
  const characterLabel = normalizeSpeakerLabel(character.name)
  return task.participantLabels.some(
    (label) => (CHARACTER_LABEL_ALIASES[label] || label) === characterLabel
  )
}

/**
 * @description 提供角色可知原作术语的精确匹配检索。
 * @remarks 术语可知性只使用编译期记录的经历关联，不参与剧情任务定位或语义检索。
 */
export class LoreGlossaryProvider implements KnowledgeProvider {
  readonly sourceId = 'lore-glossary' as const

  /**
   * @description 创建术语 Provider 并注入共同的 LorePackage 加载器。
   * @param loader 当前 LorePackage 加载器。
   */
  constructor(private readonly loader: LorePackageLoader) {}

  /**
   * @description 返回术语知识来源的基础可用状态。
   * @returns 可供通用知识注册表读取的状态。
   */
  async getStatus(): Promise<KnowledgeProviderStatus> {
    try {
      await this.loader.ensurePackage()
      return { sourceId: this.sourceId, available: true }
    } catch (error) {
      return {
        sourceId: this.sourceId,
        available: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * @description 从角色已参与任务所关联的术语中精确返回原文定义。
   * @param request 当前角色和查询。
   * @returns 最多两条术语定义，不占用剧情场景的检索额度。
   */
  async retrieve(request: KnowledgeRequest): Promise<KnowledgeHit[]> {
    const packageData = await this.loader.ensurePackage()
    const character = { id: request.characterId, name: request.characterName, avatar: '' }
    const knownTaskIds = new Set(
      packageData.story.tasks.filter((task) => isKnownTask(task, character)).map((task) => task.id)
    )
    const limit = Math.min(request.resultLimit, MAX_GLOSSARY_HITS)

    return packageData.glossary.terms
      .filter((term) => term.term.length >= 2 && request.query.includes(term.term))
      .filter((term) => term.knownByTaskIds.some((taskId) => knownTaskIds.has(taskId)))
      .sort((left, right) => right.term.length - left.term.length)
      .slice(0, limit)
      .map<KnowledgeHit>((term) => ({
        id: term.id,
        text: term.definition,
        sourceId: this.sourceId,
        sourceLocation: `术语：${term.term} / ${term.sourcePath}`,
        locator: 'exact',
        score: term.term.length,
        originIds: [term.id]
      }))
  }
}
