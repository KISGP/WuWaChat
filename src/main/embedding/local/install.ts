import { rm } from 'fs/promises'
import { resolve } from 'path'
import type { InstalledLocalEmbeddingModel } from '@shared/memory-settings'
import { createStructuredError, normalizeErrorMessage } from './errors'
import {
  ensureWritableModelRoot,
  getAppModelRoot,
  getManifestDirectoryById,
  loadCatalogFile,
  readInstalledManifest,
  validateInstalledModel,
  writeInstalledManifest
} from './catalog'
import {
  clearPipelineCacheByPrefix,
  clearPipelineCacheForModel,
  loadFeatureExtractionPipeline
} from './runtime'
import type { LocalEmbeddingRuntimeSettings, ProgressReporter } from './types'

/**
 * @description 下载并安装本地 embedding 模型，验证安装文件并写入安装清单。
 * @param modelId 要下载的 catalog 模型 ID。
 * @param settings 用于初始下载和验证加载的运行时设置。
 * @param onProgress 可选的进度回调，用于 UI 显示。
 * @returns 已安装的本地 embedding 模型元数据。
 */
export async function downloadLocalEmbeddingModel(
  modelId: string,
  settings: LocalEmbeddingRuntimeSettings,
  onProgress?: ProgressReporter
): Promise<InstalledLocalEmbeddingModel> {
  const catalog = await loadCatalogFile()
  const model = catalog.find((item) => item.id === modelId)
  if (!model) {
    throw createStructuredError(
      'Model not found',
      'Resolve embedding catalog entry',
      `Could not find model "${modelId}" in embedding.json.`,
      [
        'Refresh the model list and try again.',
        'If you edited embedding.json, make sure the id matches the model card entry.'
      ]
    )
  }

  await ensureWritableModelRoot()

  try {
    onProgress?.(5, `Preparing download for ${model.label}`)
    await loadFeatureExtractionPipeline(model, settings, {
      allowRemoteModels: true,
      onProgress
    })
    onProgress?.(96, 'Validating downloaded local model files')

    const installedModel = await writeInstalledManifest(model)
    const validation = await validateInstalledModel(installedModel, model)
    if (!validation.ok) {
      throw createStructuredError(
        'Model validation failed',
        'Validate downloaded model files',
        validation.message || 'Downloaded model files are incomplete or invalid.',
        [
          'Download the model again.',
          'Confirm the installed directory contains the required Transformers.js files.'
        ]
      )
    }

    onProgress?.(100, `${model.label} downloaded successfully`)
    clearPipelineCacheForModel(model, true, settings)
    return installedModel
  } catch (error) {
    clearPipelineCacheForModel(model, true, settings)
    throw createStructuredError(
      'Model download failed',
      'Transformers.js automatic download',
      normalizeErrorMessage(error),
      [
        'Check whether the current network can reach huggingface.co.',
        'If the model is private or restricted, configure HF_TOKEN before retrying.'
      ]
    )
  }
}

/**
 * @description 删除已安装的本地 embedding 模型，并清除匹配的运行时缓存条目。
 * @param modelId 要移除的已安装模型 ID。
 * @returns 如果模型已从磁盘移除则返回 `true`。
 */
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

  await rm(resolvedTarget, { recursive: true, force: true })
  await rm(resolvedManifestDir, { recursive: true, force: true })
  clearPipelineCacheByPrefix(`${resolvedTarget}|`)
  return true
}
