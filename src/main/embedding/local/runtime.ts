import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import type {
  LocalEmbeddingCatalogModel,
  InstalledLocalEmbeddingModel
} from '@shared/memory-settings'
import { logger } from '@main/logging'
import { getAppModelRoot, getPayloadDirectoryByRepoId } from './catalog'
import { createStructuredError, normalizeErrorMessage } from './errors'
import type {
  CatalogModelLike,
  LoadedFeatureExtractionPipeline,
  LocalEmbeddingDevice,
  LocalEmbeddingRuntimeSettings,
  ProgressReporter
} from './types'

const DEFAULT_HUGGING_FACE_REMOTE_HOST = 'https://huggingface.co'
const PIPELINE_IDLE_TIMEOUT_MS = 5 * 60 * 1000

type CachedPipelineEntry = {
  promise: Promise<LoadedFeatureExtractionPipeline>
  lastUsedAt: number
  cleanupTimer: ReturnType<typeof setTimeout> | null
}

type DisposableFeatureExtractionPipeline = FeatureExtractionPipeline & {
  dispose?: () => void | Promise<void>
}

const pipelineCache = new Map<string, CachedPipelineEntry>()
const createFeatureExtraction = pipeline as (
  task: 'feature-extraction',
  model: string,
  options?: Record<string, unknown>
) => Promise<FeatureExtractionPipeline>

/**
 * @description 在允许远程模型访问的情况下，解析 Transformers.js 使用的远程主机地址。
 * @param settings 当前的本地 embedding 运行时设置。
 * @returns 生效的远程主机 URL。
 */
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

/**
 * @description 计算本地 embedding 请求的首选执行设备。
 * @param settings 当前的本地 embedding 运行时设置。
 * @returns 请求使用的本地 embedding 设备（'gpu' 或 'cpu'）。
 */
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
    ? [
        'Check whether the configured repository URL is reachable.',
        'If the model is private or restricted, configure HF_TOKEN before retrying.'
      ]
    : [
        'Check whether the local model directory exists under models/embeddings.',
        'Confirm the directory contains config.json, tokenizer files, and onnx/model.onnx.'
      ]

  return createStructuredError(
    'Local model load failed',
    'Initialize Transformers.js',
    `${device === 'gpu' ? 'GPU initialization failed.' : 'CPU initialization failed.'}\n${normalizeErrorMessage(error)}`,
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
          options.onProgress(10, `Start downloading ${event.file || modelLabel}`)
          return
        }

        if (event.status === 'progress') {
          const progress = typeof event.progress === 'number' ? Math.round(event.progress) : 0
          options.onProgress(
            Math.max(10, Math.min(progress, 95)),
            `Downloading ${event.file || modelLabel}`
          )
          return
        }

        if (event.status === 'done') {
          options.onProgress(98, `Finished ${event.file || modelLabel}`)
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

async function disposeLoadedPipeline(loaded: LoadedFeatureExtractionPipeline): Promise<void> {
  const disposablePipeline = loaded.pipeline as DisposableFeatureExtractionPipeline
  await Promise.resolve(disposablePipeline.dispose?.())
}

function touchPipelineCacheEntry(cacheKey: string, entry: CachedPipelineEntry): void {
  entry.lastUsedAt = Date.now()

  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer)
  }

  entry.cleanupTimer = setTimeout(() => {
    const current = pipelineCache.get(cacheKey)
    if (!current || current !== entry) {
      return
    }

    const idleMs = Date.now() - entry.lastUsedAt
    if (idleMs < PIPELINE_IDLE_TIMEOUT_MS) {
      touchPipelineCacheEntry(cacheKey, entry)
      return
    }

    evictPipelineCacheEntry(cacheKey, entry, 'idle-timeout')
  }, PIPELINE_IDLE_TIMEOUT_MS)
}

async function disposePipelineCacheEntry(
  cacheKey: string,
  entry: CachedPipelineEntry,
  reason: 'idle-timeout' | 'manual-clear'
): Promise<void> {
  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer)
    entry.cleanupTimer = null
  }

  if (pipelineCache.get(cacheKey) === entry) {
    pipelineCache.delete(cacheKey)
  }

  try {
    const loaded = await entry.promise
    await disposeLoadedPipeline(loaded)
    void logger.info('memory', 'embedding-pipeline-disposed', 'Disposed local embedding pipeline', {
      cacheKey,
      reason
    })
  } catch (error) {
    void logger.warn(
      'memory',
      'embedding-pipeline-dispose-failed',
      'Failed to dispose local embedding pipeline',
      {
        cacheKey,
        reason,
        error: error instanceof Error ? error.message : String(error)
      }
    )
  }
}

function evictPipelineCacheEntry(
  cacheKey: string,
  entry: CachedPipelineEntry,
  reason: 'idle-timeout' | 'manual-clear'
): void {
  void disposePipelineCacheEntry(cacheKey, entry, reason)
}

function clearPipelineEntries(
  predicate: (cacheKey: string, entry: CachedPipelineEntry) => boolean
): void {
  for (const [cacheKey, entry] of pipelineCache.entries()) {
    if (predicate(cacheKey, entry)) {
      evictPipelineCacheEntry(cacheKey, entry, 'manual-clear')
    }
  }
}

/**
 * @description 加载或重用本地特征提取 pipeline，并为缓存条目安排空闲清理。
 * @param model 要加载的本地 embedding 模型。
 * @param settings 当前的本地 embedding 运行时设置。
 * @param options 可选的远程下载与进度设置。
 * @returns 已加载或缓存的特征提取 pipeline 及其运行时元数据。
 */
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
  const cachedEntry = pipelineCache.get(cacheKey)

  if (cachedEntry) {
    touchPipelineCacheEntry(cacheKey, cachedEntry)
    return cachedEntry.promise
  }

  const repoId = toRepoModelPath(model)
  const entry: CachedPipelineEntry = {
    lastUsedAt: Date.now(),
    cleanupTimer: null,
    promise: Promise.resolve(null as never)
  }

  entry.promise = createFeatureExtractionPipeline(repoId, model.label, settings, {
    allowRemoteModels,
    onProgress
  })
    .then((loaded) => {
      void logger.info('memory', 'embedding-pipeline-loaded', 'Loaded local embedding pipeline', {
        cacheKey,
        repoId,
        requestedDevice: loaded.runtime.requestedDevice,
        actualDevice: loaded.runtime.actualDevice,
        allowRemoteModels
      })
      return loaded
    })
    .catch((error) => {
      const current = pipelineCache.get(cacheKey)
      if (current === entry) {
        pipelineCache.delete(cacheKey)
      }
      throw error
    })

  pipelineCache.set(cacheKey, entry)
  touchPipelineCacheEntry(cacheKey, entry)
  return entry.promise
}

/**
 * @description 清除缓存中以指定前缀开头的本地 embedding pipeline 条目。
 * @param prefix 要匹配的缓存键前缀。
 */
export function clearPipelineCacheByPrefix(prefix: string): void {
  clearPipelineEntries((cacheKey) => cacheKey.startsWith(prefix))
}

/**
 * @description 清除为给定模型与运行时设置创建的本地 embedding pipeline 缓存条目。
 * @param model 目标模型。
 * @param allowRemoteModels 缓存条目是否在启用远程访问时创建。
 * @param settings 用于构建缓存键的运行时设置。
 */
export function clearPipelineCacheForModel(
  model: InstalledLocalEmbeddingModel | LocalEmbeddingCatalogModel,
  allowRemoteModels: boolean,
  settings: LocalEmbeddingRuntimeSettings
): void {
  const remoteHost = getRemoteHost(settings)
  const targetKey = getPipelineCacheKey(model, allowRemoteModels, remoteHost, settings)
  clearPipelineEntries((cacheKey) => cacheKey === targetKey)
}

/**
 * @description 清除当前进程中所有的本地 embedding pipeline 缓存。
 */
export function clearAllPipelineCaches(): void {
  clearPipelineEntries(() => true)
}
