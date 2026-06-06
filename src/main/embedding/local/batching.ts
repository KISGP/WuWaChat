import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import type { EmbedDocumentsOptions } from '@main/embedding/types'
import { createStructuredError } from './errors'

type PipelineOutputLike = {
  tolist: () => unknown
}

function normalizeBatchOutput(raw: unknown, expectedCount: number): number[][] {
  if (!Array.isArray(raw)) {
    throw createStructuredError(
      '本地 embedding 输出异常',
      '执行本地向量化',
      '模型返回结果不是有效向量。',
      ['请确认当前模型支持 feature-extraction。', '如果是首次下载，请重新下载并确认文件完整。']
    )
  }

  if (expectedCount === 1 && raw.every((value) => typeof value === 'number')) {
    return [(raw as unknown[]).map((value) => Number(value))]
  }

  if (!raw.every((item) => Array.isArray(item))) {
    throw createStructuredError(
      '本地 embedding 输出异常',
      '执行本地向量化',
      '模型返回结果不是有效向量。',
      ['请确认当前模型支持 feature-extraction。', '如果是首次下载，请重新下载并确认文件完整。']
    )
  }

  return (raw as unknown[][]).map((row) => row.map((value) => Number(value)))
}

export function createBatches<T>(items: T[], batchSize: number): T[][] {
  const safeBatchSize = Math.max(1, Math.floor(batchSize))
  const batches: T[][] = []

  for (let index = 0; index < items.length; index += safeBatchSize) {
    batches.push(items.slice(index, index + safeBatchSize))
  }

  return batches
}

async function runFeatureExtraction(
  extractor: FeatureExtractionPipeline,
  texts: string[]
): Promise<number[][]> {
  const output = (await extractor(texts, {
    pooling: 'mean',
    normalize: true
  })) as PipelineOutputLike

  return normalizeBatchOutput(output.tolist(), texts.length)
}

export async function embedTextBatches(
  extractor: FeatureExtractionPipeline,
  texts: string[],
  batchSize: number,
  options?: EmbedDocumentsOptions
): Promise<number[][]> {
  if (texts.length === 0) {
    return []
  }

  const vectors: number[][] = []
  let completed = 0

  for (const batch of createBatches(texts, batchSize)) {
    const batchVectors = await runFeatureExtraction(extractor, batch)
    vectors.push(...batchVectors)
    completed += batch.length
    options?.onProgress?.({
      completed,
      total: texts.length
    })
  }

  return vectors
}
