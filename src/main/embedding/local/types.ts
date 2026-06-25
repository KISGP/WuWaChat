import type {
  InstalledLocalEmbeddingModel,
  LocalEmbeddingCatalogModel,
  LocalEmbeddingModelStatus,
  LocalEmbeddingSettings
} from '@shared/memory-settings'
import type { EmbeddingRuntimeInfo } from '@main/embedding/types'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'

export type ProgressReporter = (progress: number, message: string) => void

export type InstalledModelManifest = InstalledLocalEmbeddingModel

export type LocalEmbeddingRuntimeSettings = Pick<
  LocalEmbeddingSettings,
  'useGpu' | 'useHuggingFaceMirror' | 'huggingFaceMirrorUrl' | 'batchSize'
>

export type LocalEmbeddingDevice = 'cpu' | 'gpu'

export type LoadedFeatureExtractionPipeline = {
  pipeline: FeatureExtractionPipeline
  runtime: EmbeddingRuntimeInfo
}

export type InvalidModelStatus = {
  status: LocalEmbeddingModelStatus
  validationMessage: string
}

export type LocalChunker<TInput = string, TChunk = string> = {
  split: (input: TInput) => TChunk[]
}

export type CatalogModelLike = InstalledLocalEmbeddingModel | LocalEmbeddingCatalogModel
