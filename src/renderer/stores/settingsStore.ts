import type { ModelProfile } from '@shared/chat'
import {
  type ProfilesStore,
  createDefaultProfile,
  createDefaultProfilesStore,
  normalizeProfilesStore,
  PROVIDER_DEFAULTS,
  PROVIDER_LABELS
} from '@shared/model-settings'
import { trackUiEvent } from '@renderer/logging'
import { create } from 'zustand'

type SettingsStore = {
  store: ProfilesStore
  isLoaded: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  saveError: string | null
  hydrateProfiles: (store: ProfilesStore) => void
  setActiveProfileId: (profileId: string) => void
  setLoreRouterProfileId: (profileId: string | null) => void
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
 * @returns 保存完成后的 Promise。
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
    await window.settings.saveProfiles(store)
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
  hydrateProfiles: (store) =>
    set({
      store: normalizeProfilesStore(store),
      isLoaded: true,
      saveStatus: 'idle',
      saveError: null
    }),
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
   * @description 保存 Lore 路由模型的独立选择；`null` 表示动态跟随当前聊天模型。
   * @param profileId 独立路由 Profile ID；不指定时传入 `null`。
   */
  setLoreRouterProfileId: (profileId) => {
    trackUiEvent('lore-router-profile-selected', 'User selected a Lore router profile', {
      profileId: profileId || 'current-chat'
    })
    commitProfilesStore(set, {
      ...get().store,
      loreRouterProfileId: profileId
    })
  },
  updateProfile: (profileId, patch) => {
    commitProfilesStore(set, {
      ...get().store,
      profiles: get().store.profiles.map((profile) =>
        profile.id === profileId ? { ...profile, ...patch } : profile
      )
    })
  },
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
      loreRouterProfileId:
        currentStore.loreRouterProfileId === profileId ? null : currentStore.loreRouterProfileId,
      profiles: nextProfiles
    })
  },
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

export function selectActiveProfile(state: SettingsStore): ModelProfile {
  return (
    state.store.profiles.find((profile) => profile.id === state.store.activeProfileId) ||
    state.store.profiles[0]
  )
}
