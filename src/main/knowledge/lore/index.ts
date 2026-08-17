import type { CharacterSummary, ConversationMessage, ModelProfile } from '@shared/chat'
import type { KnowledgeHit, KnowledgeRetrievalPlan } from '@shared/knowledge'
import type { LoreRouteDecision, LoreStatus } from '@shared/lore'
import type { MemoryDebugRetrievalHit, MemorySettingsStore } from '@shared/memory-settings'
import type { ProfilesStore } from '@shared/model-settings'
import type { EmbeddingProvider } from '@main/embedding/types'
import { KnowledgeProviderRegistry } from '@main/knowledge/provider-registry'
import { logger } from '@main/logging'
import { MarkdownLorePackageLoader } from './package-loader'
import { LoreGlossaryProvider } from './glossary-provider'
import { LoreRouter } from './router'
import { LoreStoryProvider } from './story-provider'

type LoreRetrievalResult = {
  storyHits: MemoryDebugRetrievalHit[]
  glossaryHits: MemoryDebugRetrievalHit[]
  route: LoreRouteDecision | null
}

/**
 * @description 将 Lore 路由决定转换为通用知识检索计划。
 * @param route 当前轮的 Lore 路由决定。
 * @returns 仅请求路由模型选中的 Lore 知识域的计划。
 */
function toKnowledgeRetrievalPlan(route: LoreRouteDecision): KnowledgeRetrievalPlan {
  return {
    disposition: route.disposition,
    confidence: route.confidence,
    query: route.retrievalQuery,
    sourceIds: route.targets.map((target) => `lore-${target}` as const),
    reason: route.reason,
    routerProfileId: route.routerProfileId,
    fallbackReason: route.fallbackReason
  }
}

/**
 * @description 将通用原作知识映射为现有聊天 Prompt 与调试页使用的检索片段。
 * @param hit Lore Provider 返回的原作知识。
 * @returns 带剧情或术语范围的上下文片段。
 */
function toRetrievalHit(hit: KnowledgeHit, rank: number): MemoryDebugRetrievalHit {
  const scope = hit.sourceId === 'lore-glossary' ? 'glossary' : 'story'
  return {
    id: hit.id,
    scope,
    text: hit.text,
    score: hit.score,
    rank,
    retrievalModeUsed: hit.locator === 'exact' ? 'string' : 'vector',
    sourceType: scope,
    sourcePath: hit.sourceLocation
  }
}

/**
 * @description 协调 Lore 路由、资料包加载与原作知识 Provider。
 * @remarks 聊天运行时只依赖本服务返回的知识，Markdown 构建与未来远程资料包加载均隐藏在 Loader 后。
 */
export class LoreService {
  private readonly loader = new MarkdownLorePackageLoader()
  private readonly storyProvider: LoreStoryProvider
  private readonly glossaryProvider: LoreGlossaryProvider
  private readonly providers: KnowledgeProviderRegistry
  private readonly router = new LoreRouter()

  /**
   * @description 创建 Lore 服务并注入设置、embedding 与模型配置读取能力。
   * @param getRetrievalSettings 读取 Lore 开关与知识返回上限。
   * @param getEmbeddingProvider 获取可选语义候选索引的 embedding provider。
   * @param getEmbeddingFingerprint 获取语义候选索引的 embedding 指纹。
   * @param getProfiles 获取独立 Lore 路由模型配置。
   */
  constructor(
    private readonly getRetrievalSettings: () => Pick<
      MemorySettingsStore,
      'loreSearchEnabled' | 'loreTopK'
    >,
    getEmbeddingProvider: () => Promise<EmbeddingProvider>,
    getEmbeddingFingerprint: (
      dimensions?: number
    ) => Promise<import('@shared/memory-settings').EmbeddingFingerprint>,
    private readonly getProfiles: () => Promise<ProfilesStore>
  ) {
    this.storyProvider = new LoreStoryProvider(
      this.loader,
      getEmbeddingProvider,
      getEmbeddingFingerprint
    )
    this.glossaryProvider = new LoreGlossaryProvider(this.loader)
    this.providers = new KnowledgeProviderRegistry([this.storyProvider, this.glossaryProvider])
  }

  /**
   * @description 返回当前 Lore Provider 与资料包状态。
   * @returns 原作资料包状态。
   */
  async getStatus(): Promise<LoreStatus> {
    return this.storyProvider.getLoreStatus()
  }

  /**
   * @description 强制以当前资料来源重建可安装 LorePackage。
   * @returns 重建后的资料包状态。
   */
  async rebuild(): Promise<LoreStatus> {
    return this.storyProvider.rebuildPackage()
  }

  /**
   * @description 更新当前资料来源并安装新版本 LorePackage。
   * @returns 更新后的资料包状态。
   */
  async updateSource(): Promise<LoreStatus> {
    return this.storyProvider.updatePackage()
  }

  /**
   * @description 为无锚点问题构建任务级语义候选索引。
   * @returns 构建后的资料包状态。
   */
  async buildSemanticIndex(): Promise<LoreStatus> {
    return this.storyProvider.buildSemanticIndex()
  }

  /**
   * @description 根据路由计划从当前角色可知范围内取得 Lore 原作知识。
   * @param character 当前聊天角色。
   * @param query 当前用户消息。
   * @param history 已筛选的近期聊天记录。
   * @param chatProfile 当前聊天模型；未指定独立路由模型时复用它。
   * @param abortSignal 当前聊天运行取消信号。
   * @returns 分组后的剧情、术语原文与可观测路由决定。
   */
  async retrieve(
    character: CharacterSummary,
    query: string,
    history: ConversationMessage[],
    chatProfile: ModelProfile,
    abortSignal?: AbortSignal
  ): Promise<LoreRetrievalResult> {
    const settings = this.getRetrievalSettings()
    if (!settings.loreSearchEnabled) {
      return { storyHits: [], glossaryHits: [], route: null }
    }

    const route = await this.router.route({
      character,
      userMessage: query,
      history,
      profile: await this.resolveRouterProfile(chatProfile),
      abortSignal
    })
    let knowledgeHits: KnowledgeHit[] = []
    try {
      knowledgeHits = await this.providers.retrieve(toKnowledgeRetrievalPlan(route), {
        characterId: character.id,
        characterName: character.name,
        resultLimit: settings.loreTopK
      })
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error
      }

      void logger.warn(
        'ai',
        'lore-knowledge-unavailable',
        'Lore knowledge retrieval is unavailable',
        {
          characterId: character.id,
          error: error instanceof Error ? error.message : String(error)
        }
      )
    }
    const storyHits = knowledgeHits
      .filter((hit) => hit.sourceId === 'lore-story')
      .map((hit, index) => toRetrievalHit(hit, index + 1))
    const glossaryHits = knowledgeHits
      .filter((hit) => hit.sourceId === 'lore-glossary')
      .map((hit, index) => toRetrievalHit(hit, index + 1))
    return {
      storyHits,
      glossaryHits,
      route
    }
  }

  /**
   * @description 解析独立 Lore 路由模型；缺失或失效时复用当前聊天模型。
   * @param chatProfile 当前聊天模型配置。
   * @returns 实际执行路由调用的模型配置。
   */
  private async resolveRouterProfile(chatProfile: ModelProfile): Promise<ModelProfile> {
    const store = await this.getProfiles()
    return store.loreRouterProfileId
      ? store.profiles.find((profile) => profile.id === store.loreRouterProfileId) || chatProfile
      : chatProfile
  }
}
