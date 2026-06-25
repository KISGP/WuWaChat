import type { ModelProfile, ProviderKind } from './chat'

export type ProfilesStore = {
  version: 1
  activeProfileId: string
  profiles: ModelProfile[]
}

export type OpenAIProfileConnectionTestResult = {
  ok: boolean
  message: string
  models?: string[]
  latencyMs?: number
}

export const MODEL_SETTINGS_VERSION = 1
export const DEFAULT_PROFILE_ID = 'openai-default'

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek'
}

export const PROVIDER_DEFAULTS: Record<
  ProviderKind,
  Pick<ModelProfile, 'provider' | 'baseUrl' | 'model' | 'temperature' | 'maxTokens'>
> = {
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048
  },
  deepseek: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048
  }
}

export function createDefaultProfile(
  id = DEFAULT_PROFILE_ID,
  name = 'OpenAI',
  provider: ProviderKind = 'openai'
): ModelProfile {
  const defaults = PROVIDER_DEFAULTS[provider]

  return {
    id,
    name,
    provider,
    baseUrl: defaults.baseUrl,
    apiKey: '',
    model: defaults.model,
    temperature: defaults.temperature,
    maxTokens: defaults.maxTokens
  }
}

export function createDefaultProfilesStore(): ProfilesStore {
  const profile = createDefaultProfile()

  return {
    version: MODEL_SETTINGS_VERSION,
    activeProfileId: profile.id,
    profiles: [profile]
  }
}

export function normalizeModelProfile(
  value: Partial<ModelProfile> | null | undefined,
  fallbackId = DEFAULT_PROFILE_ID
): ModelProfile {
  const raw = value || {}
  const provider =
    raw.provider === 'deepseek' || raw.provider === 'openai' ? raw.provider : 'openai'
  const fallback = createDefaultProfile(fallbackId, PROVIDER_LABELS[provider], provider)

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : fallback.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallback.name,
    provider,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : fallback.baseUrl,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : fallback.apiKey,
    model: typeof raw.model === 'string' ? raw.model : fallback.model,
    temperature: Number.isFinite(raw.temperature) ? Number(raw.temperature) : fallback.temperature,
    maxTokens: Number.isFinite(raw.maxTokens) ? Number(raw.maxTokens) : fallback.maxTokens
  }
}

export function normalizeProfilesStore(value: unknown): ProfilesStore {
  const defaults = createDefaultProfilesStore()

  if (!value || typeof value !== 'object') {
    return defaults
  }

  const raw = value as Partial<ProfilesStore>
  const profiles = Array.isArray(raw.profiles)
    ? raw.profiles.map((profile, index) =>
        normalizeModelProfile(profile, index === 0 ? DEFAULT_PROFILE_ID : `profile-${index + 1}`)
      )
    : defaults.profiles

  const uniqueProfiles = profiles.filter(
    (profile, index, all) => all.findIndex((item) => item.id === profile.id) === index
  )
  const nextProfiles = uniqueProfiles.length > 0 ? uniqueProfiles : defaults.profiles
  const activeProfileId =
    typeof raw.activeProfileId === 'string' &&
    nextProfiles.some((profile) => profile.id === raw.activeProfileId)
      ? raw.activeProfileId
      : nextProfiles[0].id

  return {
    version: MODEL_SETTINGS_VERSION,
    activeProfileId,
    profiles: nextProfiles
  }
}
