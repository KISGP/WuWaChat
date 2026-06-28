import type {
  BuildVectorIndexRequest,
  RetrieveMemoryVectorRequest,
  RetrieveWorldVectorRequest
} from './internal-types'
import { MemoryWorkerRuntime } from './worker-runtime'

export class MemoryWorkerClient {
  constructor(private readonly runtime: MemoryWorkerRuntime) {}

  async retrieveWorldVectorHits(
    request: RetrieveWorldVectorRequest
  ): ReturnType<MemoryWorkerRuntime['retrieveKnowledgeVectorHits']> {
    return this.runtime.retrieveKnowledgeVectorHits(request)
  }

  async retrieveMemoryVectorHits(
    request: RetrieveMemoryVectorRequest
  ): ReturnType<MemoryWorkerRuntime['retrieveMemoryVectorHits']> {
    return this.runtime.retrieveMemoryVectorHits(request)
  }

  async buildVectorIndex(
    request: BuildVectorIndexRequest
  ): ReturnType<MemoryWorkerRuntime['buildVectorIndex']> {
    return this.runtime.buildVectorIndex(request)
  }
}
