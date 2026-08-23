import type { ModelProfile } from '@shared/chat'
import { net } from 'electron'
import {
  type OpenAIProfileConnectionTestRequest,
  type OpenAIProfileConnectionTestResult,
  type ProfilesStore,
  normalizeModelProfile,
  normalizeProfilesStore
} from '@shared/model-settings'
import { createHash } from 'crypto'
import type { AppearanceSettings, UnifiedSettings } from '@shared/settings'
import {
  type AgentSettingsStore,
  type MoeGirlpediaConnectionTestRequest,
  type MoeGirlpediaConnectionTestResult,
  normalizeAgentSettingsStore
} from '@shared/agent-settings'
import { MoeGirlpediaApiClient } from '@main/agent/tools/moegirlpedia/api'
import { joinUrl } from '@main/utils'
import { logger } from '@main/logging'
import { getUnifiedSettingsStore } from './store'

const PROFILE_TEST_TIMEOUT_MS = 10_000
const MOEGIRLPEDIA_TEST_TIMEOUT_MS = 10_000
const activeProfileTests = new Map<string, AbortController>()
const activeMoeGirlpediaTests = new Map<string, AbortController>()

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

/**
 * @description 规范化并保存聊天 Agent 的只读工具策略。
 * @param settings 待保存的 Agent 策略设置。
 * @returns 已保存的规范化策略设置。
 */
export async function saveAgentSettings(settings: AgentSettingsStore): Promise<AgentSettingsStore> {
  return getUnifiedSettingsStore().update('agent', normalizeAgentSettingsStore(settings))
}

/**
 * @description 测试萌娘百科 Bot Password 登录和 API 会话是否可用。
 * @param request 包含测试请求标识和未持久化的萌娘百科配置。
 * @returns 登录测试结果，不返回密码或 Cookie。
 */
export async function testMoeGirlpedia(
  request: MoeGirlpediaConnectionTestRequest
): Promise<MoeGirlpediaConnectionTestResult> {
  const startedAt = Date.now()
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, MOEGIRLPEDIA_TEST_TIMEOUT_MS)
  activeMoeGirlpediaTests.set(request.requestId, controller)

  try {
    const settings = normalizeAgentSettingsStore({
      enabledToolPackageIds: [],
      moegirlpedia: request.settings
    }).moegirlpedia
    const username = await new MoeGirlpediaApiClient(settings).testConnection(controller.signal)
    return {
      ok: true,
      message: '萌娘百科登录和搜索测试成功。',
      latencyMs: Date.now() - startedAt,
      username
    }
  } catch (error) {
    return {
      ok: false,
      message: controller.signal.aborted
        ? timedOut
          ? `萌娘百科连接测试超时（${MOEGIRLPEDIA_TEST_TIMEOUT_MS / 1000} 秒）。`
          : '萌娘百科连接测试已取消。'
        : error instanceof Error
          ? error.message
          : String(error),
      latencyMs: Date.now() - startedAt
    }
  } finally {
    clearTimeout(timeout)
    activeMoeGirlpediaTests.delete(request.requestId)
  }
}

/**
 * @description 取消正在进行的萌娘百科连接测试。
 * @param requestId 连接测试请求标识。
 * @returns 是否找到并取消了活动测试。
 */
export function cancelMoeGirlpediaTest(requestId: string): boolean {
  const controller = activeMoeGirlpediaTests.get(requestId)
  if (!controller) return false
  activeMoeGirlpediaTests.delete(requestId)
  controller.abort()
  return true
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

/**
 * @description Retrieves the models exposed by an OpenAI-compatible provider.
 * @param profile The model profile defining endpoint and credentials.
 * @param signal Cancels the underlying HTTP request when testing is stopped or times out.
 * @returns The normalized list of remote model identifiers.
 */
async function fetchModelList(profile: ModelProfile, signal: AbortSignal): Promise<string[]> {
  const body = await readJson(
    await net.fetch(joinUrl(requireBaseUrl(profile), '/models'), {
      headers: profile.apiKey.trim()
        ? {
            Authorization: `Bearer ${profile.apiKey.trim()}`
          }
        : undefined,
      signal
    })
  )

  return modelNamesFromData(body)
}

/**
 * @description Produces a non-reversible credential identifier for validating cached model catalogs.
 * @param apiKey The API key associated with a model profile.
 * @returns A SHA-256 fingerprint that never exposes the API key itself.
 */
function createApiKeyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey.trim()).digest('hex')
}

/**
 * @description Tests a profile's model endpoint and returns a credential-bound model catalog.
 * @param request The renderer-generated test identifier and profile to test.
 * @returns The connection result, including the refreshed catalog after success.
 */
export async function testProfile(
  request: OpenAIProfileConnectionTestRequest
): Promise<OpenAIProfileConnectionTestResult> {
  const { profile, requestId } = request
  const startedAt = Date.now()
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, PROFILE_TEST_TIMEOUT_MS)
  activeProfileTests.set(requestId, controller)

  try {
    const normalized = normalizeModelProfile(profile, profile.id || 'profile-test')
    const models = await fetchModelList(normalized, controller.signal)
    const latencyMs = Date.now() - startedAt
    const hasSelectedModel = normalized.model
      ? models.some((model) => model === normalized.model || model.endsWith(`/${normalized.model}`))
      : true

    const result: OpenAIProfileConnectionTestResult = {
      ok: hasSelectedModel,
      models,
      latencyMs,
      message: hasSelectedModel
        ? `连接成功，发现 ${models.length} 个模型。`
        : `连接成功，但未找到当前模型：${normalized.model}`,
      modelCatalog: {
        models,
        fetchedAt: new Date().toISOString(),
        provider: normalized.provider,
        baseUrl: normalized.baseUrl.trim(),
        apiKeyFingerprint: createApiKeyFingerprint(normalized.apiKey)
      }
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
      message: controller.signal.aborted
        ? timedOut
          ? `连接测试超时（${PROFILE_TEST_TIMEOUT_MS / 1000} 秒）。`
          : '连接测试已取消。'
        : error instanceof Error
          ? error.message
          : String(error)
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
  } finally {
    clearTimeout(timeout)
    activeProfileTests.delete(requestId)
  }
}

/**
 * @description Cancels a pending model profile connection test.
 * @param requestId The renderer-generated test identifier.
 * @returns Whether an active test was found and aborted.
 */
export function cancelProfileTest(requestId: string): boolean {
  const controller = activeProfileTests.get(requestId)
  if (!controller) {
    return false
  }

  activeProfileTests.delete(requestId)
  controller.abort()
  return true
}
