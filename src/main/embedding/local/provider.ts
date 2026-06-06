import type {
  EmbeddingConnectionTestResult,
  InstalledLocalEmbeddingModel
} from '@shared/memory-settings'
import type { EmbedDocumentsOptions, EmbeddingRuntimeInfo } from '@main/embedding/types'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import { embedTextBatches } from './batching'
import { createStructuredError, normalizeErrorMessage } from './errors'
import { loadFeatureExtractionPipeline } from './runtime'
import { validateInstalledModel } from './catalog'
import { getPreferredDevice } from './runtime'
import type { LocalEmbeddingRuntimeSettings } from './types'

export class LocalEmbeddingProvider {
  private runtimeInfo: EmbeddingRuntimeInfo | null = null

  constructor(
    private readonly model: InstalledLocalEmbeddingModel,
    private readonly settings: LocalEmbeddingRuntimeSettings
  ) {}

  private async ensurePipeline(): Promise<FeatureExtractionPipeline> {
    const loaded = await loadFeatureExtractionPipeline(this.model, this.settings, {
      allowRemoteModels: false
    })
    this.runtimeInfo = loaded.runtime
    return loaded.pipeline
  }

  private async ensureValidatedModel(): Promise<void> {
    const validation = await validateInstalledModel(this.model)
    if (!validation.ok) {
      throw createStructuredError(
        '本地模型加载失败',
        '校验本地模型目录',
        validation.message || '本地模型目录无效。',
        ['请重新下载该模型。', '请确认模型文件位于应用数据目录的 models/embeddings 规范目录中。']
      )
    }
  }

  async prepare(): Promise<EmbeddingRuntimeInfo> {
    await this.ensureValidatedModel()
    await this.ensurePipeline()
    const device = getPreferredDevice(this.settings)
    return (
      this.runtimeInfo || {
        requestedDevice: device,
        actualDevice: device,
        fallbackToCpu: false
      }
    )
  }

  async embedDocuments(texts: string[], options?: EmbedDocumentsOptions): Promise<number[][]> {
    await this.ensureValidatedModel()
    const extractor = await this.ensurePipeline()
    return embedTextBatches(extractor, texts, this.settings.batchSize, options)
  }

  async embedQuery(text: string): Promise<number[]> {
    const results = await this.embedDocuments([text])
    return results[0] || []
  }

  async testConnection(): Promise<EmbeddingConnectionTestResult> {
    const startedAt = Date.now()
    try {
      const vector = await this.embedQuery('ping')
      const device = getPreferredDevice(this.settings)
      const runtime = this.runtimeInfo || {
        requestedDevice: device,
        actualDevice: device,
        fallbackToCpu: false
      }
      const runtimeMessage =
        runtime.actualDevice === 'gpu' ? '当前运行在 GPU。' : '当前运行在 CPU。'
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        dimensions: vector.length,
        message: `本地 embedding 模型可用，返回 ${vector.length} 维向量。\n${runtimeMessage}`
      }
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: normalizeErrorMessage(error)
      }
    }
  }
}
