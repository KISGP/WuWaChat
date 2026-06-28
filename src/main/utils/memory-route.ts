import type {
  CharacterMemoryIndexStatus,
  IndexAvailability,
  IndexRuntimeMode
} from '@shared/memory-settings'

/**
 * @description 根据索引可用性和当前检索模式计算实际运行模式。
 * @param retrievalMode 当前设置的检索模式。
 * @param availability 当前索引可用性。
 * @returns 本次运行将使用的检索模式。
 */
export function getIndexRuntimeMode(
  retrievalMode: 'string' | 'vector-cloud' | 'vector-local',
  availability: IndexAvailability | CharacterMemoryIndexStatus['availability']
): IndexRuntimeMode {
  if (retrievalMode === 'string') {
    return 'string'
  }

  return availability === 'ready' ? 'vector' : 'degraded'
}

/**
 * @description 将向量检索运行时错误转换为统一的降级说明。
 * @param error 捕获到的错误对象。
 * @returns 可直接展示的错误说明。
 */
export function describeVectorFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `Vector retrieval failed at runtime, so the query fell back to keyword matching. ${message}`
}
