import type { AgentResourcePage } from '@shared/agent'
import type { LoreStatus } from '@shared/lore'
import { MarkdownLorePackageLoader } from './package-loader'

/**
 * @description 管理 Lore 资料包维护，并为聊天 Agent 提供全库只读资源查询。
 */
export class LoreService {
  private readonly loader = new MarkdownLorePackageLoader()

  /** @description 返回当前 Lore 资料包状态。 */
  async getStatus(): Promise<LoreStatus> {
    try {
      const packageData = await this.loader.ensurePackage()
      return {
        sourceId: 'lore',
        available: true,
        sourceFingerprint: packageData.source.sourceFingerprint,
        sourceKind: packageData.source.kind,
        sourceUpdatedAt: await this.loader.getSourceUpdatedAt(),
        builtAt: packageData.source.builtAt,
        taskCount: packageData.story.tasks.length,
        sceneCount: packageData.story.scenes.length,
        termCount: packageData.glossary.terms.length
      }
    } catch (error) {
      return {
        sourceId: 'lore',
        available: false,
        sourceFingerprint: null,
        sourceKind: null,
        sourceUpdatedAt: null,
        builtAt: null,
        taskCount: 0,
        sceneCount: 0,
        termCount: 0,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /** @description 从当前 Markdown 来源更新并重建 Lore 资料包。 */
  async updateSource(): Promise<LoreStatus> {
    await this.loader.updatePackage()
    return this.getStatus()
  }

  /** @description 强制重建当前 Lore 资料包。 */
  async rebuild(): Promise<LoreStatus> {
    await this.loader.rebuildPackage()
    return this.getStatus()
  }

  /**
   * @description 查询可供 Agent 阅读的 Lore 场景或术语资源记录。
   * @param input 声明式资源查询参数。
   */
  async queryAgentResource(input: Record<string, unknown>): Promise<AgentResourcePage> {
    const packageData = await this.loader.ensurePackage()
    const limit = getLimit(input.limit)
    const cursor = getCursor(input.cursor)
    const taskById = new Map(packageData.story.tasks.map((task) => [task.id, task]))

    if (input.source === 'lore.glossary') {
      const records = packageData.glossary.terms
        .filter((term) =>
          matchesConditions(input.conditions, {
            id: term.id,
            term: term.term,
            definition: term.definition,
            sourcePath: term.sourcePath,
            knownByTaskIds: term.knownByTaskIds
          })
        )
        .map((term) => ({
          id: term.id,
          source: 'lore.glossary' as const,
          text: term.definition,
          title: term.term,
          location: `术语：${term.term} / ${term.sourcePath}`
        }))
      return toResourcePage(records, cursor, limit)
    }

    if (input.source !== 'lore.scenes') {
      throw new Error('Lore resource source must be lore.scenes or lore.glossary.')
    }

    const records = packageData.story.scenes
      .filter((scene) => {
        const task = taskById.get(scene.taskId)
        return matchesConditions(input.conditions, {
          id: scene.id,
          taskId: scene.taskId,
          title: scene.title,
          text: scene.text,
          taskTitle: task?.title || '',
          participantLabels: task?.participantLabels || []
        })
      })
      .map((scene) => ({
        id: scene.id,
        source: 'lore.scenes' as const,
        text: scene.text,
        title: scene.title,
        location: `${taskById.get(scene.taskId)?.title || scene.taskId} / ${scene.title}`,
        metadata: { ordinal: scene.ordinal }
      }))
    return toResourcePage(records, cursor, limit)
  }

  /**
   * @description 按 ID 读取完整 Lore 场景或术语记录。
   * @param input 含 source 与 ids 的读取参数。
   */
  async readAgentResource(input: Record<string, unknown>): Promise<AgentResourcePage> {
    const packageData = await this.loader.ensurePackage()
    const ids = Array.isArray(input.ids)
      ? input.ids.filter((id): id is string => typeof id === 'string')
      : []
    if (input.source === 'lore.glossary') {
      return {
        records: packageData.glossary.terms
          .filter((term) => ids.includes(term.id))
          .map((term) => ({
            id: term.id,
            source: 'lore.glossary' as const,
            text: term.definition,
            title: term.term,
            location: `术语：${term.term} / ${term.sourcePath}`
          })),
        nextCursor: null,
        truncated: false
      }
    }

    const taskById = new Map(packageData.story.tasks.map((task) => [task.id, task]))
    return {
      records: packageData.story.scenes
        .filter((scene) => input.source === 'lore.scenes' && ids.includes(scene.id))
        .map((scene) => ({
          id: scene.id,
          source: 'lore.scenes' as const,
          text: scene.text,
          title: scene.title,
          location: `${taskById.get(scene.taskId)?.title || scene.taskId} / ${scene.title}`
        })),
      nextCursor: null,
      truncated: false
    }
  }
}

/** @description 规范化资源查询的页大小。 */
function getLimit(value: unknown): number {
  return Math.max(1, Math.min(Number(value) || 8, 20))
}

/** @description 规范化资源查询游标。 */
function getCursor(value: unknown): number {
  return Math.max(0, Number(value) || 0)
}

/** @description 判断一个记录是否满足声明式查询条件。 */
function matchesConditions(rawConditions: unknown, values: Record<string, unknown>): boolean {
  if (!Array.isArray(rawConditions) || rawConditions.length === 0) {
    return true
  }

  return rawConditions.every((condition) => {
    if (!condition || typeof condition !== 'object') {
      return false
    }
    const item = condition as { field?: unknown; operator?: unknown; value?: unknown }
    const actual = values[typeof item.field === 'string' ? item.field : '']
    const actualText = Array.isArray(actual)
      ? actual.join(' ')
      : typeof actual === 'string'
        ? actual
        : ''
    if (item.operator === 'equals') {
      return actualText === item.value
    }
    if (item.operator === 'contains') {
      return typeof item.value === 'string' && actualText.includes(item.value)
    }
    return item.operator === 'in' && Array.isArray(item.value)
      ? item.value.some((value) => actualText.includes(String(value)))
      : false
  })
}

/** @description 将完整资源记录数组转换为安全的分页结果。 */
function toResourcePage<T extends AgentResourcePage['records'][number]>(
  records: T[],
  cursor: number,
  limit: number
): AgentResourcePage {
  return {
    records: records.slice(cursor, cursor + limit),
    nextCursor: cursor + limit < records.length ? String(cursor + limit) : null,
    truncated: cursor + limit < records.length
  }
}
