import { safeStorage } from 'electron'
import { readFile } from 'fs/promises'
import type { ModelProfile } from '@shared/chat'
import type { ProfilesStore } from '@shared/model-settings'
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

type StoredUnifiedSettings = Omit<UnifiedSettings, 'profiles'> & {
  profiles: Omit<ProfilesStore, 'profiles'> & { profiles: StoredProfile[] }
}

/**
 * @description 将存储格式的模型配置转换为运行时配置，并解密可用的 API Key。
 * @param settings 已从磁盘读取的统一设置。
 * @returns 含运行时 API Key 的统一设置。
 */
function toRuntimeSettings(settings: StoredUnifiedSettings): UnifiedSettings {
  const storedProfiles = settings.profiles
  if (!storedProfiles || !Array.isArray(storedProfiles.profiles)) {
    return normalizeUnifiedSettings(settings)
  }

  return normalizeUnifiedSettings({
    ...settings,
    profiles: {
      ...storedProfiles,
      profiles: storedProfiles.profiles.map((profile) => {
        if (!profile || typeof profile !== 'object') {
          return profile
        }

        return {
          ...profile,
          apiKey: decryptApiKey(profile)
        }
      })
    }
  })
}

/**
 * @description 将运行时设置转换为磁盘格式，并加密模型 API Key。
 * @param settings 待写入磁盘的统一设置。
 * @returns 可安全写入 JSON 文件的统一设置。
 */
function toStoredSettings(settings: UnifiedSettings): StoredUnifiedSettings {
  return {
    ...settings,
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
