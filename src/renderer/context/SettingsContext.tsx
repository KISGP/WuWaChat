/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import type { ModelProfile } from '../../shared/ai'
import {
  type ProfilesStore,
  createDefaultProfile,
  createDefaultProfilesStore,
  normalizeProfilesStore,
  PROVIDER_DEFAULTS,
  PROVIDER_LABELS
} from '../../shared/model-settings'
import { trackUiEvent } from '../logging'

export interface SettingsContextType {
  store: ProfilesStore
  isLoaded: boolean
  activeProfile: ModelProfile
  setActiveProfileId: (profileId: string) => void
  updateProfile: (profileId: string, patch: Partial<ModelProfile>) => void
  updateProfileProvider: (profileId: string, provider: ModelProfile['provider']) => void
  addProfile: () => string
  removeProfile: (profileId: string) => void
}

const defaultStore = createDefaultProfilesStore()

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }): ReactElement {
  const [store, setStore] = useState<ProfilesStore>(defaultStore)
  const [isLoaded, setIsLoaded] = useState(false)
  const hasHydratedRef = useRef(false)

  useEffect(() => {
    let isMounted = true

    window.settings
      ?.getProfiles?.()
      .then((storedProfiles) => {
        if (isMounted) {
          setStore(normalizeProfilesStore(storedProfiles))
        }
      })
      .catch((error) => {
        console.error('Failed to load model profiles', error)
      })
      .finally(() => {
        if (isMounted) {
          setIsLoaded(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return

    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true
      return
    }

    const saveTimer = window.setTimeout(() => {
      trackUiEvent('model-settings-save', 'Saving model profile settings', {
        profileCount: store.profiles.length,
        activeProfileId: store.activeProfileId
      })
      window.settings?.saveProfiles?.(store).catch((error) => {
        console.error('Failed to save model profiles', error)
      })
    }, 300)

    return () => window.clearTimeout(saveTimer)
  }, [store, isLoaded])

  const activeProfile =
    store.profiles.find((profile) => profile.id === store.activeProfileId) || store.profiles[0]

  const setActiveProfileId = useCallback((profileId: string): void => {
    trackUiEvent('model-profile-selected', 'User selected an active model profile', {
      profileId
    })
    setStore((current) =>
      normalizeProfilesStore({
        ...current,
        activeProfileId: profileId
      })
    )
  }, [])

  const updateProfile = useCallback((profileId: string, patch: Partial<ModelProfile>): void => {
    setStore((current) =>
      normalizeProfilesStore({
        ...current,
        profiles: current.profiles.map((profile) =>
          profile.id === profileId ? { ...profile, ...patch } : profile
        )
      })
    )
  }, [])

  const addProfile = useCallback((): string => {
    const id = `profile-${Date.now()}`
    trackUiEvent('model-profile-added', 'User created a new model profile', {
      profileId: id
    })

    setStore((current) =>
      normalizeProfilesStore({
        ...current,
        activeProfileId: id,
        profiles: [
          ...current.profiles,
          createDefaultProfile(id, `OpenAI ${current.profiles.length + 1}`, 'openai')
        ]
      })
    )

    return id
  }, [])

  const updateProfileProvider = useCallback((profileId: string, provider: ModelProfile['provider']): void => {
    setStore((current) =>
      normalizeProfilesStore({
        ...current,
        profiles: current.profiles.map((profile) => {
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
    )
  }, [])

  const removeProfile = useCallback((profileId: string): void => {
    trackUiEvent('model-profile-removed', 'User removed a model profile', {
      profileId
    })
    setStore((current) => {
      const remainingProfiles = current.profiles.filter((profile) => profile.id !== profileId)
      const nextProfiles = remainingProfiles.length > 0 ? remainingProfiles : [createDefaultProfile()]
      const nextActiveProfileId =
        current.activeProfileId === profileId
          ? nextProfiles[0].id
          : current.activeProfileId

      return normalizeProfilesStore({
        ...current,
        activeProfileId: nextActiveProfileId,
        profiles: nextProfiles
      })
    })
  }, [])

  const contextValue = useMemo<SettingsContextType>(
    () => ({
      store,
      isLoaded,
      activeProfile,
      setActiveProfileId,
      updateProfile,
      updateProfileProvider,
      addProfile,
      removeProfile
    }),
    [
      activeProfile,
      addProfile,
      isLoaded,
      removeProfile,
      setActiveProfileId,
      store,
      updateProfile,
      updateProfileProvider
    ]
  )

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }

  return context
}
