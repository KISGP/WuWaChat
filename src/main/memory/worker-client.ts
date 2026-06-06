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
  ): ReturnType<MemoryWorkerRuntime['retrieveWorldVectorHits']> {
    return this.runtime.retrieveWorldVectorHits(request)
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
