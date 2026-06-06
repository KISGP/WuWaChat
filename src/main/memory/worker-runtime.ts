import type { MemoryDebugRetrievalHit } from '@shared/memory-settings'
import type { EmbeddingProvider } from '@main/embedding/types'
import type {
  BuildVectorIndexRequest,
  BuildVectorIndexResult,
  MemoryWorkerResponse,
  RetrieveMemoryVectorRequest,
  RetrieveWorldVectorRequest
} from './internal-types'
import { RetrievalQueryService } from './retrieval-query-service'

export class MemoryWorkerRuntime {
  constructor(private readonly retrievalQueryService: RetrievalQueryService) {}

  async retrieveWorldVectorHits(
    request: RetrieveWorldVectorRequest
  ): Promise<MemoryWorkerResponse<'retrieve-world-vectors', MemoryDebugRetrievalHit[]>> {
    const queryVector = await request.provider.embedQuery(request.query)
    return {
      type: request.type,
      data: this.retrievalQueryService.buildWorldVectorHits(queryVector, request.rows, request.topK)
    }
  }

  async retrieveMemoryVectorHits(
    request: RetrieveMemoryVectorRequest
  ): Promise<MemoryWorkerResponse<'retrieve-memory-vectors', MemoryDebugRetrievalHit[]>> {
    const queryVector = await request.provider.embedQuery(request.query)
    return {
      type: request.type,
      data: this.retrievalQueryService.buildMemoryVectorHits(
        queryVector,
        request.rows,
        request.topK
      )
    }
  }

  async buildVectorIndex(
    request: BuildVectorIndexRequest
  ): Promise<MemoryWorkerResponse<BuildVectorIndexRequest['type'], BuildVectorIndexResult>> {
    const runtimeMessage = await this.describeEmbeddingRuntime(request.provider)
    const vectors = await request.provider.embedDocuments(
      request.entries.map((entry) => entry.text),
      request.embedOptions
    )
    const fingerprint = await request.createFingerprint(vectors[0]?.length)

    return {
      type: request.type,
      data: {
        vectors,
        fingerprint,
        runtimeMessage
      }
    }
  }

  private async describeEmbeddingRuntime(provider: EmbeddingProvider): Promise<string | null> {
    const runtime = await provider.prepare?.()
    if (!runtime) {
      return null
    }

    if (runtime.fallbackToCpu) {
      return 'GPU unavailable, falling back to CPU for this build'
    }

    return runtime.actualDevice === 'gpu' ? 'Using GPU for this build' : 'Using CPU for this build'
  }
}
