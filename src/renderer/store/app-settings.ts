import {
  type AnimationPreference,
  type AppSettings,
  type TtsSettings,
  type GithubProxySettings,
  type ChatImageProcessingSettings,
  createDefaultAppSettings,
  normalizeAppSettings
} from '@shared/app-settings'
import { trackUiEvent } from '@renderer/app/telemetry'
import { saveAppSettings } from '@renderer/services/settings'
import { create } from 'zustand'

type AppSettingsStore = {
  settings: AppSettings
  isLoaded: boolean
  saveError: string | null
  hydrate: (settings: AppSettings) => void
  setAnimationPreference: (preference: AnimationPreference) => Promise<void>
  setMessageCollapseLineCount: (lineCount: number) => Promise<void>
  setSettingsSidebarExpanded: (expanded: boolean) => Promise<void>
  updateGithubProxySettings: (patch: Partial<GithubProxySettings>) => Promise<void>
  updateChatImageProcessing: (patch: {
    enabled?: boolean
    compression?: Partial<ChatImageProcessingSettings['compression']>
    resize?: Partial<ChatImageProcessingSettings['resize']>
  }) => Promise<void>
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
 * @returns 设置保存尝试结束后的 Promise。
 * @remarks 写入失败时会记录错误并更新 Store，不会向调用方重新抛出异常。
 */
async function saveSettings(
  settings: AppSettings,
  set: (partial: Partial<AppSettingsStore>) => void
): Promise<void> {
  set({ saveError: null })
  try {
    await saveAppSettings(settings)
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
  /**
   * @description 使用主进程返回的设置快照初始化 Store。
   * @param settings 主进程返回的应用设置快照。
   * @returns 无返回值。
   */
  hydrate: (settings) => set({ settings: normalizeAppSettings(settings), isLoaded: true }),
  /**
   * @description 更新动画偏好并持久化设置。
   * @param animationPreference 用户选择的动画策略。
   * @returns 设置保存流程完成后的 Promise。
   */
  setAnimationPreference: async (animationPreference) => {
    const settings = { ...get().settings, animationPreference }
    set({ settings })
    trackUiEvent('animation-preference-changed', 'User changed animation preference', {
      animationPreference
    })
    await saveSettings(settings, set)
  },
  /**
   * @description 更新消息折叠行数并持久化设置。
   * @param messageCollapseLineCount 消息折叠前允许显示的行数。
   * @returns 设置保存流程完成后的 Promise。
   */
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
  /**
   * @description 更新设置页侧边栏展开状态并持久化设置。
   * @param settingsSidebarExpanded 侧边栏是否展开。
   * @returns 设置保存流程完成后的 Promise。
   */
  setSettingsSidebarExpanded: async (settingsSidebarExpanded) => {
    const settings = { ...get().settings, settingsSidebarExpanded }
    set({ settings })
    await saveSettings(settings, set)
  },
  /**
   * @description 更新 GitHub 代理配置并持久化设置。
   * @param patch 要合并的 GitHub 代理配置字段。
   * @returns 设置保存流程完成后的 Promise。
   */
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
  /**
   * @description 更新聊天图片处理策略并持久化设置。
   * @param patch 要合并的图片处理配置字段。
   * @returns 设置保存流程完成后的 Promise。
   */
  updateChatImageProcessing: async (patch) => {
    const current = get().settings
    const settings = {
      ...current,
      chatImageProcessing: {
        ...current.chatImageProcessing,
        ...patch,
        compression: { ...current.chatImageProcessing.compression, ...patch.compression },
        resize: { ...current.chatImageProcessing.resize, ...patch.resize }
      }
    }
    set({ settings })
    trackUiEvent('chat-image-processing-changed', 'User changed chat image processing settings')
    await saveSettings(settings, set)
  },
  /**
   * @description 切换 TTS 总开关并持久化设置。
   * @param enabled 是否启用 TTS。
   * @returns 设置保存流程完成后的 Promise。
   */
  setTtsEnabled: async (enabled) => {
    const current = get().settings
    const settings = { ...current, tts: { ...current.tts, enabled } }
    set({ settings })
    trackUiEvent('tts-enabled-changed', 'User changed local TTS enabled state', { enabled })
    await saveSettings(settings, set)
  },
  /**
   * @description 更新 TTS 通用配置并持久化设置。
   * @param patch 要合并的 TTS 通用配置字段。
   * @returns 设置保存流程完成后的 Promise。
   */
  updateTtsSettings: async (patch) => {
    const current = get().settings
    const settings = { ...current, tts: { ...current.tts, ...patch } }
    set({ settings })
    trackUiEvent('tts-settings-changed', 'User changed TTS provider settings', {
      provider: settings.tts.provider
    })
    await saveSettings(settings, set)
  },
  /**
   * @description 更新指定 TTS 提供商的配置并持久化设置。
   * @param provider 要更新的 TTS 提供商。
   * @param patch 要合并到该提供商配置中的字段。
   * @returns 设置保存流程完成后的 Promise。
   */
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
  /**
   * @description 更新角色的 TTS 音色引用并持久化设置。
   * @param characterId 要配置音色的角色标识。
   * @param referenceId Fish Audio 音色引用标识；空白值会删除覆盖配置。
   * @returns 设置保存流程完成后的 Promise。
   */
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
  /**
   * @description 清除角色的 TTS 音色覆盖配置并持久化设置。
   * @param characterId 要恢复默认音色的角色标识。
   * @returns 设置保存流程完成后的 Promise。
   */
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
  /**
   * @description 重试保存当前应用设置。
   * @returns 当前应用设置保存流程完成后的 Promise。
   */
  retrySave: async () => saveSettings(get().settings, set)
}))
