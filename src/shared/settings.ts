import { type AppSettings, createDefaultAppSettings, normalizeAppSettings } from './app-settings'
import {
  type MemorySettingsStore,
  createDefaultMemorySettingsStore,
  normalizeMemorySettingsStore
} from './memory-settings'
import {
  type ProfilesStore,
  createDefaultProfilesStore,
  normalizeProfilesStore
} from './model-settings'
import {
  type AgentSettingsStore,
  createDefaultAgentSettingsStore,
  normalizeAgentSettingsStore
} from './agent-settings'

export type AppearanceSettings = {
  backgroundId: string
}

export type UnifiedSettings = {
  app: AppSettings
  profiles: ProfilesStore
  memory: MemorySettingsStore
  agent: AgentSettingsStore
  appearance: AppearanceSettings
}

const DEFAULT_BACKGROUND_ID = 'default'

/**
 * @description 创建包含所有可持久化设置分区的默认配置。
 * @returns 可安全写入统一设置文件的默认配置。
 */
export function createDefaultUnifiedSettings(): UnifiedSettings {
  return {
    app: createDefaultAppSettings(),
    profiles: createDefaultProfilesStore(),
    memory: createDefaultMemorySettingsStore(),
    agent: createDefaultAgentSettingsStore(),
    appearance: { backgroundId: DEFAULT_BACKGROUND_ID }
  }
}

/**
 * @description 规范化统一设置文件的原始内容，并为无效分区提供默认值。
 * @param value 从持久化文件读取的原始设置。
 * @returns 可安全供主进程和渲染进程使用的统一设置。
 */
export function normalizeUnifiedSettings(value: unknown): UnifiedSettings {
  const defaults = createDefaultUnifiedSettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }

  const raw = value as Partial<UnifiedSettings>
  const backgroundId = raw.appearance?.backgroundId

  return {
    app: normalizeAppSettings(raw.app),
    profiles: normalizeProfilesStore(raw.profiles),
    memory: normalizeMemorySettingsStore(raw.memory),
    agent: normalizeAgentSettingsStore(raw.agent),
    appearance: {
      backgroundId:
        typeof backgroundId === 'string' && backgroundId.trim()
          ? backgroundId
          : DEFAULT_BACKGROUND_ID
    }
  }
}
