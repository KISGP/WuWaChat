import { safeStorage } from 'electron'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import type { ModelProfile } from '@shared/chat'
import type { AppSettings } from '@shared/app-settings'
import type { ProfilesStore } from '@shared/model-settings'
import type { AgentSettingsStore } from '@shared/agent-settings'
import {
  type UnifiedSettings,
  createDefaultUnifiedSettings,
  normalizeUnifiedSettings
} from '@shared/settings'
import { logger } from '@main/logging'
import { getSettingsPath, pathExists, writeJsonFileAtomic } from '@main/utils'

type StoredProfile = Omit<ModelProfile, 'apiKey'> & {
  apiKey?: string
  encryptedApiKey?: string
  apiKeyStorage?: 'plain' | 'safeStorage'
}

type StoredTtsSettings = Omit<AppSettings['tts'], 'fishApiKey'> & {
  fishApiKey?: string
  encryptedFishApiKey?: string
  fishApiKeyStorage?: 'plain' | 'safeStorage'
}

type StoredAppSettings = Omit<AppSettings, 'tts'> & { tts: StoredTtsSettings }

type StoredAgentSettings = Omit<AgentSettingsStore, 'moegirlpedia'> & {
  moegirlpedia: Omit<AgentSettingsStore['moegirlpedia'], 'botPassword'> & {
    botPassword?: string
    encryptedBotPassword?: string
    botPasswordStorage?: 'plain' | 'safeStorage'
  }
}

type StoredUnifiedSettings = Omit<UnifiedSettings, 'profiles' | 'app' | 'agent'> & {
  app: StoredAppSettings
  profiles: Omit<ProfilesStore, 'profiles'> & { profiles: StoredProfile[] }
  agent: StoredAgentSettings
}

/**
 * @description 将存储格式的模型配置转换为运行时配置，并解密可用的 API Key。
 * @param settings 已从磁盘读取的统一设置。
 * @returns 含运行时 API Key 的统一设置。
 */
function toRuntimeSettings(settings: StoredUnifiedSettings): UnifiedSettings {
  const storedProfiles = settings.profiles

  const runtime = normalizeUnifiedSettings({
    ...settings,
    app: {
      ...settings.app,
      tts: {
        ...settings.app?.tts,
        fishApiKey: decryptFishApiKey(settings.app?.tts)
      }
    },
    profiles: {
      ...storedProfiles,
      profiles: (Array.isArray(storedProfiles?.profiles) ? storedProfiles.profiles : []).map(
        (profile) => {
          if (!profile || typeof profile !== 'object') {
            return profile
          }

          return {
            ...profile,
            apiKey: decryptApiKey(profile)
          }
        }
      )
    },
    agent: {
      ...settings.agent,
      moegirlpedia: {
        ...settings.agent?.moegirlpedia,
        botPassword: decryptMoeGirlpediaPassword(settings.agent?.moegirlpedia)
      }
    }
  })

  return {
    ...runtime,
    profiles: {
      ...runtime.profiles,
      profiles: runtime.profiles.profiles.map((profile) => {
        const catalog = profile.modelCatalog
        const apiKeyFingerprint = createHash('sha256').update(profile.apiKey.trim()).digest('hex')
        const catalogMatchesProfile =
          catalog &&
          catalog.provider === profile.provider &&
          catalog.baseUrl === profile.baseUrl.trim() &&
          catalog.apiKeyFingerprint === apiKeyFingerprint

        return catalogMatchesProfile ? profile : { ...profile, modelCatalog: undefined }
      })
    }
  }
}

/**
 * @description 将运行时设置转换为磁盘格式，并加密模型 API Key。
 * @param settings 待写入磁盘的统一设置。
 * @returns 可安全写入 JSON 文件的统一设置。
 */
function toStoredSettings(settings: UnifiedSettings): StoredUnifiedSettings {
  const { fishApiKey, ...ttsWithoutApiKey } = settings.app.tts
  const storedTts: StoredTtsSettings = { ...ttsWithoutApiKey }
  const { botPassword, ...moegirlpediaWithoutPassword } = settings.agent.moegirlpedia
  const storedAgent: StoredAgentSettings = {
    ...settings.agent,
    moegirlpedia: moegirlpediaWithoutPassword
  }

  if (fishApiKey) {
    if (safeStorage.isEncryptionAvailable()) {
      storedTts.encryptedFishApiKey = safeStorage.encryptString(fishApiKey).toString('base64')
      storedTts.fishApiKeyStorage = 'safeStorage'
    } else {
      storedTts.fishApiKey = fishApiKey
      storedTts.fishApiKeyStorage = 'plain'
    }
  }

  if (botPassword) {
    if (safeStorage.isEncryptionAvailable()) {
      storedAgent.moegirlpedia.encryptedBotPassword = safeStorage
        .encryptString(botPassword)
        .toString('base64')
      storedAgent.moegirlpedia.botPasswordStorage = 'safeStorage'
    } else {
      storedAgent.moegirlpedia.botPassword = botPassword
      storedAgent.moegirlpedia.botPasswordStorage = 'plain'
    }
  }

  return {
    ...settings,
    app: { ...settings.app, tts: storedTts },
    agent: storedAgent,
    profiles: {
      ...settings.profiles,
      profiles: settings.profiles.profiles.map((profile) => {
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
}

/**
 * @description 解密萌娘百科 Bot Password；解密失败时返回空值以阻止无效登录。
 * @param settings 持久化格式的萌娘百科配置。
 * @returns 可供运行时使用的 Bot Password。
 */
function decryptMoeGirlpediaPassword(
  settings: StoredAgentSettings['moegirlpedia'] | undefined
): string {
  if (!settings?.encryptedBotPassword) {
    return settings?.botPassword || ''
  }

  try {
    return safeStorage.decryptString(Buffer.from(settings.encryptedBotPassword, 'base64'))
  } catch (error) {
    console.error('Failed to decrypt Moegirlpedia bot password', error)
    void logger.error(
      'settings',
      'decrypt-moegirlpedia-password-failed',
      'Failed to decrypt Moegirlpedia Bot Password',
      {
        error: error instanceof Error ? error.message : String(error)
      }
    )
    return ''
  }
}

/**
 * @description 解密 Fish Audio TTS 的 API Key；解密失败时返回空值以阻止使用无效凭据。
 * @param settings 持久化格式的 TTS 设置。
 * @returns 可供运行时使用的 Fish Audio API Key。
 */
function decryptFishApiKey(settings: StoredTtsSettings | undefined): string {
  if (!settings?.encryptedFishApiKey) {
    return settings?.fishApiKey || ''
  }

  try {
    return safeStorage.decryptString(Buffer.from(settings.encryptedFishApiKey, 'base64'))
  } catch (error) {
    console.error('Failed to decrypt Fish Audio API key', error)
    void logger.error(
      'settings',
      'decrypt-fish-api-key-failed',
      'Failed to decrypt Fish Audio API key',
      {
        error: error instanceof Error ? error.message : String(error)
      }
    )
    return ''
  }
}

/**
 * @description 解密单个模型配置中的 API Key；解密失败时返回空值以阻止使用无效凭据。
 * @param profile 存储格式的模型配置。
 * @returns 可供运行时使用的 API Key。
 */
function decryptApiKey(profile: StoredProfile): string {
  if (!profile.encryptedApiKey) {
    return profile.apiKey || ''
  }

  try {
    return safeStorage.decryptString(Buffer.from(profile.encryptedApiKey, 'base64'))
  } catch (error) {
    console.error('Failed to decrypt profile API key', error)
    void logger.error(
      'settings',
      'decrypt-api-key-failed',
      'Failed to decrypt stored profile API key',
      {
        profileId: profile.id,
        error: error instanceof Error ? error.message : String(error)
      }
    )
    return ''
  }
}

/**
 * @description 管理统一设置的加载、加密转换与串行原子写入。
 * @remarks 所有分区写入都通过同一个队列执行，避免并发请求覆盖彼此的文件内容。
 */
export class UnifiedSettingsStore {
  private settings: UnifiedSettings | null = null
  private loadingPromise: Promise<UnifiedSettings> | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  /**
   * @description 读取完整统一设置，首次调用时才加载磁盘文件。
   * @returns 当前完整的运行时设置快照。
   */
  async get(): Promise<UnifiedSettings> {
    return this.ensureLoaded()
  }

  /**
   * @description 更新一个设置分区并将新的完整快照串行写入磁盘。
   * @param section 需要替换的设置分区。
   * @param value 已由调用方归一化的分区设置。
   * @returns 写入成功后的分区快照。
   */
  async update<K extends keyof UnifiedSettings>(
    section: K,
    value: UnifiedSettings[K]
  ): Promise<UnifiedSettings[K]> {
    await this.ensureLoaded()
    const savedValue = value

    const write = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const current = await this.ensureLoaded()
        const next = { ...current, [section]: savedValue } as UnifiedSettings
        await writeJsonFileAtomic(getSettingsPath(), toStoredSettings(next))
        this.settings = next
        void logger.info('settings', 'unified-settings-saved', 'Unified settings saved', {
          filePath: getSettingsPath(),
          section
        })
      })

    this.writeQueue = write
    await write
    return savedValue
  }

  /**
   * @description 在内存中读取并规范化统一设置文件，文件缺失或无效时使用默认值。
   * @returns 已解密并规范化的完整设置快照。
   */
  private async ensureLoaded(): Promise<UnifiedSettings> {
    if (this.settings) {
      return this.settings
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.load()
    }

    this.settings = await this.loadingPromise
    return this.settings
  }

  /**
   * @description 从 settings.json 加载总配置，并在读取失败时记录错误后回退默认值。
   * @returns 已解密并规范化的设置快照。
   */
  private async load(): Promise<UnifiedSettings> {
    const filePath = getSettingsPath()
    if (!(await pathExists(filePath))) {
      void logger.info(
        'settings',
        'unified-settings-missing',
        'Settings file not found, using defaults',
        {
          filePath
        }
      )
      return createDefaultUnifiedSettings()
    }

    try {
      return toRuntimeSettings(
        JSON.parse(await readFile(filePath, 'utf-8')) as StoredUnifiedSettings
      )
    } catch (error) {
      console.error('Failed to read unified settings', error)
      void logger.error(
        'settings',
        'unified-settings-read-failed',
        'Failed to read unified settings, using defaults',
        {
          filePath,
          error: error instanceof Error ? error.message : String(error)
        }
      )
      return createDefaultUnifiedSettings()
    }
  }
}

const unifiedSettingsStore = new UnifiedSettingsStore()

/**
 * @description 获取进程内共享的统一设置存储服务。
 * @returns 管理统一设置读写的单例服务。
 */
export function getUnifiedSettingsStore(): UnifiedSettingsStore {
  return unifiedSettingsStore
}
