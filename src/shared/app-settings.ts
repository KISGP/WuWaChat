export const MIN_MESSAGE_COLLAPSE_LINE_COUNT = 1
export const MAX_MESSAGE_COLLAPSE_LINE_COUNT = 20
export const DEFAULT_MESSAGE_COLLAPSE_LINE_COUNT = 5
export const DEFAULT_FISH_TTS_MODEL = 's2.1-pro-free'
export const DEFAULT_INDEX_TTS_BASE_URL = 'http://127.0.0.1:7860'
export const CHAT_IMAGE_QUALITY_MIN = 60
export const CHAT_IMAGE_QUALITY_MAX = 100
export const CHAT_IMAGE_QUALITY_DEFAULT = 85
export const CHAT_IMAGE_PRESETS = ['original', 768, 1024, 1536, 2048] as const
export type ChatImagePreset = (typeof CHAT_IMAGE_PRESETS)[number]

export type AnimationPreference = 'system' | 'enabled' | 'disabled'
export type TtsProvider = 'local' | 'fish'
export type LocalTtsEngine = 'index-tts'
export type GithubProxyOption = {
  id: string
  label: string
  baseUrl: string
}

export type GithubProxySettings = {
  enabled: boolean
  selectedOptionId: string
}

export type ChatImageProcessingSettings = {
  enabled: boolean
  compression: { quality: number }
  resize: { preset: ChatImagePreset }
}

export type ChatSendMergeSettings = {
  enabled: boolean
  delaySeconds: number
}

export const CHAT_SEND_MERGE_DELAY_SECONDS_DEFAULT = 5

export type LocalTtsProviderSettings = {
  engine: LocalTtsEngine
  engineConfigs: {
    indexTts: {
      baseUrl: string
    }
  }
}

export type FishTtsProviderSettings = {
  apiKey: string
  model: string
}

export type TtsProviderSettings = {
  local: LocalTtsProviderSettings
  fish: FishTtsProviderSettings
}

export type FishTtsCharacterVoiceSettings = {
  referenceId: string
}

export type TtsCharacterVoiceSettings = {
  fish?: FishTtsCharacterVoiceSettings
}

export type TtsCharacterVoiceOverrides = Record<string, TtsCharacterVoiceSettings>

export type TtsSettings = {
  enabled: boolean
  provider: TtsProvider
  providers: TtsProviderSettings
  characterVoices: TtsCharacterVoiceOverrides
}

export type AppSettings = {
  animationPreference: AnimationPreference
  developerToolsEnabled: boolean
  agentRunRecordingEnabled: boolean
  messageCollapseLineCount: number
  settingsSidebarExpanded: boolean
  githubProxy: GithubProxySettings
  chatImageProcessing: ChatImageProcessingSettings
  chatSendMerge: ChatSendMergeSettings
  tts: TtsSettings
}

export const GITHUB_PROXY_OPTIONS: readonly GithubProxyOption[] = [
  { id: 'source-1', label: 'gh-proxy.org', baseUrl: 'https://gh-proxy.org' },
  { id: 'source-2', label: 'v4.gh-proxy.org', baseUrl: 'https://v4.gh-proxy.org' },
  { id: 'source-3', label: 'v6.gh-proxy.org', baseUrl: 'https://v6.gh-proxy.org' }
]

export const DEFAULT_GITHUB_PROXY_OPTION_ID = GITHUB_PROXY_OPTIONS[0].id

type LegacyFishTtsSettings = {
  fishApiKey?: unknown
  fishModel?: unknown
}

/**
 * @description 将未知值规范化为去除首尾空白的字符串，并在无效时使用默认值。
 * @param value 待规范化的值。
 * @param fallback 值无效时使用的默认字符串。
 * @returns 可安全写入设置的字符串。
 */
function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/**
 * @description 规范化 index-tts 服务地址，只接受 HTTP(S) 绝对地址。
 * @param value 待规范化的服务地址。
 * @returns 可供本地引擎使用的服务地址。
 */
function normalizeIndexTtsBaseUrl(value: unknown): string {
  const candidate = normalizeString(value, DEFAULT_INDEX_TTS_BASE_URL)
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return DEFAULT_INDEX_TTS_BASE_URL
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_INDEX_TTS_BASE_URL
  }
}

/**
 * @description 规范化每个角色在各 provider 下保存的声音覆盖。
 * @param value 从持久化设置读取的未知声音覆盖。
 * @returns 仅包含有效 Fish Audio 音色 ID 的角色声音覆盖。
 */
function normalizeCharacterVoiceOverrides(value: unknown): TtsCharacterVoiceOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const overrides: TtsCharacterVoiceOverrides = {}
  for (const [characterId, rawVoiceSettings] of Object.entries(value)) {
    if (!characterId.trim() || !rawVoiceSettings || typeof rawVoiceSettings !== 'object') {
      continue
    }

    const rawFish = (rawVoiceSettings as Partial<TtsCharacterVoiceSettings>).fish
    const referenceId = normalizeString(rawFish?.referenceId, '')
    if (referenceId) {
      overrides[characterId] = { fish: { referenceId } }
    }
  }

  return overrides
}

/**
 * @description 创建应用通用设置的默认值。
 * @returns 默认的应用通用设置。
 */
export function createDefaultAppSettings(): AppSettings {
  return {
    animationPreference: 'system',
    developerToolsEnabled: false,
    agentRunRecordingEnabled: false,
    messageCollapseLineCount: DEFAULT_MESSAGE_COLLAPSE_LINE_COUNT,
    settingsSidebarExpanded: true,
    githubProxy: {
      enabled: true,
      selectedOptionId: DEFAULT_GITHUB_PROXY_OPTION_ID
    },
    chatImageProcessing: {
      enabled: true,
      compression: { quality: CHAT_IMAGE_QUALITY_DEFAULT },
      resize: { preset: 'original' }
    },
    chatSendMerge: { enabled: false, delaySeconds: CHAT_SEND_MERGE_DELAY_SECONDS_DEFAULT },
    tts: {
      enabled: false,
      provider: 'local',
      providers: {
        local: {
          engine: 'index-tts',
          engineConfigs: {
            indexTts: { baseUrl: DEFAULT_INDEX_TTS_BASE_URL }
          }
        },
        fish: { apiKey: '', model: DEFAULT_FISH_TTS_MODEL }
      },
      characterVoices: {}
    }
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
  const developerToolsEnabled = raw.developerToolsEnabled === true
  const agentRunRecordingEnabled = raw.agentRunRecordingEnabled === true
  const messageCollapseLineCount =
    typeof raw.messageCollapseLineCount === 'number' &&
    Number.isInteger(raw.messageCollapseLineCount)
      ? Math.min(
          MAX_MESSAGE_COLLAPSE_LINE_COUNT,
          Math.max(MIN_MESSAGE_COLLAPSE_LINE_COUNT, raw.messageCollapseLineCount)
        )
      : DEFAULT_MESSAGE_COLLAPSE_LINE_COUNT
  const settingsSidebarExpanded = raw.settingsSidebarExpanded !== false
  const rawTts = raw.tts as (Partial<TtsSettings> & LegacyFishTtsSettings) | undefined
  const rawGithubProxy = raw.githubProxy as Partial<GithubProxySettings> | undefined
  const rawImageProcessing = raw.chatImageProcessing as Partial<ChatImageProcessingSettings> | undefined
  const rawSendMerge = raw.chatSendMerge as Partial<ChatSendMergeSettings> | undefined
  const rawCompression = rawImageProcessing?.compression
  const rawResize = rawImageProcessing?.resize
  const quality =
    typeof rawCompression?.quality === 'number' && Number.isFinite(rawCompression.quality)
      ? Math.round(Math.min(CHAT_IMAGE_QUALITY_MAX, Math.max(CHAT_IMAGE_QUALITY_MIN, rawCompression.quality)))
      : CHAT_IMAGE_QUALITY_DEFAULT
  const preset = CHAT_IMAGE_PRESETS.includes(rawResize?.preset as ChatImagePreset)
    ? (rawResize?.preset as ChatImagePreset)
    : 'original'
  const selectedOptionId =
    typeof rawGithubProxy?.selectedOptionId === 'string' &&
    GITHUB_PROXY_OPTIONS.some((option) => option.id === rawGithubProxy.selectedOptionId)
      ? rawGithubProxy.selectedOptionId
      : DEFAULT_GITHUB_PROXY_OPTION_ID
  const rawProviders = rawTts?.providers
  const rawLocal = rawProviders?.local
  const rawFish = rawProviders?.fish

  return {
    animationPreference,
    developerToolsEnabled,
    agentRunRecordingEnabled,
    messageCollapseLineCount,
    settingsSidebarExpanded,
    githubProxy: {
      enabled: rawGithubProxy?.enabled !== false,
      selectedOptionId
    },
    chatImageProcessing: {
      enabled: rawImageProcessing?.enabled !== false,
      compression: { quality },
      resize: { preset }
    },
    chatSendMerge: {
      enabled: rawSendMerge?.enabled === true,
      delaySeconds:
        typeof rawSendMerge?.delaySeconds === 'number' && Number.isFinite(rawSendMerge.delaySeconds)
          ? rawSendMerge.delaySeconds
          : CHAT_SEND_MERGE_DELAY_SECONDS_DEFAULT
    },
    tts: {
      enabled: rawTts?.enabled === true,
      provider: rawTts?.provider === 'fish' ? 'fish' : 'local',
      providers: {
        local: {
          engine: 'index-tts',
          engineConfigs: {
            indexTts: {
              baseUrl: normalizeIndexTtsBaseUrl(rawLocal?.engineConfigs?.indexTts?.baseUrl)
            }
          }
        },
        fish: {
          apiKey:
            typeof rawFish?.apiKey === 'string'
              ? rawFish.apiKey.trim()
              : typeof rawTts?.fishApiKey === 'string'
                ? rawTts.fishApiKey.trim()
                : '',
          model: normalizeString(rawFish?.model ?? rawTts?.fishModel, DEFAULT_FISH_TTS_MODEL)
        }
      },
      characterVoices: normalizeCharacterVoiceOverrides(rawTts?.characterVoices)
    }
  }
}
