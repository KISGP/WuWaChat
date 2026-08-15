import type { MemoryEntry } from '@shared/chat'
import type {
  EmbeddingFingerprint,
  IndexAvailability,
  IndexManifestRecord,
  MemoryRetrievalMode,
  WorldKnowledgeRouteStatus
} from '@shared/memory-settings'
import { getIndexRuntimeMode } from '@main/utils'

type StoryStatusArgs = {
  enabled: boolean
  retrievalMode: MemoryRetrievalMode
  entries: MemoryEntry[]
  manifest: IndexManifestRecord | null
  compatible: boolean
  fingerprint: EmbeddingFingerprint | null
  worldBundleError: string | null
  worldEntryCount: number
  isBuilding: boolean
}

/**
 * @description 计算 story route 当前索引可用性。
 * @param args story 相关上下文。
 * @returns story route 的索引可用性。
 */
export function getStoryAvailability({
  retrievalMode,
  entries,
  manifest,
  compatible,
  worldBundleError,
  worldEntryCount,
  isBuilding
}: StoryStatusArgs): IndexAvailability {
  if (isBuilding) {
    return 'building'
  }

  if (worldBundleError && worldEntryCount === 0) {
    return 'failed'
  }

  if (retrievalMode === 'string') {
    return entries.length > 0 ? 'ready' : 'missing'
  }

  if (entries.length === 0) {
    return 'missing'
  }

  if (!manifest) {
    return 'missing'
  }

  if (manifest.status === 'failed') {
    return 'failed'
  }

  return compatible ? 'ready' : 'incompatible'
}

/**
 * @description 生成 story route 的设置页展示状态。
 * @param args story 相关上下文。
 * @returns 可直接供 renderer 展示的 story 状态。
 */
export function buildStoryStatus(args: StoryStatusArgs): WorldKnowledgeRouteStatus {
  const availability = getStoryAvailability(args)

  return {
    scope: 'story',
    enabled: args.enabled,
    entryCount: args.manifest?.entryCount || args.entries.length,
    indexAvailability: availability,
    retrievalModeUsed: args.enabled
      ? getIndexRuntimeMode(args.retrievalMode, availability)
      : args.retrievalMode === 'string'
        ? 'string'
        : 'degraded',
    builtAt: args.manifest?.builtAt || null,
    fingerprint: args.fingerprint,
    message: buildStoryStatusMessage(args.enabled, availability)
  }
}

/**
 * @description 生成 story route 的降级说明。
 * @param availability 当前可用性。
 * @returns 调试与预览可复用的说明文本。
 */
export function getStoryCompatibilityReason(availability: IndexAvailability): string {
  if (availability === 'missing') {
    return 'Story vector index is missing, so the query fell back to keyword matching.'
  }

  if (availability === 'failed') {
    return 'Story vector index is marked as failed, so the query fell back to keyword matching.'
  }

  if (availability === 'building') {
    return 'Story vector index is still building, so the query fell back to keyword matching.'
  }

  return 'Story vector retrieval is unavailable, so the query fell back to keyword matching.'
}

/**
 * @description 生成 story route 在设置页中的状态文案。
 * @param enabled 当前是否启用 world 检索。
 * @param availability 当前 story 可用性。
 * @returns 可直接展示的中文说明。
 */
function buildStoryStatusMessage(enabled: boolean, availability: IndexAvailability): string {
  if (!enabled) {
    return '世界知识检索当前已关闭。'
  }

  switch (availability) {
    case 'ready':
      return ''
    case 'building':
      return '故事向量索引正在构建中，完成前会回退到字符串检索。'
    case 'incompatible':
      return '故事向量索引与当前 embedding 配置不一致，需要重新构建。'
    case 'failed':
      return '故事向量索引最近一次构建失败，建议检查配置后重新构建。'
    case 'missing':
    default:
      return '故事索引尚未准备完成，当前会回退到字符串检索。'
  }
}
