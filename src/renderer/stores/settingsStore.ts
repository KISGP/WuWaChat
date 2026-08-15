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

/**
 * @description 将模型配置提交给主进程统一设置服务，并记录失败状态。
 * @param store 待保存的模型配置。
 * @param set Zustand 的状态更新函数。
 * @returns 保存完成后的 Promise。
 */
async function saveProfiles(
  store: ProfilesStore,
  set: (partial: Partial<SettingsStore>) => void
): Promise<void> {
  pendingProfilesStore = null
  try {
    await window.settings.saveProfiles(store)
    set({ saveError: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to save model profiles', error)
    set({ saveError: message })
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
  if (saveTimer != null) {
    window.clearTimeout(saveTimer)
  }

  saveTimer = window.setTimeout(() => {
    saveTimer = null
    trackUiEvent('model-settings-save', 'Saving model profile settings', {
      profileCount: store.profiles.length,
      activeProfileId: store.activeProfileId
    })
    void saveProfiles(store, set)
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
  saveError: null,
  hydrateProfiles: (store) => set({ store: normalizeProfilesStore(store), isLoaded: true }),
  setActiveProfileId: (profileId) => {
    trackUiEvent('model-profile-selected', 'User selected an active model profile', {
      profileId
    })
    commitProfilesStore(set, {
      ...get().store,
      activeProfileId: profileId
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
        const nextName =
          profile.name === PROVIDER_LABELS[profile.provider] ||
          profile.name.startsWith('OpenAI ') ||
          profile.name.startsWith('DeepSeek ')
            ? PROVIDER_LABELS[provider]
            : profile.name

        return {
          ...profile,
          provider,
          name: nextName,
          baseUrl: defaults.baseUrl,
          model: defaults.model,
          temperature: defaults.temperature,
          maxTokens: defaults.maxTokens
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
      profiles: nextProfiles
    })
  },
  retrySave: async () => {
    if (saveTimer != null) {
      window.clearTimeout(saveTimer)
      saveTimer = null
    }
    await saveProfiles(pendingProfilesStore || get().store, set)
  }
}))

export function selectActiveProfile(state: SettingsStore): ModelProfile {
  return (
    state.store.profiles.find((profile) => profile.id === state.store.activeProfileId) ||
    state.store.profiles[0]
  )
}
