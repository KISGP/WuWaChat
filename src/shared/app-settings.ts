export const APP_SETTINGS_VERSION = 1
export const MIN_MESSAGE_COLLAPSE_LINE_COUNT = 1
export const MAX_MESSAGE_COLLAPSE_LINE_COUNT = 20
export const DEFAULT_MESSAGE_COLLAPSE_LINE_COUNT = 5
export const DEFAULT_TTS_MODEL_ID = 'gpt-sovits-v2proplus'

export type AnimationPreference = 'system' | 'enabled' | 'disabled'
export type TtsSettings = { enabled: boolean; modelId: string }

export type AppSettings = {
  version: 1
  animationPreference: AnimationPreference
  messageCollapseLineCount: number
  tts: TtsSettings
}

/**
 * @description 创建应用通用设置的默认值。
 * @returns 默认的应用通用设置。
 */
export function createDefaultAppSettings(): AppSettings {
  return {
    version: APP_SETTINGS_VERSION,
    animationPreference: 'system',
    messageCollapseLineCount: DEFAULT_MESSAGE_COLLAPSE_LINE_COUNT,
    tts: { enabled: false, modelId: DEFAULT_TTS_MODEL_ID }
  }
}

/**
 * @description 规范化从持久化存储读取的应用通用设置。
 * @param value 待规范化的原始设置值。
 * @returns 可安全供应用使用的通用设置。
 */
export function normalizeAppSettings(value: unknown): AppSettings {
  const defaults = createDefaultAppSettings()

  if (!value || typeof value !== 'object') {
    return defaults
  }

  const raw = value as Partial<AppSettings>
  const animationPreference: AnimationPreference =
    raw.animationPreference === 'enabled' || raw.animationPreference === 'disabled'
      ? raw.animationPreference
      : 'system'
  const messageCollapseLineCount =
    typeof raw.messageCollapseLineCount === 'number' &&
    Number.isInteger(raw.messageCollapseLineCount)
      ? Math.min(
          MAX_MESSAGE_COLLAPSE_LINE_COUNT,
          Math.max(MIN_MESSAGE_COLLAPSE_LINE_COUNT, raw.messageCollapseLineCount)
        )
      : DEFAULT_MESSAGE_COLLAPSE_LINE_COUNT
  const rawTts = raw.tts as Partial<TtsSettings> | undefined

  return {
    version: APP_SETTINGS_VERSION,
    animationPreference,
    messageCollapseLineCount,
    tts: {
      enabled: rawTts?.enabled === true,
      modelId: rawTts?.modelId?.trim() || DEFAULT_TTS_MODEL_ID
    }
  }
}
