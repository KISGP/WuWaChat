export type MemorySettingsStore = {
  crossSessionCharacterMemory: boolean
  recentMessageCount: number
  summaryTriggerTurns: number
}

/**
 * @description 创建角色长期记忆的默认读取设置。
 * @returns 不依赖本地模型或预建索引的默认设置。
 */
export function createDefaultMemorySettingsStore(): MemorySettingsStore {
  return {
    crossSessionCharacterMemory: true,
    recentMessageCount: 10,
    summaryTriggerTurns: 12
  }
}

/**
 * @description 规范化持久化的长期记忆设置，并限制数值范围。
 * @param value 未受信任的持久化设置。
 * @returns 可安全供运行时使用的记忆设置。
 */
export function normalizeMemorySettingsStore(value: unknown): MemorySettingsStore {
  const defaults = createDefaultMemorySettingsStore()
  if (!value || typeof value !== 'object') {
    return defaults
  }

  const raw = value as Partial<MemorySettingsStore>
  return {
    crossSessionCharacterMemory:
      typeof raw.crossSessionCharacterMemory === 'boolean'
        ? raw.crossSessionCharacterMemory
        : defaults.crossSessionCharacterMemory,
    recentMessageCount: normalizeInteger(
      raw.recentMessageCount,
      defaults.recentMessageCount,
      2,
      50
    ),
    summaryTriggerTurns: normalizeInteger(
      raw.summaryTriggerTurns,
      defaults.summaryTriggerTurns,
      4,
      100
    )
  }
}

/**
 * @description 将任意数值规范化为给定范围内的整数。
 * @param value 待规范化的值。
 * @param fallback 无效值的默认值。
 * @param min 允许的最小值。
 * @param max 允许的最大值。
 * @returns 范围内的整数。
 */
function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback
}
