import type { MemoryDebugRetrievalHit } from '@shared/memory-settings'
import type {
  BuildVectorIndexRequest,
  BuildVectorIndexResult,
  MemoryWorkerResponse,
  RetrieveMemoryVectorRequest
} from './internal-types'
import { RetrievalQueryService } from './retrieval-query-service'

/**
 * @description 执行角色长期记忆的向量构建和检索计算。
 */
export class MemoryWorkerRuntime {
  constructor(private readonly retrievalQueryService: RetrievalQueryService) {}

  /**
   * @description 将查询文本转换为向量并检索角色长期记忆。
   * @param request 记忆向量检索请求。
   * @returns 排序后的角色记忆命中。
   */
  async retrieveMemoryVectorHits(
    request: RetrieveMemoryVectorRequest
  ): Promise<MemoryWorkerResponse<'retrieve-memory-vectors', MemoryDebugRetrievalHit[]>> {
    const queryVector = await request.provider.embedQuery(request.query)
    return {
      type: request.type,
      data: this.retrievalQueryService.buildChatMemoryVectorHits(
        queryVector,
        request.rows,
        request.topK
      )
    }
  }

  /**
   * @description 为角色长期记忆条目批量生成向量和对应 embedding 指纹。
   * @param request 角色记忆索引构建请求。
   * @returns 构建完成的向量和指纹。
   */
  async buildVectorIndex(
    request: BuildVectorIndexRequest
  ): Promise<MemoryWorkerResponse<'build-character-memory-vectors', BuildVectorIndexResult>> {
    const runtimeMessage = await this.describeEmbeddingRuntime(request.provider)
    const vectors = await request.provider.embedDocuments(
      request.entries.map((entry) => entry.text),
      request.embedOptions
    )
    const fingerprint = await request.createFingerprint(vectors[0]?.length)
    return { type: request.type, data: { vectors, fingerprint, runtimeMessage } }
  }

  /**
   * @description 读取 embedding provider 的实际运行设备说明。
   * @param provider 当前 embedding provider。
   * @returns 运行设备描述；不可用时返回 `null`。
   */
  private async describeEmbeddingRuntime(
    provider: BuildVectorIndexRequest['provider']
  ): Promise<string | null> {
    const runtime = await provider.prepare?.()
    if (!runtime) {
      return null
    }

    return runtime.fallbackToCpu
      ? 'GPU unavailable, falling back to CPU for this build'
      : runtime.actualDevice === 'gpu'
        ? 'Using GPU for this build'
        : 'Using CPU for this build'
  }
}
