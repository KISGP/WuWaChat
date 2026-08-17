import type { CharacterSummary } from '@shared/chat'
import type { KnowledgeHit, KnowledgeProvider, KnowledgeRequest } from '@shared/knowledge'
import type { LorePackage, LoreScene, LoreSemanticIndex, LoreStatus, LoreTask } from '@shared/lore'
import { getEmbeddingFingerprintKey } from '@main/embedding/fingerprint'
import type { EmbeddingProvider } from '@main/embedding/types'
import { logger } from '@main/logging'
import { getLoreSemanticIndexPath, readOptionalFile, writeJsonFileAtomic } from '@main/utils'
import { normalizeSpeakerLabel } from './parser'
import type { LorePackageLoader } from './package-loader'

const CHARACTER_LABEL_ALIASES: Record<string, string> = { 漂泊着: '漂泊者' }
const MAX_NEIGHBOR_SCENES = 1
const MAX_KNOWLEDGE_CHARACTERS = 1_800

/**
 * @description 计算两个同维 embedding 向量的余弦相似度。
 * @param left 查询向量。
 * @param right 候选任务向量。
 * @returns 相似度；维度不一致时返回零。
 */
function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return 0
  }

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0
}

/**
 * @description 读取并校验与当前 LorePackage 关联的任务级语义索引。
 * @returns 有效索引；不存在或格式不兼容时返回 `null`。
 */
async function readSemanticIndex(): Promise<LoreSemanticIndex | null> {
  const content = await readOptionalFile(getLoreSemanticIndexPath())
  if (!content) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as Partial<LoreSemanticIndex>
    return typeof parsed.sourceFingerprint === 'string' &&
      typeof parsed.fingerprintKey === 'string' &&
      typeof parsed.builtAt === 'string' &&
      parsed.taskVectors
      ? (parsed as LoreSemanticIndex)
      : null
  } catch {
    return null
  }
}

/**
 * @description 截取场景开头的连续原文，避免将剧情知识拆成无上下文的碎片。
 * @param text 场景原文。
 * @returns 可注入提示词的连续知识文本。
 */
function buildKnowledgeText(text: string): string {
  return text.length <= MAX_KNOWLEDGE_CHARACTERS
    ? text
    : `${text.slice(0, MAX_KNOWLEDGE_CHARACTERS).trim()}\n[原作场景节选已截断]`
}

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
 * @description 构造任务级语义描述，仅用于候选压缩，不作为知识片段注入模型。
 * @param packageData 当前 LorePackage。
 * @param task 原作任务。
 * @returns 任务标题、场景标题与权威摘要组成的候选描述。
 */
function buildTaskDescriptor(packageData: LorePackage, task: LoreTask): string {
  const sceneTitles = packageData.scenes
    .filter((scene) => scene.taskId === task.id)
    .map((scene) => scene.title)
  const summaries = packageData.summaries
    .filter((summary) => summary.taskId === task.id)
    .map((summary) => summary.text)
  return [task.title, ...sceneTitles, ...summaries].filter(Boolean).join('\n')
}

/**
 * @description 将一个场景转换为带完整来源链的原作知识片段。
 * @param packageData 当前 LorePackage。
 * @param task 所属任务。
 * @param scene 原作场景。
 * @param score 本次定位得分。
 * @returns 可供最终 Prompt 使用的原作知识。
 */
function toSceneKnowledgeHit(
  packageData: LorePackage,
  task: LoreTask,
  scene: LoreScene,
  locator: KnowledgeHit['locator'],
  score: number
): KnowledgeHit {
  return {
    id: scene.id,
    text: buildKnowledgeText(scene.text),
    sourceId: 'lore',
    sourceLocation: `${task.title} / ${scene.title}`,
    sourceVersion: packageData.source.version,
    locator,
    score,
    originIds: [scene.id]
  }
}

/**
 * @description 提供当前角色可知原作资料的结构定位与语义候选检索。
 * @remarks 精确锚点始终优先；语义索引仅在没有任何锚点时缩小任务候选范围。
 */
export class LoreKnowledgeProvider implements KnowledgeProvider {
  readonly sourceId = 'lore' as const
  private semanticIndex: LoreSemanticIndex | null = null

  /**
   * @description 创建 Lore Provider 并注入资料包加载器与可选的本地 embedding 能力。
   * @param loader 当前 LorePackage 加载器。
   * @param getEmbeddingProvider 获取本地 embedding provider 的函数。
   * @param getEmbeddingFingerprint 获取当前 embedding 指纹的函数。
   */
  constructor(
    private readonly loader: LorePackageLoader,
    private readonly getEmbeddingProvider: () => Promise<EmbeddingProvider>,
    private readonly getEmbeddingFingerprint: (
      dimensions?: number
    ) => Promise<import('@shared/memory-settings').EmbeddingFingerprint>
  ) {}

  /**
   * @description 返回当前 LorePackage 与语义候选索引的状态。
   * @returns 原作资料 Provider 状态。
   */
  async getStatus(): Promise<LoreStatus> {
    try {
      const packageData = await this.loader.ensurePackage()
      const semanticIndex = this.semanticIndex || (await readSemanticIndex())
      this.semanticIndex = semanticIndex
      return {
        sourceId: 'lore',
        available: true,
        sourceFingerprint: packageData.source.sourceFingerprint,
        sourceKind: packageData.source.kind,
        packageVersion: packageData.source.version,
        sourceUpdatedAt: await this.loader.getSourceUpdatedAt(),
        builtAt: packageData.source.builtAt,
        taskCount: packageData.tasks.length,
        sceneCount: packageData.scenes.length,
        termCount: packageData.terms.length,
        semanticIndexBuiltAt:
          semanticIndex?.sourceFingerprint === packageData.source.sourceFingerprint
            ? semanticIndex.builtAt
            : null
      }
    } catch (error) {
      return {
        sourceId: 'lore',
        available: false,
        sourceFingerprint: null,
        sourceKind: null,
        packageVersion: null,
        sourceUpdatedAt: null,
        builtAt: null,
        taskCount: 0,
        sceneCount: 0,
        termCount: 0,
        semanticIndexBuiltAt: null,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * @description 更新当前资料包并使旧语义候选索引失效。
   * @returns 更新后的 Lore 状态。
   */
  async updatePackage(): Promise<LoreStatus> {
    await this.loader.updatePackage()
    this.semanticIndex = null
    return this.getStatus()
  }

  /**
   * @description 强制以当前资料来源重建 LorePackage，并使语义候选索引失效。
   * @returns 重建后的 Lore 状态。
   */
  async rebuildPackage(): Promise<LoreStatus> {
    await this.loader.rebuildPackage()
    this.semanticIndex = null
    return this.getStatus()
  }

  /**
   * @description 为任务级语义候选描述构建本地 embedding 索引。
   * @returns 构建后的 Lore 状态。
   */
  async buildSemanticIndex(): Promise<LoreStatus> {
    const packageData = await this.loader.ensurePackage()
    const provider = await this.getEmbeddingProvider()
    const descriptors = packageData.tasks.map((task) => buildTaskDescriptor(packageData, task))
    const vectors = await provider.embedDocuments(descriptors)
    const fingerprint = await this.getEmbeddingFingerprint(vectors[0]?.length)
    const nextIndex: LoreSemanticIndex = {
      sourceFingerprint: packageData.source.sourceFingerprint,
      fingerprintKey: getEmbeddingFingerprintKey(fingerprint),
      builtAt: new Date().toISOString(),
      taskVectors: Object.fromEntries(
        packageData.tasks.map((task, index) => [task.id, vectors[index] || []])
      )
    }
    await writeJsonFileAtomic(getLoreSemanticIndexPath(), nextIndex)
    this.semanticIndex = nextIndex
    return this.getStatus()
  }

  /**
   * @description 根据检索请求在角色可知任务中返回原作知识。
   * @param request 当前角色和查询。
   * @returns 结构锚点或语义候选确定的原作知识。
   */
  async retrieve(request: KnowledgeRequest): Promise<KnowledgeHit[]> {
    const packageData = await this.loader.ensurePackage()
    const character = { id: request.characterId, name: request.characterName, avatar: '' }
    const knownTasks = packageData.tasks.filter((task) => isKnownTask(task, character))
    const exactTaskIds = new Set(
      knownTasks.filter((task) => request.query.includes(task.title)).map((task) => task.id)
    )
    const exactSceneIds = new Set(
      packageData.scenes
        .filter((scene) => exactTaskIds.has(scene.taskId) || request.query.includes(scene.title))
        .filter((scene) => knownTasks.some((task) => task.id === scene.taskId))
        .map((scene) => scene.id)
    )
    const knownTaskIds = new Set(knownTasks.map((task) => task.id))
    const termHits = packageData.terms
      .filter((term) => term.term.length >= 2 && request.query.includes(term.term))
      .filter((term) => term.taskIds.some((taskId) => knownTaskIds.has(taskId)))
      .slice(0, request.resultLimit)
      .map<KnowledgeHit>((term) => ({
        id: term.id,
        text: term.definition,
        sourceId: 'lore',
        sourceLocation: `术语：${term.term} / ${term.sourcePath}`,
        sourceVersion: packageData.source.version,
        locator: 'exact',
        score: term.term.length,
        originIds: [term.id]
      }))

    const selectedTaskIds =
      exactTaskIds.size > 0 || exactSceneIds.size > 0
        ? new Set([
            ...exactTaskIds,
            ...packageData.scenes
              .filter((scene) => exactSceneIds.has(scene.id))
              .map((scene) => scene.taskId)
          ])
        : await this.findSemanticTaskIds(
            packageData,
            knownTasks,
            request.query,
            request.resultLimit
          )
    const sceneLocator: KnowledgeHit['locator'] =
      exactTaskIds.size > 0 || exactSceneIds.size > 0 ? 'exact' : 'semantic'
    const taskById = new Map(packageData.tasks.map((task) => [task.id, task]))
    const sceneHits: KnowledgeHit[] = []
    for (const taskId of selectedTaskIds) {
      const task = taskById.get(taskId)
      if (!task) {
        continue
      }

      const scenes = packageData.scenes.filter((scene) => scene.taskId === taskId)
      const directScenes =
        exactSceneIds.size > 0
          ? scenes.filter((scene) => exactSceneIds.has(scene.id))
          : scenes.slice(0, request.resultLimit)
      const selectedIds = new Set<string>()
      for (const directScene of directScenes) {
        for (const scene of scenes) {
          if (
            Math.abs(scene.ordinal - directScene.ordinal) > MAX_NEIGHBOR_SCENES ||
            selectedIds.has(scene.id)
          ) {
            continue
          }
          selectedIds.add(scene.id)
          sceneHits.push(
            toSceneKnowledgeHit(
              packageData,
              task,
              scene,
              sceneLocator,
              directScene.id === scene.id ? 1 : 0.99
            )
          )
        }
      }
    }

    return [...termHits, ...sceneHits].slice(0, request.resultLimit + MAX_NEIGHBOR_SCENES)
  }

  /**
   * @description 在无可验证字符串锚点时使用任务级语义索引压缩候选范围。
   * @param packageData 当前 LorePackage。
   * @param knownTasks 当前角色可知任务。
   * @param query 路由模型改写后的查询。
   * @param limit 最大候选任务数量。
   * @returns 语义候选任务 ID；索引不可用时返回空集合。
   */
  private async findSemanticTaskIds(
    packageData: LorePackage,
    knownTasks: LoreTask[],
    query: string,
    limit: number
  ): Promise<Set<string>> {
    try {
      const index = this.semanticIndex || (await readSemanticIndex())
      if (!index || index.sourceFingerprint !== packageData.source.sourceFingerprint) {
        return new Set()
      }

      const fingerprint = await this.getEmbeddingFingerprint()
      if (index.fingerprintKey !== getEmbeddingFingerprintKey(fingerprint)) {
        return new Set()
      }

      const queryVector = await (await this.getEmbeddingProvider()).embedQuery(query)
      return new Set(
        knownTasks
          .map((task) => ({
            task,
            score: cosineSimilarity(queryVector, index.taskVectors[task.id] || [])
          }))
          .filter((item) => item.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, limit)
          .map((item) => item.task.id)
      )
    } catch (error) {
      void logger.warn(
        'ai',
        'lore-semantic-fallback-unavailable',
        'Lore semantic fallback is unavailable',
        {
          error: error instanceof Error ? error.message : String(error)
        }
      )
      return new Set()
    }
  }
}
