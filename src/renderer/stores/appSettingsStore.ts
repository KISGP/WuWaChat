import {
  type AnimationPreference,
  type AppSettings,
  type TtsSettings,
  type GithubProxySettings,
  createDefaultAppSettings,
  normalizeAppSettings
} from '@shared/app-settings'
import { trackUiEvent } from '@renderer/logging'
import { create } from 'zustand'

type AppSettingsStore = {
  settings: AppSettings
  isLoaded: boolean
  saveError: string | null
  hydrate: (settings: AppSettings) => void
  setAnimationPreference: (preference: AnimationPreference) => Promise<void>
  setMessageCollapseLineCount: (lineCount: number) => Promise<void>
  updateGithubProxySettings: (patch: Partial<GithubProxySettings>) => Promise<void>
  setTtsEnabled: (enabled: boolean) => Promise<void>
  updateTtsSettings: (patch: Partial<TtsSettings>) => Promise<void>
  updateTtsProviderSettings: <P extends keyof TtsSettings['providers']>(
    provider: P,
    patch: Partial<TtsSettings['providers'][P]>
  ) => Promise<void>
  updateTtsCharacterVoice: (characterId: string, referenceId: string) => Promise<void>
  resetTtsCharacterVoice: (characterId: string) => Promise<void>
  retrySave: () => Promise<void>
}

/**
 * @description 保存应用通用设置，并将失败状态保留给设置界面展示与重试。
 * @param settings 待保存的完整设置快照。
 * @param set Zustand 的状态更新函数。
 * @returns 设置写入完成后的 Promise。
 */
async function saveSettings(
  settings: AppSettings,
  set: (partial: Partial<AppSettingsStore>) => void
): Promise<void> {
  set({ saveError: null })
  try {
    await window.settings.saveAppSettings(settings)
    set({ saveError: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to save app settings', error)
    set({ saveError: message })
  }
}

export const useAppSettingsStore = create<AppSettingsStore>((set, get) => ({
  settings: createDefaultAppSettings(),
  isLoaded: false,
  saveError: null,
  hydrate: (settings) => set({ settings: normalizeAppSettings(settings), isLoaded: true }),
  setAnimationPreference: async (animationPreference) => {
    const settings = { ...get().settings, animationPreference }
    set({ settings })
    trackUiEvent('animation-preference-changed', 'User changed animation preference', {
      animationPreference
    })
    await saveSettings(settings, set)
  },
  setMessageCollapseLineCount: async (messageCollapseLineCount) => {
    const settings = { ...get().settings, messageCollapseLineCount }
    set({ settings })
    trackUiEvent(
      'message-collapse-line-count-changed',
      'User changed message collapse line count',
      {
        messageCollapseLineCount
      }
    )
    await saveSettings(settings, set)
  },
  updateGithubProxySettings: async (patch) => {
    const current = get().settings
    const settings = { ...current, githubProxy: { ...current.githubProxy, ...patch } }
    set({ settings })
    trackUiEvent('github-proxy-settings-changed', 'User changed GitHub proxy settings', {
      enabled: settings.githubProxy.enabled,
      selectedOptionId: settings.githubProxy.selectedOptionId
    })
    await saveSettings(settings, set)
  },
  setTtsEnabled: async (enabled) => {
    const current = get().settings
    const settings = { ...current, tts: { ...current.tts, enabled } }
    set({ settings })
    trackUiEvent('tts-enabled-changed', 'User changed local TTS enabled state', { enabled })
    await saveSettings(settings, set)
  },
  updateTtsSettings: async (patch) => {
    const current = get().settings
    const settings = { ...current, tts: { ...current.tts, ...patch } }
    set({ settings })
    trackUiEvent('tts-settings-changed', 'User changed TTS provider settings', {
      provider: settings.tts.provider
    })
    await saveSettings(settings, set)
  },
  updateTtsProviderSettings: async (provider, patch) => {
    const current = get().settings
    const settings = {
      ...current,
      tts: {
        ...current.tts,
        providers: {
          ...current.tts.providers,
          [provider]: { ...current.tts.providers[provider], ...patch }
        }
      }
    }
    set({ settings })
    trackUiEvent('tts-provider-settings-changed', 'User changed TTS provider settings', {
      provider
    })
    await saveSettings(settings, set)
  },
  updateTtsCharacterVoice: async (characterId, referenceId) => {
    const current = get().settings
    const characterVoices = { ...current.tts.characterVoices }
    if (referenceId.trim()) {
      characterVoices[characterId] = { fish: { referenceId: referenceId.trim() } }
    } else {
      delete characterVoices[characterId]
    }
    const settings = { ...current, tts: { ...current.tts, characterVoices } }
    set({ settings })
    trackUiEvent('tts-character-voice-changed', 'User changed a character TTS voice', {
      characterId
    })
    await saveSettings(settings, set)
  },
  resetTtsCharacterVoice: async (characterId) => {
    const current = get().settings
    if (!current.tts.characterVoices[characterId]) return
    const characterVoices = { ...current.tts.characterVoices }
    delete characterVoices[characterId]
    const settings = { ...current, tts: { ...current.tts, characterVoices } }
    set({ settings })
    trackUiEvent('tts-character-voice-reset', 'User reset a character TTS voice', { characterId })
    await saveSettings(settings, set)
  },
  retrySave: async () => saveSettings(get().settings, set)
}))
