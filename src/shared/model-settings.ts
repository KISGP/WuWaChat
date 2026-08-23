import type { ModelCatalog, ModelProfile, ProviderKind, ReasoningEffort } from './chat'

export type ProfilesStore = {
  activeProfileId: string
  profiles: ModelProfile[]
}

export type OpenAIProfileConnectionTestResult = {
  ok: boolean
  message: string
  models?: string[]
  latencyMs?: number
  modelCatalog?: ModelCatalog
}

export type OpenAIProfileConnectionTestRequest = {
  requestId: string
  profile: ModelProfile
}

export const DEFAULT_PROFILE_ID = 'openai-default'

export const REASONING_EFFORTS: ReasoningEffort[] = ['auto', 'low', 'medium', 'high']

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
    model: '',
    temperature: 0.7,
    maxTokens: 2048
  },
  deepseek: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: '',
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
    maxTokens: defaults.maxTokens,
    reasoningEffort: 'auto'
  }
}

export function createDefaultProfilesStore(): ProfilesStore {
  const profile = createDefaultProfile()

  return {
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
  const reasoningEffort = REASONING_EFFORTS.includes(raw.reasoningEffort as ReasoningEffort)
    ? (raw.reasoningEffort as ReasoningEffort)
    : fallback.reasoningEffort
  const modelCatalog = normalizeModelCatalog(raw.modelCatalog, provider)

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : fallback.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallback.name,
    provider,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : fallback.baseUrl,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : fallback.apiKey,
    model: typeof raw.model === 'string' ? raw.model : fallback.model,
    temperature: Number.isFinite(raw.temperature) ? Number(raw.temperature) : fallback.temperature,
    maxTokens: Number.isFinite(raw.maxTokens) ? Number(raw.maxTokens) : fallback.maxTokens,
    reasoningEffort,
    ...(modelCatalog ? { modelCatalog } : {})
  }
}

/**
 * @description Validates a persisted model catalog without accepting credential material.
 * @param value The untrusted catalog value from settings storage.
 * @param provider The profile provider the catalog must match.
 * @returns A normalized catalog or undefined when the value is incomplete.
 */
function normalizeModelCatalog(value: unknown, provider: ProviderKind): ModelCatalog | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const raw = value as Partial<ModelCatalog>
  if (
    raw.provider !== provider ||
    typeof raw.baseUrl !== 'string' ||
    typeof raw.fetchedAt !== 'string' ||
    typeof raw.apiKeyFingerprint !== 'string' ||
    !Array.isArray(raw.models)
  ) {
    return undefined
  }

  return {
    provider,
    baseUrl: raw.baseUrl,
    fetchedAt: raw.fetchedAt,
    apiKeyFingerprint: raw.apiKeyFingerprint,
    models: [...new Set(raw.models.filter((model): model is string => typeof model === 'string'))]
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
    activeProfileId,
    profiles: nextProfiles
  }
}
