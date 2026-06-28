import type { MemoryEntry } from '@shared/chat'
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

/**
 * @description 生成用于 embedding 的检索文本，确保 glossary 术语本身进入向量空间。
 * @param entry 待向量化的记忆或知识条目。
 * @returns 用于 embedding provider 的文本。
 */
function formatEntryForEmbedding(entry: MemoryEntry): string {
  if (entry.sourceType === 'glossary' && entry.term?.trim()) {
    return `${entry.term.trim()}\n${entry.text}`
  }

  return entry.text
}

export class MemoryWorkerRuntime {
  constructor(private readonly retrievalQueryService: RetrievalQueryService) {}

  async retrieveKnowledgeVectorHits(
    request: RetrieveWorldVectorRequest
  ): Promise<MemoryWorkerResponse<'retrieve-knowledge-vectors', MemoryDebugRetrievalHit[]>> {
    const queryVector = await request.provider.embedQuery(request.query)
    return {
      type: request.type,
      data: this.retrievalQueryService.buildKnowledgeVectorHits(
        request.scope,
        queryVector,
        request.rows,
        request.topK
      )
    }
  }

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

  async buildVectorIndex(
    request: BuildVectorIndexRequest
  ): Promise<MemoryWorkerResponse<BuildVectorIndexRequest['type'], BuildVectorIndexResult>> {
    const runtimeMessage = await this.describeEmbeddingRuntime(request.provider)
    const vectors = await request.provider.embedDocuments(
      request.entries.map(formatEntryForEmbedding),
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
