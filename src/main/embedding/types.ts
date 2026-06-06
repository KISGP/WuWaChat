import type { EmbeddingConnectionTestResult } from '@shared/memory-settings'

export type EmbeddingRuntimeInfo = {
  requestedDevice: 'cpu' | 'gpu'
  actualDevice: 'cpu' | 'gpu'
  fallbackToCpu: boolean
}

export type EmbeddingBatchProgress = {
  completed: number
  total: number
}

export type EmbedDocumentsOptions = {
  onProgress?: (progress: EmbeddingBatchProgress) => void
  abortSignal?: AbortSignal
  throwIfAborted?: () => void
}

export type EmbeddingProvider = {
  embedDocuments: (texts: string[], options?: EmbedDocumentsOptions) => Promise<number[][]>
  embedQuery: (text: string) => Promise<number[]>
  testConnection: () => Promise<EmbeddingConnectionTestResult>
  prepare?: () => Promise<EmbeddingRuntimeInfo>
}
