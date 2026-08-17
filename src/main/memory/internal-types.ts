import type { MemoryEntry } from '@shared/chat'
import type { EmbeddingFingerprint, MemoryDebugRetrievalHit } from '@shared/memory-settings'
import type { EmbedDocumentsOptions, EmbeddingProvider } from '@main/embedding/types'

export type MemorySearchRow = {
  id: string
  text: string
  sourceType?: 'chat' | 'summary' | null
  sessionId?: string | null
  characterId?: string | null
  vectorJson: string
}

export type RetrievalExecution = {
  hits: MemoryDebugRetrievalHit[]
  runtimeModeUsed: 'string' | 'vector' | 'degraded'
  fallbackReason?: string
}

export type RetrieveMemoryVectorRequest = {
  type: 'retrieve-memory-vectors'
  query: string
  provider: EmbeddingProvider
  rows: MemorySearchRow[]
  topK: number
}

export type BuildVectorIndexRequest = {
  type: 'build-character-memory-vectors'
  entries: MemoryEntry[]
  provider: EmbeddingProvider
  createFingerprint: (dimensions?: number) => Promise<EmbeddingFingerprint>
  embedOptions?: EmbedDocumentsOptions
}

export type MemoryWorkerRequest = RetrieveMemoryVectorRequest | BuildVectorIndexRequest

export type MemoryWorkerResponse<TType extends MemoryWorkerRequest['type'], TData> = {
  type: TType
  data: TData
}

export type BuildVectorIndexResult = {
  vectors: number[][]
  fingerprint: EmbeddingFingerprint
  runtimeMessage: string | null
}
