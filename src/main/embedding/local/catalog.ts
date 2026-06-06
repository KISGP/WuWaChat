import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import type {
  InstalledLocalEmbeddingModel,
  LocalEmbeddingCatalogItem,
  LocalEmbeddingCatalogModel,
  LocalEmbeddingModelStatus
} from '@shared/memory-settings'
import {
  getBundledEmbeddingCatalogPath,
  getLocalEmbeddingRoot,
  pathExists,
  readOptionalFile,
  writeJsonFileAtomic
} from '@main/utils'
import { createStructuredError, normalizeErrorMessage } from './errors'
import type { InstalledModelManifest, InvalidModelStatus } from './types'

const DEFAULT_REQUIRED_MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model.onnx'
]

let modelCatalogCache: LocalEmbeddingCatalogModel[] | null = null

export function getCatalogPath(): string {
  return getBundledEmbeddingCatalogPath()
}

export function getAppModelRoot(): string {
  return getLocalEmbeddingRoot()
}

export function getMetadataRoot(): string {
  return join(getAppModelRoot(), '.manifests')
}

export function slugifyModelId(id: string): string {
  return id.replace(/[\\/]/g, '--')
}

export function getManifestDirectoryById(id: string): string {
  return join(getMetadataRoot(), slugifyModelId(id))
}

export function getPayloadDirectoryByRepoId(repoId: string): string {
  return join(getAppModelRoot(), ...repoId.split(/[\\/]/).filter(Boolean))
}

export function getManifestPath(modelId: string): string {
  return join(getManifestDirectoryById(modelId), 'model.json')
}

export function getInstallMarkerPath(modelId: string): string {
  return join(getManifestDirectoryById(modelId), '.download-complete')
}

export function createInvalidStatus(message: string): InvalidModelStatus {
  return {
    status: 'invalid',
    validationMessage: message
  }
}

export async function ensureWritableModelRoot(): Promise<string> {
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

export async function loadCatalogFile(): Promise<LocalEmbeddingCatalogModel[]> {
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

export async function readInstalledManifest(
  modelId: string
): Promise<InstalledModelManifest | null> {
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

export async function validateModelDirectory(
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

  const requiredFiles = catalogModel?.files || DEFAULT_REQUIRED_MODEL_FILES
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

export async function validateInstalledModel(
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
      return manifest || null
    })
  )

  return models.filter(Boolean) as InstalledLocalEmbeddingModel[]
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

export async function writeInstalledManifest(
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
