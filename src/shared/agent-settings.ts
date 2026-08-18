import type { AgentToolPackageId } from './agent'

const DEFAULT_ENABLED_TOOL_PACKAGE_IDS: AgentToolPackageId[] = ['resource-query', 'datetime']

export type AgentSettingsStore = {
  allowCrossResourceContext: boolean
  enabledToolPackageIds: AgentToolPackageId[]
}

/**
 * @description 创建聊天 Agent 的默认工具策略设置。
 * @returns 默认允许综合多个只读资源的策略。
 */
export function createDefaultAgentSettingsStore(): AgentSettingsStore {
  return {
    allowCrossResourceContext: true,
    enabledToolPackageIds: [...DEFAULT_ENABLED_TOOL_PACKAGE_IDS]
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
    allowCrossResourceContext:
      typeof raw.allowCrossResourceContext === 'boolean'
        ? raw.allowCrossResourceContext
        : defaults.allowCrossResourceContext,
    enabledToolPackageIds: normalizeEnabledToolPackageIds(raw.enabledToolPackageIds)
  }
}

/**
 * @description 从持久化设置中筛选当前版本支持的工具包标识。
 * @param value 未受信任的工具包标识数组。
 * @returns 去重后的可用工具包标识；无效配置回退到默认值。
 */
function normalizeEnabledToolPackageIds(value: unknown): AgentToolPackageId[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ENABLED_TOOL_PACKAGE_IDS]
  }

  const supported = new Set(DEFAULT_ENABLED_TOOL_PACKAGE_IDS)
  const ids = value.filter(
    (item): item is AgentToolPackageId =>
      typeof item === 'string' && supported.has(item as AgentToolPackageId)
  )
  return [...new Set(ids)]
}
