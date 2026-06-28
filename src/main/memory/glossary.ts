import type { MemoryEntry } from '@shared/chat'
import type {
  EmbeddingFingerprint,
  IndexAvailability,
  IndexManifestRecord,
  MemoryRetrievalMode,
  WorldKnowledgeRouteStatus
} from '@shared/memory-settings'
import { getIndexRuntimeMode } from '@main/utils'

type GlossaryStatusArgs = {
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
 * @description 计算 glossary route 当前索引可用性。
 * @param args glossary 相关上下文。
 * @returns glossary route 的索引可用性。
 */
export function getGlossaryAvailability({
  retrievalMode,
  entries,
  manifest,
  compatible,
  worldBundleError,
  worldEntryCount,
  isBuilding
}: GlossaryStatusArgs): IndexAvailability {
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
 * @description 生成 glossary route 的设置页展示状态。
 * @param args glossary 相关上下文。
 * @returns 可直接供 renderer 展示的 glossary 状态。
 */
export function buildGlossaryStatus(args: GlossaryStatusArgs): WorldKnowledgeRouteStatus {
  const availability = getGlossaryAvailability(args)

  return {
    scope: 'glossary',
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
    message: buildGlossaryStatusMessage(args.enabled, availability)
  }
}

/**
 * @description 生成 glossary route 的降级说明。
 * @param availability 当前可用性。
 * @returns 调试与预览可复用的说明文本。
 */
export function getGlossaryCompatibilityReason(availability: IndexAvailability): string {
  if (availability === 'missing') {
    return 'Glossary vector index is missing, so the query fell back to keyword matching.'
  }

  if (availability === 'failed') {
    return 'Glossary vector index is marked as failed, so the query fell back to keyword matching.'
  }

  if (availability === 'building') {
    return 'Glossary vector index is still building, so the query fell back to keyword matching.'
  }

  return 'Glossary vector retrieval is unavailable, so the query fell back to keyword matching.'
}

/**
 * @description 生成 glossary route 在设置页中的状态文案。
 * @param enabled 当前是否启用 world 检索。
 * @param availability 当前 glossary 可用性。
 * @returns 可直接展示的中文说明。
 */
function buildGlossaryStatusMessage(enabled: boolean, availability: IndexAvailability): string {
  if (!enabled) {
    return '名词检索当前已关闭。'
  }

  switch (availability) {
    case 'ready':
      return '名词检索已就绪，可以参与当前提示词上下文构建。'
    case 'building':
      return '名词向量索引正在构建中，完成前会回退到字符串检索。'
    case 'incompatible':
      return '名词向量索引与当前 embedding 配置不一致，需要重新构建。'
    case 'failed':
      return '名词向量索引最近一次构建失败，建议检查配置后重新构建。'
    case 'missing':
    default:
      return '名词索引尚未准备完成，当前会回退到字符串检索。'
  }
}
