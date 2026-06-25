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
  hydrateProfiles: () => Promise<void>
  setActiveProfileId: (profileId: string) => void
  updateProfile: (profileId: string, patch: Partial<ModelProfile>) => void
  updateProfileProvider: (profileId: string, provider: ModelProfile['provider']) => void
  addProfile: () => string
  removeProfile: (profileId: string) => void
}

const defaultStore = createDefaultProfilesStore()
let hasHydrated = false
let saveTimer: number | null = null

function scheduleProfilesSave(store: ProfilesStore): void {
  if (!hasHydrated) {
    hasHydrated = true
    return
  }

  if (saveTimer != null) {
    window.clearTimeout(saveTimer)
  }

  saveTimer = window.setTimeout(() => {
    saveTimer = null
    trackUiEvent('model-settings-save', 'Saving model profile settings', {
      profileCount: store.profiles.length,
      activeProfileId: store.activeProfileId
    })
    window.settings?.saveProfiles?.(store).catch((error) => {
      console.error('Failed to save model profiles', error)
    })
  }, 300)
}

function commitProfilesStore(
  set: (partial: Partial<SettingsStore>) => void,
  store: ProfilesStore
): void {
  const normalized = normalizeProfilesStore(store)
  set({ store: normalized })
  scheduleProfilesSave(normalized)
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  store: defaultStore,
  isLoaded: false,
  hydrateProfiles: async () => {
    try {
      const storedProfiles = await window.settings?.getProfiles?.()
      if (storedProfiles) {
        set({ store: normalizeProfilesStore(storedProfiles) })
      }
    } catch (error) {
      console.error('Failed to load model profiles', error)
    } finally {
      hasHydrated = true
      set({ isLoaded: true })
    }
  },
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
  }
}))

export function selectActiveProfile(state: SettingsStore): ModelProfile {
  return (
    state.store.profiles.find((profile) => profile.id === state.store.activeProfileId) ||
    state.store.profiles[0]
  )
}
