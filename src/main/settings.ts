import { safeStorage } from 'electron'
import { copyFile, readFile } from 'fs/promises'
import { join } from 'path'
import type { ModelProfile } from '../shared/ai'
import {
  type OpenAIProfileConnectionTestResult,
  type ProfilesStore,
  createDefaultProfilesStore,
  normalizeModelProfile,
  normalizeProfilesStore
} from '../shared/model-settings'
import { joinUrl, pathExists, writeJsonFileAtomic, getResourcesRoot } from './utils'
import { logger } from './logger'

type StoredProfile = Omit<ModelProfile, 'apiKey'> & {
  apiKey?: string
  encryptedApiKey?: string
  apiKeyStorage?: 'plain' | 'safeStorage'
}

type StoredProfilesStore = Omit<ProfilesStore, 'profiles'> & {
  profiles: StoredProfile[]
}

function getSettingsPath(): string {
  return join(getResourcesRoot(), 'settings.json')
}

function decryptApiKey(profile: StoredProfile): string {
  if (!profile.encryptedApiKey) {
    return profile.apiKey || ''
  }

  try {
    return safeStorage.decryptString(Buffer.from(profile.encryptedApiKey, 'base64'))
  } catch (error) {
    console.error('Failed to decrypt profile API key', error)
    void logger.error('settings', 'decrypt-api-key-failed', 'Failed to decrypt stored profile API key', {
      profileId: profile.id,
      error: error instanceof Error ? error.message : String(error)
    })
    return ''
  }
}

function toRuntimeProfilesStore(store: StoredProfilesStore): ProfilesStore {
  return normalizeProfilesStore({
    ...store,
    profiles: Array.isArray(store.profiles)
      ? store.profiles.map((profile) => ({
        ...profile,
        apiKey: decryptApiKey(profile)
      }))
      : []
  })
}

function toStoredProfilesStore(store: ProfilesStore): StoredProfilesStore {
  const normalized = normalizeProfilesStore(store)

  return {
    ...normalized,
    profiles: normalized.profiles.map((profile) => {
      const { apiKey, ...rest } = profile
      const stored: StoredProfile = { ...rest }

      if (apiKey) {
        if (safeStorage.isEncryptionAvailable()) {
          stored.encryptedApiKey = safeStorage.encryptString(apiKey).toString('base64')
          stored.apiKeyStorage = 'safeStorage'
        } else {
          stored.apiKey = apiKey
          stored.apiKeyStorage = 'plain'
        }
      }

      return stored
    })
  }
}

/**
 * @description 获取配置文件中的模型配置
 * @returns 模型配置列表
 */
export async function getProfiles(): Promise<ProfilesStore> {
  const filePath = getSettingsPath()

  if (!(await pathExists(filePath))) {
    void logger.info('settings', 'profiles-missing', 'Settings store not found, using defaults', {
      filePath
    })
    return createDefaultProfilesStore()
  }

  try {
    return toRuntimeProfilesStore(JSON.parse(await readFile(filePath, 'utf-8')))
  } catch (error) {
    const corruptPath = `${filePath}.${Date.now()}.corrupt`

    try {
      await copyFile(filePath, corruptPath)
    } catch {
      // Preserve startup even if the corrupt backup cannot be written.
    }

    console.error('Failed to read settings store', error)
    void logger.error('settings', 'profiles-read-failed', 'Failed to read settings store, using defaults', {
      filePath,
      corruptPath,
      error: error instanceof Error ? error.message : String(error)
    })
    return createDefaultProfilesStore()
  }
}

export async function saveProfiles(store: ProfilesStore): Promise<ProfilesStore> {
  const filePath = getSettingsPath()
  const runtimeStore = normalizeProfilesStore(store)

  await writeJsonFileAtomic(filePath, toStoredProfilesStore(runtimeStore))
  void logger.info('settings', 'profiles-saved', 'Model profiles saved', {
    filePath,
    profileCount: runtimeStore.profiles.length,
    activeProfileId: runtimeStore.activeProfileId
  })

  return runtimeStore
}

function requireBaseUrl(profile: ModelProfile): string {
  if (!profile.baseUrl.trim()) {
    throw new Error('Base URL is required')
  }

  return profile.baseUrl.trim()
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`)
  }

  return text ? JSON.parse(text) : null
}

function modelNamesFromData(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return []
  }

  const raw = value as {
    data?: { id?: string }[]
    models?: { id?: string; name?: string; model?: string }[]
  }

  if (Array.isArray(raw.data)) {
    return raw.data.map((item) => item.id).filter((id): id is string => Boolean(id))
  }

  if (Array.isArray(raw.models)) {
    return raw.models
      .map((item) => item.id || item.name || item.model)
      .filter((id): id is string => Boolean(id))
  }

  return []
}

async function fetchModelList(profile: ModelProfile): Promise<string[]> {
  const body = await readJson(
    await fetch(joinUrl(requireBaseUrl(profile), '/models'), {
      headers: profile.apiKey.trim()
        ? {
          Authorization: `Bearer ${profile.apiKey.trim()}`
        }
        : undefined
    })
  )

  return modelNamesFromData(body)
}

export async function testProfile(profile: ModelProfile): Promise<OpenAIProfileConnectionTestResult> {
  const startedAt = Date.now()

  try {
    const normalized = normalizeModelProfile(profile, profile.id || 'profile-test')
    const models = await fetchModelList(normalized)
    const latencyMs = Date.now() - startedAt
    const hasSelectedModel = normalized.model
      ? models.some((model) => model === normalized.model || model.endsWith(`/${normalized.model}`))
      : true

    const result = {
      ok: hasSelectedModel,
      models,
      latencyMs,
      message: hasSelectedModel
        ? `Connected successfully. Found ${models.length} models.`
        : `Connected successfully, but the selected model was not found: ${normalized.model}`
    }

    void logger.info('settings', 'profile-test-success', 'Model profile connection test completed', {
      profileId: normalized.id,
      provider: normalized.provider,
      baseUrl: normalized.baseUrl,
      model: normalized.model,
      modelCount: models.length,
      latencyMs,
      ok: result.ok
    })

    return result
  } catch (error) {
    const result = {
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error)
    }

    void logger.error('settings', 'profile-test-failed', 'Model profile connection test failed', {
      profileId: profile.id,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      model: profile.model,
      latencyMs: result.latencyMs,
      error: result.message
    })

    return result
  }
}
