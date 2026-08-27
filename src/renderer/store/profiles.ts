import type { ModelProfile } from '@shared/chat'
import {
  type ProfilesStore,
  createDefaultProfile,
  createDefaultProfilesStore,
  normalizeProfilesStore,
  PROVIDER_DEFAULTS,
  PROVIDER_LABELS
} from '@shared/model-settings'
import { trackUiEvent } from '@renderer/app/telemetry'
import { saveProfiles as persistProfiles } from '@renderer/services/settings'
import { create } from 'zustand'

type SettingsStore = {
  store: ProfilesStore
  isLoaded: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  saveError: string | null
  hydrateProfiles: (store: ProfilesStore) => void
  setActiveProfileId: (profileId: string) => void
  updateProfile: (profileId: string, patch: Partial<ModelProfile>) => void
  updateProfileProvider: (profileId: string, provider: ModelProfile['provider']) => void
  addProfile: () => string
  removeProfile: (profileId: string) => void
  retrySave: () => Promise<void>
}

const defaultStore = createDefaultProfilesStore()
let saveTimer: number | null = null
let pendingProfilesStore: ProfilesStore | null = null
let saveRevision = 0

/**
 * @description 将模型配置提交给主进程统一设置服务，并记录失败状态。
 * @param store 待保存的模型配置。
 * @param set Zustand 的状态更新函数。
 * @param revision 当前保存请求的版本号。
 * @returns 模型配置保存尝试结束后的 Promise。
 * @remarks 写入失败时会记录错误并更新 Store，不会向调用方重新抛出异常。
 */
async function saveProfiles(
  store: ProfilesStore,
  set: (partial: Partial<SettingsStore>) => void,
  revision: number
): Promise<void> {
  if (pendingProfilesStore === store) {
    pendingProfilesStore = null
  }
  try {
    await persistProfiles(store)
    if (revision === saveRevision) {
      set({ saveError: null, saveStatus: 'saved' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to save model profiles', error)
    if (revision === saveRevision) {
      set({ saveError: message, saveStatus: 'error' })
    }
  }
}

/**
 * @description 对连续模型输入变更进行防抖后保存，减少文本输入时的磁盘写入次数。
 * @param store 待保存的模型配置快照。
 * @param set Zustand 的状态更新函数。
 */
function scheduleProfilesSave(
  store: ProfilesStore,
  set: (partial: Partial<SettingsStore>) => void
): void {
  pendingProfilesStore = store
  const revision = ++saveRevision
  set({ saveError: null, saveStatus: 'saving' })
  if (saveTimer != null) {
    window.clearTimeout(saveTimer)
  }

  saveTimer = window.setTimeout(() => {
    saveTimer = null
    trackUiEvent('model-settings-save', 'Saving model profile settings', {
      profileCount: store.profiles.length,
      activeProfileId: store.activeProfileId
    })
    void saveProfiles(store, set, revision)
  }, 300)
}

/**
 * @description 规范化模型配置、更新本地 Store，并安排防抖持久化。
 * @param set Zustand 的状态更新函数。
 * @param store 待提交的模型配置。
 */
function commitProfilesStore(
  set: (partial: Partial<SettingsStore>) => void,
  store: ProfilesStore
): void {
  const normalized = normalizeProfilesStore(store)
  set({ store: normalized })
  scheduleProfilesSave(normalized, set)
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  store: defaultStore,
  isLoaded: false,
  saveStatus: 'idle',
  saveError: null,
  /**
   * @description 使用主进程返回的模型配置初始化 Store。
   * @param store 主进程返回的模型配置快照。
   * @returns 无返回值。
   */
  hydrateProfiles: (store) =>
    set({
      store: normalizeProfilesStore(store),
      isLoaded: true,
      saveStatus: 'idle',
      saveError: null
    }),
  /**
   * @description 切换当前使用的模型 Profile。
   * @param profileId 要设为当前配置的 Profile 标识。
   * @returns 无返回值。
   */
  setActiveProfileId: (profileId) => {
    trackUiEvent('model-profile-selected', 'User selected an active model profile', {
      profileId
    })
    commitProfilesStore(set, {
      ...get().store,
      activeProfileId: profileId
    })
  },
  /**
   * @description 更新指定模型 Profile 的字段。
   * @param profileId 要修改的 Profile 标识。
   * @param patch 要合并的可编辑字段。
   * @returns 无返回值。
   */
  updateProfile: (profileId, patch) => {
    commitProfilesStore(set, {
      ...get().store,
      profiles: get().store.profiles.map((profile) =>
        profile.id === profileId ? { ...profile, ...patch } : profile
      )
    })
  },
  /**
   * @description 切换模型 Profile 的提供商并应用默认连接配置。
   * @param profileId 要修改的 Profile 标识。
   * @param provider 新选择的模型提供商。
   * @returns 无返回值。
   */
  updateProfileProvider: (profileId, provider) => {
    commitProfilesStore(set, {
      ...get().store,
      profiles: get().store.profiles.map((profile) => {
        if (profile.id !== profileId) {
          return profile
        }

        const defaults = PROVIDER_DEFAULTS[provider]
        const profileWithoutCatalog = { ...profile }
        delete profileWithoutCatalog.modelCatalog
        const nextName =
          profile.name === PROVIDER_LABELS[profile.provider] ||
          profile.name.startsWith('OpenAI ') ||
          profile.name.startsWith('DeepSeek ')
            ? PROVIDER_LABELS[provider]
            : profile.name

        return {
          ...profileWithoutCatalog,
          provider,
          name: nextName,
          baseUrl: defaults.baseUrl,
          model: defaults.model,
          reasoningEffort: profile.reasoningEffort
        }
      })
    })
  },
  /**
   * @description 创建并选中新模型 Profile。
   * @returns 新建 Profile 的标识。
   */
  addProfile: () => {
    const id = `profile-${Date.now()}`
    trackUiEvent('model-profile-added', 'User created a new model profile', {
      profileId: id
    })

    commitProfilesStore(set, {
      ...get().store,
      activeProfileId: id,
      profiles: [...get().store.profiles, createDefaultProfile(id, `自定义配置`, 'openai')]
    })

    return id
  },
  /**
   * @description 删除指定模型 Profile 并维护当前选中项。
   * @param profileId 要删除的 Profile 标识。
   * @returns 无返回值。
   * @remarks 删除最后一个配置时会自动创建默认 Profile，确保始终存在可用配置。
   */
  removeProfile: (profileId) => {
    trackUiEvent('model-profile-removed', 'User removed a model profile', {
      profileId
    })

    const currentStore = get().store
    const remainingProfiles = currentStore.profiles.filter((profile) => profile.id !== profileId)
    const nextProfiles = remainingProfiles.length > 0 ? remainingProfiles : [createDefaultProfile()]
    const nextActiveProfileId =
      currentStore.activeProfileId === profileId ? nextProfiles[0].id : currentStore.activeProfileId

    commitProfilesStore(set, {
      ...currentStore,
      activeProfileId: nextActiveProfileId,
      profiles: nextProfiles
    })
  },
  /**
   * @description 重试保存当前模型配置。
   * @returns 当前模型配置保存流程完成后的 Promise。
   */
  retrySave: async () => {
    if (saveTimer != null) {
      window.clearTimeout(saveTimer)
      saveTimer = null
    }
    const revision = ++saveRevision
    set({ saveError: null, saveStatus: 'saving' })
    await saveProfiles(pendingProfilesStore || get().store, set, revision)
  }
}))

/**
 * @description 从模型配置 Store 中选出当前生效的 Profile。
 * @param state 模型配置 Store 状态。
 * @returns 当前激活的模型 Profile。
 */
export function selectActiveProfile(state: SettingsStore): ModelProfile {
  return (
    state.store.profiles.find((profile) => profile.id === state.store.activeProfileId) ||
    state.store.profiles[0]
  )
}
