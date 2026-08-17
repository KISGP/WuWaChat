import type { BuildVectorIndexRequest, RetrieveMemoryVectorRequest } from './internal-types'
import { MemoryWorkerRuntime } from './worker-runtime'

/**
 * @description 为角色长期记忆的向量化和检索提供统一调用入口。
 */
export class MemoryWorkerClient {
  constructor(private readonly runtime: MemoryWorkerRuntime) {}

  /**
   * @description 使用角色记忆向量缓存执行查询。
   * @param request 记忆检索请求。
   * @returns 匹配的角色记忆命中。
   */
  async retrieveMemoryVectorHits(
    request: RetrieveMemoryVectorRequest
  ): ReturnType<MemoryWorkerRuntime['retrieveMemoryVectorHits']> {
    return this.runtime.retrieveMemoryVectorHits(request)
  }

  /**
   * @description 为角色长期记忆生成 embedding 向量。
   * @param request 记忆索引构建请求。
   * @returns 向量和其 embedding 指纹。
   */
  async buildVectorIndex(
    request: BuildVectorIndexRequest
  ): ReturnType<MemoryWorkerRuntime['buildVectorIndex']> {
    return this.runtime.buildVectorIndex(request)
  }
}
