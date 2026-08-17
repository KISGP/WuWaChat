import type {
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeProviderStatus,
  KnowledgeRequest,
  KnowledgeRetrievalPlan,
  KnowledgeSourceId
} from '@shared/knowledge'

/**
 * @description 集中管理已启用的知识来源，并按路由计划执行检索。
 * @remarks Lore 可注册剧情和术语等多个来源；未来百科 API 等来源只需实现 `KnowledgeProvider` 后注册。
 */
export class KnowledgeProviderRegistry {
  private readonly providers: Map<KnowledgeSourceId, KnowledgeProvider>

  /**
   * @description 使用来源标识初始化知识 Provider 注册表。
   * @param providers 当前启用的知识来源。
   */
  constructor(providers: KnowledgeProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.sourceId, provider]))
  }

  /**
   * @description 根据路由计划检索所有已注册且被允许的知识来源。
   * @param plan 当前轮的知识检索计划。
   * @param request 与角色和查询相关的基础检索参数。
   * @returns 合并后按来源返回的知识片段。
   */
  async retrieve(
    plan: KnowledgeRetrievalPlan,
    request: Omit<KnowledgeRequest, 'query'>
  ): Promise<KnowledgeHit[]> {
    if (plan.disposition === 'skip') {
      return []
    }

    const results = await Promise.all(
      plan.sourceIds.flatMap((sourceId) => {
        const provider = this.providers.get(sourceId)
        return provider
          ? [
              provider.retrieve({
                ...request,
                query: plan.query
              })
            ]
          : []
      })
    )
    return results.flat()
  }

  /**
   * @description 返回指定来源的可观测状态。
   * @param sourceId 知识来源标识。
   * @returns 来源状态；未注册时返回不可用状态。
   */
  async getStatus(sourceId: KnowledgeSourceId): Promise<KnowledgeProviderStatus> {
    const provider = this.providers.get(sourceId)
    return provider
      ? provider.getStatus()
      : { sourceId, available: false, message: `Knowledge provider ${sourceId} is not registered.` }
  }
}
