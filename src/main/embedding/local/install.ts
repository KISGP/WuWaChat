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
    clearPipelineCacheForModel(model, true, settings)
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

  await rm(resolvedTarget, { recursive: true, force: true })
  await rm(resolvedManifestDir, { recursive: true, force: true })
  clearPipelineCacheByPrefix(`${resolvedTarget}|`)
  return true
}
