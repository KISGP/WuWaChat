import type { ModelProfile } from '@shared/chat'
import {
  type OpenAIProfileConnectionTestResult,
  type ProfilesStore,
  normalizeModelProfile,
  normalizeProfilesStore
} from '@shared/model-settings'
import type { AppearanceSettings, UnifiedSettings } from '@shared/settings'
import { joinUrl } from '@main/utils'
import { logger } from '@main/logging'
import { getUnifiedSettingsStore } from './store'

/**
 * @description 获取配置文件中的模型配置
 * @returns 模型配置列表
 */
export async function getProfiles(): Promise<ProfilesStore> {
  return (await getUnifiedSettingsStore().get()).profiles
}

/**
 * @description 规范化并保存模型配置到统一设置文件。
 * @param store 待持久化的模型配置。
 * @returns 保存后的模型配置。
 */
export async function saveProfiles(store: ProfilesStore): Promise<ProfilesStore> {
  const runtimeStore = normalizeProfilesStore(store)
  return getUnifiedSettingsStore().update('profiles', runtimeStore)
}

/**
 * @description 获取完整统一设置快照，供渲染进程启动时一次性恢复所有设置分区。
 * @returns 已解密并规范化的完整设置。
 */
export async function getUnifiedSettings(): Promise<UnifiedSettings> {
  return getUnifiedSettingsStore().get()
}

/**
 * @description 规范化并保存界面外观设置到统一设置文件。
 * @param appearance 待持久化的界面外观设置。
 * @returns 保存后的外观设置。
 */
export async function saveAppearanceSettings(
  appearance: AppearanceSettings
): Promise<AppearanceSettings> {
  const backgroundId = appearance.backgroundId.trim() || 'default'
  return getUnifiedSettingsStore().update('appearance', { backgroundId })
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

export async function testProfile(
  profile: ModelProfile
): Promise<OpenAIProfileConnectionTestResult> {
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

    void logger.info(
      'settings',
      'profile-test-success',
      'Model profile connection test completed',
      {
        profileId: normalized.id,
        provider: normalized.provider,
        baseUrl: normalized.baseUrl,
        model: normalized.model,
        modelCount: models.length,
        latencyMs,
        ok: result.ok
      }
    )

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
