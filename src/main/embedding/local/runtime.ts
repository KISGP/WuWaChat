import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import type {
  LocalEmbeddingCatalogModel,
  InstalledLocalEmbeddingModel
} from '@shared/memory-settings'
import type {
  CatalogModelLike,
  LoadedFeatureExtractionPipeline,
  LocalEmbeddingDevice,
  LocalEmbeddingRuntimeSettings,
  ProgressReporter
} from './types'
import { createStructuredError, normalizeErrorMessage } from './errors'
import { getAppModelRoot, getPayloadDirectoryByRepoId } from './catalog'

const DEFAULT_HUGGING_FACE_REMOTE_HOST = 'https://huggingface.co'

const pipelineCache = new Map<string, Promise<LoadedFeatureExtractionPipeline>>()
const createFeatureExtraction = pipeline as (
  task: 'feature-extraction',
  model: string,
  options?: Record<string, unknown>
) => Promise<FeatureExtractionPipeline>

export function getRemoteHost(settings: LocalEmbeddingRuntimeSettings): string {
  if (settings.useHuggingFaceMirror && settings.huggingFaceMirrorUrl.trim()) {
    return settings.huggingFaceMirrorUrl.trim()
  }

  return DEFAULT_HUGGING_FACE_REMOTE_HOST
}

function setTransformersEnvironment(
  modelRoot: string,
  allowRemoteModels: boolean,
  settings: LocalEmbeddingRuntimeSettings
): string {
  const remoteHost = getRemoteHost(settings)
  env.allowLocalModels = true
  env.allowRemoteModels = allowRemoteModels
  env.localModelPath = modelRoot
  env.cacheDir = modelRoot
  env.useFSCache = true
  env.remoteHost = remoteHost
  return remoteHost
}

function toRepoModelPath(model: CatalogModelLike): string {
  return model.repoId
}

export function getPreferredDevice(settings: LocalEmbeddingRuntimeSettings): LocalEmbeddingDevice {
  return settings.useGpu ? 'gpu' : 'cpu'
}

function getPipelineCacheKey(
  model: CatalogModelLike,
  allowRemoteModels: boolean,
  remoteHost: string,
  settings: LocalEmbeddingRuntimeSettings
): string {
  const pipelineKeyBase =
    'modelPath' in model && model.modelPath
      ? model.modelPath
      : getPayloadDirectoryByRepoId(model.repoId)
  const sourceKey = allowRemoteModels ? remoteHost : 'local-only'
  const deviceKey = settings.useGpu ? 'gpu' : 'cpu'
  return `${pipelineKeyBase}|${sourceKey}|${deviceKey}`
}

function createPipelineLoadError(
  error: unknown,
  allowRemoteModels: boolean,
  device: LocalEmbeddingDevice
): Error {
  const suggestions = allowRemoteModels
    ? ['请确认模型仓库地址正确且可以访问。', '如果模型是私有仓库，请确认已经配置 HF_TOKEN。']
    : [
        '请确认本地模型目录位于 models/embeddings 下。',
        '请确认目录包含 config.json、tokenizer.json、tokenizer_config.json 和 onnx/model.onnx。'
      ]

  return createStructuredError(
    '本地模型加载失败',
    '初始化 Transformers.js',
    `${device === 'gpu' ? 'GPU 初始化失败。' : 'CPU 初始化失败。'}\n${normalizeErrorMessage(error)}`,
    suggestions
  )
}

async function createFeatureExtractionPipeline(
  repoId: string,
  modelLabel: string,
  settings: LocalEmbeddingRuntimeSettings,
  options: {
    allowRemoteModels: boolean
    onProgress?: ProgressReporter
  }
): Promise<LoadedFeatureExtractionPipeline> {
  const device = getPreferredDevice(settings)

  try {
    const loadedPipeline = await createFeatureExtraction('feature-extraction', repoId, {
      device,
      progress_callback: (event) => {
        if (!options.onProgress) {
          return
        }

        if (event.status === 'download') {
          options.onProgress(10, `开始下载 ${event.file || modelLabel}`)
          return
        }

        if (event.status === 'progress') {
          const progress = typeof event.progress === 'number' ? Math.round(event.progress) : 0
          options.onProgress(
            Math.max(10, Math.min(progress, 95)),
            `下载 ${event.file || modelLabel}`
          )
          return
        }

        if (event.status === 'done') {
          options.onProgress(98, `完成 ${event.file || modelLabel}`)
        }
      }
    })

    return {
      pipeline: loadedPipeline,
      runtime: {
        requestedDevice: device,
        actualDevice: device,
        fallbackToCpu: false
      }
    }
  } catch (error) {
    throw createPipelineLoadError(error, options.allowRemoteModels, device)
  }
}

export async function loadFeatureExtractionPipeline(
  model: InstalledLocalEmbeddingModel | LocalEmbeddingCatalogModel,
  settings: LocalEmbeddingRuntimeSettings,
  options?: {
    allowRemoteModels?: boolean
    onProgress?: ProgressReporter
  }
): Promise<LoadedFeatureExtractionPipeline> {
  const modelRoot = getAppModelRoot()
  const allowRemoteModels = options?.allowRemoteModels ?? false
  const onProgress = options?.onProgress
  const remoteHost = setTransformersEnvironment(modelRoot, allowRemoteModels, settings)
  const cacheKey = getPipelineCacheKey(model, allowRemoteModels, remoteHost, settings)
  let pipelinePromise = pipelineCache.get(cacheKey)

  if (!pipelinePromise) {
    const repoId = toRepoModelPath(model)
    pipelinePromise = createFeatureExtractionPipeline(repoId, model.label, settings, {
      allowRemoteModels,
      onProgress
    }).catch((error) => {
      pipelineCache.delete(cacheKey)
      throw error
    })

    pipelineCache.set(cacheKey, pipelinePromise)
  }

  return pipelinePromise
}

export function clearPipelineCacheByPrefix(prefix: string): void {
  for (const cacheKey of pipelineCache.keys()) {
    if (cacheKey.startsWith(prefix)) {
      pipelineCache.delete(cacheKey)
    }
  }
}

export function clearPipelineCacheForModel(
  model: InstalledLocalEmbeddingModel | LocalEmbeddingCatalogModel,
  allowRemoteModels: boolean,
  settings: LocalEmbeddingRuntimeSettings
): void {
  const remoteHost = getRemoteHost(settings)
  pipelineCache.delete(getPipelineCacheKey(model, allowRemoteModels, remoteHost, settings))
}
