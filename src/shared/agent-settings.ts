import type { AgentToolPackageId } from './agent'

export const DEFAULT_MAX_TOOL_ROUNDS = 10

const SUPPORTED_TOOL_PACKAGE_IDS: AgentToolPackageId[] = [
  'story',
  'glossary',
  'memory',
  'datetime',
  'moegirlpedia'
]

const DEFAULT_ENABLED_TOOL_PACKAGE_IDS: AgentToolPackageId[] = [
  'story',
  'glossary',
  'memory',
  'datetime'
]

export type AgentSettingsStore = {
  maxToolRounds: number
  enabledToolPackageIds: AgentToolPackageId[]
  moegirlpedia: MoeGirlpediaSettings
}

export type MoeGirlpediaSettings = {
  username: string
  botPassword: string
}

export type MoeGirlpediaConnectionTestRequest = {
  requestId: string
  settings: MoeGirlpediaSettings
}

export type MoeGirlpediaConnectionTestResult = {
  ok: boolean
  message: string
  latencyMs: number
  username?: string
}

/**
 * @description 创建聊天 Agent 的默认工具策略设置。
 * @returns 默认启用 Story、词典、记忆和时间工具的设置。
 */
export function createDefaultAgentSettingsStore(): AgentSettingsStore {
  return {
    maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
    enabledToolPackageIds: [...DEFAULT_ENABLED_TOOL_PACKAGE_IDS],
    moegirlpedia: { username: '', botPassword: '' }
  }
}

/**
 * @description 规范化持久化的聊天 Agent 策略设置。
 * @param value 未受信任的持久化设置。
 * @returns 可安全使用的策略设置。
 */
export function normalizeAgentSettingsStore(value: unknown): AgentSettingsStore {
  const defaults = createDefaultAgentSettingsStore()
  if (!value || typeof value !== 'object') {
    return defaults
  }
  const raw = value as Partial<AgentSettingsStore>
  return {
    maxToolRounds: normalizeMaxToolRounds(raw.maxToolRounds),
    enabledToolPackageIds: normalizeEnabledToolPackageIds(raw.enabledToolPackageIds),
    moegirlpedia: normalizeMoeGirlpediaSettings(raw.moegirlpedia)
  }
}

/**
 * @description 将 Agent 工具循环上限规范化为整数。
 * @param value 未受信任的循环轮次数值。
 * @returns 有限整数形式的工具循环轮次；无效值回退默认值。
 */
function normalizeMaxToolRounds(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_MAX_TOOL_ROUNDS
}

/**
 * @description 规范化萌娘百科 Bot Password 配置。
 * @param value 未受信任的萌娘百科配置。
 * @returns 可安全供主进程使用的萌娘百科配置。
 */
function normalizeMoeGirlpediaSettings(value: unknown): MoeGirlpediaSettings {
  if (!value || typeof value !== 'object') {
    return { username: '', botPassword: '' }
  }
  const raw = value as Partial<MoeGirlpediaSettings>
  return {
    username: typeof raw.username === 'string' ? raw.username.trim() : '',
    botPassword: typeof raw.botPassword === 'string' ? raw.botPassword : ''
  }
}

/**
 * @description 从持久化设置中筛选当前版本支持的工具包标识。
 * @param value 未受信任的工具包标识数组。
 * @returns 去重后的可用工具包标识；空数组表示禁用全部工具，非数组配置回退到默认值。
 */
function normalizeEnabledToolPackageIds(value: unknown): AgentToolPackageId[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ENABLED_TOOL_PACKAGE_IDS]
  }

  const supported = new Set(SUPPORTED_TOOL_PACKAGE_IDS)
  const ids = value.filter(
    (item): item is AgentToolPackageId =>
      typeof item === 'string' && supported.has(item as AgentToolPackageId)
  )
  return [...new Set(ids)]
}
