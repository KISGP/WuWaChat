export const MIN_MESSAGE_COLLAPSE_LINE_COUNT = 1
export const MAX_MESSAGE_COLLAPSE_LINE_COUNT = 20
export const DEFAULT_MESSAGE_COLLAPSE_LINE_COUNT = 5
export const DEFAULT_TTS_MODEL_ID = 'gpt-sovits-v2proplus'
export const DEFAULT_FISH_TTS_MODEL = 's2.1-pro-free'

export type AnimationPreference = 'system' | 'enabled' | 'disabled'
export type TtsProvider = 'local' | 'fish'
export type GithubProxyOption = {
  id: string
  label: string
  baseUrl: string
}

export type GithubProxySettings = {
  enabled: boolean
  selectedOptionId: string
}

export const GITHUB_PROXY_OPTIONS: readonly GithubProxyOption[] = [
  { id: 'source-1', label: 'gh-proxy.org', baseUrl: 'https://gh-proxy.org' },
  { id: 'source-2', label: 'v4.gh-proxy.org', baseUrl: 'https://v4.gh-proxy.org' },
  { id: 'source-3', label: 'v6.gh-proxy.org', baseUrl: 'https://v6.gh-proxy.org' }
]

export const DEFAULT_GITHUB_PROXY_OPTION_ID = GITHUB_PROXY_OPTIONS[0].id

export type TtsSettings = {
  enabled: boolean
  provider: TtsProvider
  modelId: string
  fishApiKey: string
  fishReferenceId: string
  fishModel: string
}

export type AppSettings = {
  animationPreference: AnimationPreference
  messageCollapseLineCount: number
  githubProxy: GithubProxySettings
  tts: TtsSettings
}

/**
 * @description 创建应用通用设置的默认值。
 * @returns 默认的应用通用设置。
 */
export function createDefaultAppSettings(): AppSettings {
  return {
    animationPreference: 'system',
    messageCollapseLineCount: DEFAULT_MESSAGE_COLLAPSE_LINE_COUNT,
    githubProxy: {
      enabled: true,
      selectedOptionId: DEFAULT_GITHUB_PROXY_OPTION_ID
    },
    tts: {
      enabled: false,
      provider: 'local',
      modelId: DEFAULT_TTS_MODEL_ID,
      fishApiKey: '',
      fishReferenceId: '',
      fishModel: DEFAULT_FISH_TTS_MODEL,
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
  const messageCollapseLineCount =
    typeof raw.messageCollapseLineCount === 'number' &&
    Number.isInteger(raw.messageCollapseLineCount)
      ? Math.min(
          MAX_MESSAGE_COLLAPSE_LINE_COUNT,
          Math.max(MIN_MESSAGE_COLLAPSE_LINE_COUNT, raw.messageCollapseLineCount)
        )
      : DEFAULT_MESSAGE_COLLAPSE_LINE_COUNT
  const rawTts = raw.tts as Partial<TtsSettings> | undefined
  const rawGithubProxy = raw.githubProxy as Partial<GithubProxySettings> | undefined
  const selectedOptionId =
    typeof rawGithubProxy?.selectedOptionId === 'string' &&
    GITHUB_PROXY_OPTIONS.some((option) => option.id === rawGithubProxy.selectedOptionId)
      ? rawGithubProxy.selectedOptionId
      : DEFAULT_GITHUB_PROXY_OPTION_ID

  const globalTts = {
    enabled: rawTts?.enabled === true,
    provider: rawTts?.provider === 'fish' ? 'fish' : 'local' as TtsProvider,
    modelId: rawTts?.modelId?.trim() || DEFAULT_TTS_MODEL_ID,
    fishApiKey: typeof rawTts?.fishApiKey === 'string' ? rawTts.fishApiKey.trim() : '',
    fishReferenceId:
      typeof rawTts?.fishReferenceId === 'string' ? rawTts.fishReferenceId.trim() : '',
    fishModel: rawTts?.fishModel?.trim() || DEFAULT_FISH_TTS_MODEL
  }


  return {
    animationPreference,
    messageCollapseLineCount,
    githubProxy: {
      enabled: rawGithubProxy?.enabled !== false,
      selectedOptionId
    },
    tts: { ...globalTts }
  }
}
