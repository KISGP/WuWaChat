import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { env, type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers'
import type {
  EmbeddingConnectionTestResult,
  EmbeddingFingerprint,
  InstalledLocalEmbeddingModel,
  LocalEmbeddingCatalogItem,
  LocalEmbeddingCatalogModel,
  LocalEmbeddingModelStatus,
  LocalEmbeddingSettings
} from '../../../shared/memory-settings'
import {
  getBundledEmbeddingCatalogPath,
  getLocalEmbeddingRoot,
  pathExists,
  readOptionalFile,
  writeJsonFileAtomic
} from '../../utils'

type ProgressReporter = (progress: number, message: string) => void
type InstalledModelManifest = InstalledLocalEmbeddingModel
type LocalEmbeddingRuntimeSettings = Pick<
  LocalEmbeddingSettings,
  'useGpu' | 'useHuggingFaceMirror' | 'huggingFaceMirrorUrl'
>
type LocalEmbeddingDevice = 'cpu' | 'gpu'
type LocalEmbeddingRuntimeInfo = {
  requestedDevice: LocalEmbeddingDevice
  actualDevice: LocalEmbeddingDevice
  fallbackToCpu: boolean
}
type LoadedFeatureExtractionPipeline = {
  pipeline: FeatureExtractionPipeline
  runtime: LocalEmbeddingRuntimeInfo
}

const DEFAULT_HUGGING_FACE_REMOTE_HOST = 'https://huggingface.co'

let modelCatalogCache: LocalEmbeddingCatalogModel[] | null = null
const pipelineCache = new Map<string, Promise<LoadedFeatureExtractionPipeline>>()
const createFeatureExtraction = pipeline as (
  task: 'feature-extraction',
  model: string,
  options?: Record<string, unknown>
) => Promise<FeatureExtractionPipeline>

function createStructuredError(
  title: string,
  stage: string,
  reason: string,
  suggestions: string[]
): Error {
  return new Error(
    [
      `标题：${title}`,
      `阶段：${stage}`,
      `原因：${reason}`,
      ...suggestions.map((item, index) => `建议${index + 1}：${item}`)
    ].join('\n')
  )
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getCatalogPath(): string {
  return getBundledEmbeddingCatalogPath()
}

function getAppModelRoot(): string {
  return getLocalEmbeddingRoot()
}

function getMetadataRoot(): string {
  return join(getAppModelRoot(), '.manifests')
}

function slugifyModelId(id: string): string {
  return id.replace(/[\\/]/g, '--')
}

function getManifestDirectoryById(id: string): string {
  return join(getMetadataRoot(), slugifyModelId(id))
}

function getPayloadDirectoryByRepoId(repoId: string): string {
  return join(getAppModelRoot(), ...repoId.split(/[\\/]/).filter(Boolean))
}

function getManifestPath(modelId: string): string {
  return join(getManifestDirectoryById(modelId), 'model.json')
}

function getInstallMarkerPath(modelId: string): string {
  return join(getManifestDirectoryById(modelId), '.download-complete')
}

function getRemoteHost(settings: LocalEmbeddingRuntimeSettings): string {
  if (settings.useHuggingFaceMirror && settings.huggingFaceMirrorUrl.trim()) {
    return settings.huggingFaceMirrorUrl.trim()
  }

  return DEFAULT_HUGGING_FACE_REMOTE_HOST
}

function createInvalidStatus(message: string): {
  status: LocalEmbeddingModelStatus
  validationMessage: string
} {
  return {
    status: 'invalid',
    validationMessage: message
  }
}

async function ensureWritableModelRoot(): Promise<string> {
  const root = getAppModelRoot()
  try {
    await mkdir(root, { recursive: true })
    const testFile = join(root, '.write-test')
    await writeFile(testFile, 'ok', 'utf-8')
    await rm(testFile, { force: true })
  } catch (error) {
    throw createStructuredError(
      '模型目录不可写',
      '准备模型目录',
      `${root}\n${normalizeErrorMessage(error)}`,
      [
        '请确认应用数据目录具有写入权限。',
        '如果是打包版本，请检查 userData/app-data 目录是否可写。'
      ]
    )
  }

  return root
}

async function loadCatalogFile(): Promise<LocalEmbeddingCatalogModel[]> {
  if (modelCatalogCache) {
    return modelCatalogCache
  }

  try {
    const content = await readFile(getCatalogPath(), 'utf-8')
    const parsed = JSON.parse(content) as LocalEmbeddingCatalogModel[]
    modelCatalogCache = Array.isArray(parsed) ? parsed : []
    return modelCatalogCache
  } catch (error) {
    throw createStructuredError(
      '读取模型清单失败',
      '加载 embedding.json',
      normalizeErrorMessage(error),
      [
        '请确认内置资源目录中的 embedding.json 存在且格式正确。',
        '如果刚修改过模型清单，请检查 JSON 语法。'
      ]
    )
  }
}

async function readInstalledManifest(modelId: string): Promise<InstalledModelManifest | null> {
  const content = await readOptionalFile(getManifestPath(modelId))
  if (!content) {
    return null
  }

  try {
    return JSON.parse(content) as InstalledModelManifest
  } catch {
    return null
  }
}

async function readInstalledManifestFromDirectory(
  dir: string
): Promise<InstalledModelManifest | null> {
  const content = await readOptionalFile(join(dir, 'model.json'))
  if (!content) {
    return null
  }

  try {
    return JSON.parse(content) as InstalledModelManifest
  } catch {
    return null
  }
}

async function validateModelDirectory(
  modelDir: string,
  catalogModel?: LocalEmbeddingCatalogModel
): Promise<{ ok: boolean; message?: string }> {
  const modelRoot = resolve(getAppModelRoot())
  const metadataRoot = resolve(getMetadataRoot())
  const resolvedModelDir = resolve(modelDir)

  if (!resolvedModelDir.startsWith(modelRoot) || resolvedModelDir.startsWith(metadataRoot)) {
    return {
      ok: false,
      message: `本地模型目录无效：${modelDir}`
    }
  }

  const requiredFiles = catalogModel?.files || [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'onnx/model.onnx'
  ]

  for (const relativePath of requiredFiles) {
    if (!(await pathExists(join(resolvedModelDir, relativePath)))) {
      return {
        ok: false,
        message: `缺少本地模型文件：${relativePath}`
      }
    }
  }

  return { ok: true }
}

async function validateInstalledModel(
  model: InstalledLocalEmbeddingModel,
  catalogModel?: LocalEmbeddingCatalogModel
): Promise<{ ok: boolean; message?: string }> {
  if (
    !(await pathExists(getManifestPath(model.id))) ||
    !(await pathExists(getInstallMarkerPath(model.id)))
  ) {
    return {
      ok: false,
      message: '本地模型元数据不存在或未完成安装。'
    }
  }

  return validateModelDirectory(model.modelPath, catalogModel)
}

async function listInstalledModelDirectories(): Promise<string[]> {
  const root = getMetadataRoot()
  if (!(await pathExists(root))) {
    return []
  }

  const entries = await readdir(root, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name))
}

async function listInstalledModels(): Promise<InstalledLocalEmbeddingModel[]> {
  const dirs = await listInstalledModelDirectories()
  const models = await Promise.all(
    dirs.map(async (dir) => {
      const manifest = await readInstalledManifestFromDirectory(dir)
      if (!manifest) {
        return null
      }

      return manifest
    })
  )

  return models.filter(Boolean) as InstalledLocalEmbeddingModel[]
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

function toRepoModelPath(model: InstalledLocalEmbeddingModel | LocalEmbeddingCatalogModel): string {
  return model.repoId
}

function getPreferredDevice(settings: LocalEmbeddingRuntimeSettings): LocalEmbeddingDevice {
  return settings.useGpu ? 'gpu' : 'cpu'
}

function getPipelineCacheKey(
  model: InstalledLocalEmbeddingModel | LocalEmbeddingCatalogModel,
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
  return `${resolve(pipelineKeyBase)}|${sourceKey}|${deviceKey}`
}

function createPipelineLoadError(
  error: unknown,
  allowRemoteModels: boolean,
  runtime: LocalEmbeddingRuntimeInfo
): Error {
  const suggestions = allowRemoteModels
    ? ['请确认模型仓库地址正确且可以访问。', '如果模型是私有仓库，请确认已经配置 HF_TOKEN。']
    : [
        '请确认本地模型目录位于 models/embeddings 下。',
        '请确认目录包含 config.json、tokenizer.json、tokenizer_config.json 和 onnx/model.onnx。'
      ]
  const deviceSummary = runtime.fallbackToCpu
    ? 'GPU 初始化失败，回退 CPU 后也失败。'
    : runtime.requestedDevice === 'gpu'
      ? 'GPU 初始化失败。'
      : 'CPU 初始化失败。'

  return createStructuredError(
    '本地模型加载失败',
    '初始化 Transformers.js',
    `${deviceSummary}\n${normalizeErrorMessage(error)}`,
    suggestions
  )
}

async function createFeatureExtractionPipeline(
  repoId: string,
  modelLabel: string,
  settings: LocalEmbeddingRuntimeSettings,
  options: {
    cacheKey: string
    allowRemoteModels: boolean
    onProgress?: ProgressReporter
  }
): Promise<LoadedFeatureExtractionPipeline> {
  const preferredDevice = getPreferredDevice(settings)

  const createForDevice = async (
    device: LocalEmbeddingDevice
  ): Promise<LoadedFeatureExtractionPipeline> => {
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
        requestedDevice: preferredDevice,
        actualDevice: device,
        fallbackToCpu: preferredDevice === 'gpu' && device === 'cpu'
      }
    }
  }

  try {
    return await createForDevice(preferredDevice)
  } catch (error) {
    if (preferredDevice !== 'gpu') {
      throw createPipelineLoadError(error, options.allowRemoteModels, {
        requestedDevice: preferredDevice,
        actualDevice: preferredDevice,
        fallbackToCpu: false
      })
    }

    pipelineCache.delete(options.cacheKey)

    try {
      return await createForDevice('cpu')
    } catch (cpuError) {
      throw createPipelineLoadError(cpuError, options.allowRemoteModels, {
        requestedDevice: 'gpu',
        actualDevice: 'cpu',
        fallbackToCpu: true
      })
    }
  }
}

async function loadFeatureExtractionPipeline(
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
      cacheKey,
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

async function embedText(
  model: InstalledLocalEmbeddingModel,
  settings: LocalEmbeddingRuntimeSettings,
  text: string
): Promise<number[]> {
  const validation = await validateInstalledModel(model)
  if (!validation.ok) {
    throw createStructuredError(
      '本地模型加载失败',
      '校验本地模型目录',
      validation.message || '本地模型目录无效。',
      ['请重新下载该模型。', '请确认模型文件位于应用数据目录的 models/embeddings 规范目录中。']
    )
  }

  const { pipeline: extractor } = await loadFeatureExtractionPipeline(model, settings, {
    allowRemoteModels: false
  })
  const output = await extractor(text, {
    pooling: 'mean',
    normalize: true
  })

  const vector = output.tolist()
  if (!Array.isArray(vector)) {
    throw createStructuredError(
      '本地 embedding 输出异常',
      '执行本地向量化',
      '模型返回结果不是有效向量。',
      ['请确认当前模型支持 feature-extraction。', '如果是首次下载，请重新下载并确认文件完整。']
    )
  }

  return (Array.isArray(vector[0]) ? vector[0] : vector).map((value) => Number(value))
}

function inferDimensions(vector: number[]): number {
  return vector.length
}

async function writeInstalledManifest(
  model: LocalEmbeddingCatalogModel
): Promise<InstalledLocalEmbeddingModel> {
  const modelDir = getPayloadDirectoryByRepoId(model.repoId)
  const manifestDir = getManifestDirectoryById(model.id)
  const installedModel: InstalledLocalEmbeddingModel = {
    id: model.id,
    repoId: model.repoId,
    label: model.label,
    source: 'builtin',
    installedAt: new Date().toISOString(),
    dimensions: model.dimensions,
    runtime: 'transformers-js',
    modelPath: modelDir
  }

  await mkdir(modelDir, { recursive: true })
  await mkdir(manifestDir, { recursive: true })
  await writeJsonFileAtomic(getManifestPath(model.id), installedModel)
  await writeFile(getInstallMarkerPath(model.id), installedModel.installedAt, 'utf-8')
  return installedModel
}

export function createLocalEmbeddingFingerprint(
  model: InstalledLocalEmbeddingModel
): EmbeddingFingerprint {
  return {
    mode: 'local',
    provider: model.runtime,
    model: model.id,
    dimensions: model.dimensions,
    implementationVersion: `transformers-js-v1:${model.repoId}`,
    createdAt: new Date().toISOString()
  }
}

export class LocalEmbeddingProvider {
  private runtimeInfo: LocalEmbeddingRuntimeInfo | null = null

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

  async prepare(): Promise<LocalEmbeddingRuntimeInfo> {
    await this.ensurePipeline()
    return (
      this.runtimeInfo || {
        requestedDevice: getPreferredDevice(this.settings),
        actualDevice: this.settings.useGpu ? 'gpu' : 'cpu',
        fallbackToCpu: false
      }
    )
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    await this.ensurePipeline()
    const vectors: number[][] = []
    for (const text of texts) {
      vectors.push(await embedText(this.model, this.settings, text))
    }
    return vectors
  }

  async embedQuery(text: string): Promise<number[]> {
    await this.ensurePipeline()
    return embedText(this.model, this.settings, text)
  }

  async testConnection(): Promise<EmbeddingConnectionTestResult> {
    const startedAt = Date.now()
    try {
      const vector = await this.embedQuery('ping')
      const runtime = this.runtimeInfo || {
        requestedDevice: getPreferredDevice(this.settings),
        actualDevice: this.settings.useGpu ? 'gpu' : 'cpu',
        fallbackToCpu: false
      }
      const runtimeMessage = runtime.fallbackToCpu
        ? 'GPU 不可用，已回退到 CPU。'
        : runtime.actualDevice === 'gpu'
          ? '当前运行在 GPU。'
          : '当前运行在 CPU。'
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        dimensions: inferDimensions(vector),
        message: `本地 embedding 模型可用，返回 ${inferDimensions(vector)} 维向量。\n${runtimeMessage}`
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

export async function listLocalEmbeddingModels(
  selectedModelId: string
): Promise<LocalEmbeddingCatalogItem[]> {
  const [catalog, installedModels] = await Promise.all([loadCatalogFile(), listInstalledModels()])
  const installedById = new Map(installedModels.map((item) => [item.id, item]))
  const items: LocalEmbeddingCatalogItem[] = []

  for (const model of catalog) {
    const installedModel = installedById.get(model.id) || null
    let status: LocalEmbeddingModelStatus = installedModel ? 'installed' : 'not-downloaded'
    let validationMessage: string | undefined

    if (installedModel) {
      const validation = await validateInstalledModel(installedModel, model)
      if (!validation.ok) {
        const invalid = createInvalidStatus(validation.message || '本地模型文件不完整。')
        status = invalid.status
        validationMessage = invalid.validationMessage
      }
    }

    items.push({
      ...model,
      status,
      installedModel,
      isSelected: model.id === selectedModelId,
      validationMessage
    })
  }

  return items
}

export async function downloadLocalEmbeddingModel(
  modelId: string,
  settings: LocalEmbeddingRuntimeSettings,
  onProgress?: ProgressReporter
): Promise<InstalledLocalEmbeddingModel> {
  const catalog = await loadCatalogFile()
  const model = catalog.find((item) => item.id === modelId)
  if (!model) {
    throw createStructuredError(
      '模型不存在',
      '解析模型清单',
      `未在 embedding.json 中找到模型：${modelId}`,
      ['请刷新模型列表后重试。', '如果修改过 embedding.json，请确认 id 与卡片模型一致。']
    )
  }

  await ensureWritableModelRoot()

  try {
    onProgress?.(5, `准备下载 ${model.label}`)
    await loadFeatureExtractionPipeline(model, settings, {
      allowRemoteModels: true,
      onProgress
    })
    onProgress?.(96, '校验本地模型文件')

    const installedModel = await writeInstalledManifest(model)
    const validation = await validateInstalledModel(installedModel, model)
    if (!validation.ok) {
      throw createStructuredError(
        '模型文件校验失败',
        '校验自动下载结果',
        validation.message || '自动下载后的模型文件不完整。',
        ['请重新下载该模型。', '请确认模型目录内包含 Transformers.js 所需文件。']
      )
    }

    onProgress?.(100, `${model.label} 下载完成`)
    return installedModel
  } catch (error) {
    pipelineCache.delete(getPipelineCacheKey(model, true, getRemoteHost(settings), settings))
    throw createStructuredError(
      '模型下载失败',
      'Transformers.js 自动下载',
      normalizeErrorMessage(error),
      [
        '请检查网络是否可以访问 huggingface.co。',
        '如果模型是私有或受限仓库，请先配置 HF_TOKEN 环境变量。'
      ]
    )
  }
}

export async function removeLocalEmbeddingModel(modelId: string): Promise<boolean> {
  const manifest = await readInstalledManifest(modelId)
  if (!manifest) {
    return false
  }

  const root = resolve(getAppModelRoot())
  const resolvedTarget = resolve(manifest.modelPath)
  const resolvedManifestDir = resolve(getManifestDirectoryById(modelId))
  if (!resolvedTarget.startsWith(root) || !resolvedManifestDir.startsWith(root)) {
    return false
  }

  if (!(await pathExists(resolvedTarget))) {
    return false
  }

  await rm(resolvedTarget, { recursive: true, force: true })
  await rm(resolvedManifestDir, { recursive: true, force: true })
  for (const cacheKey of pipelineCache.keys()) {
    if (cacheKey.startsWith(`${resolvedTarget}|`)) {
      pipelineCache.delete(cacheKey)
    }
  }
  return true
}

export async function getInstalledLocalEmbeddingModel(
  modelId: string
): Promise<InstalledLocalEmbeddingModel | null> {
  const manifest = await readInstalledManifest(modelId)
  if (!manifest) {
    return null
  }

  const catalog = await loadCatalogFile()
  const catalogModel = catalog.find((item) => item.id === modelId)
  const validation = await validateInstalledModel(manifest, catalogModel)
  if (!validation.ok) {
    return null
  }

  return manifest
}
