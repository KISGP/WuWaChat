import {
  type AnimationPreference,
  type AppSettings,
  createDefaultAppSettings,
  normalizeAppSettings
} from '@shared/app-settings'
import { trackUiEvent } from '@renderer/logging'
import { create } from 'zustand'

type AppSettingsStore = {
  settings: AppSettings
  isLoaded: boolean
  hydrate: () => Promise<void>
  setAnimationPreference: (preference: AnimationPreference) => Promise<void>
  setMessageCollapseLineCount: (lineCount: number) => Promise<void>
}

let saveQueue: Promise<void> = Promise.resolve()

/**
 * @description 将应用通用设置按调用顺序写入主进程，避免快速切换选项时发生覆盖。
 * @param settings 待保存的完整设置快照。
 * @returns 设置写入完成后的 Promise。
 */
function queueSettingsSave(settings: AppSettings): Promise<void> {
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(async () => {
      await window.settings.saveAppSettings(settings)
    })
  return saveQueue
}

export const useAppSettingsStore = create<AppSettingsStore>((set, get) => ({
  settings: createDefaultAppSettings(),
  isLoaded: false,
  hydrate: async () => {
    try {
      const settings = await window.settings.getAppSettings()
      set({ settings: normalizeAppSettings(settings) })
    } catch (error) {
      console.error('Failed to load app settings', error)
    } finally {
      set({ isLoaded: true })
    }
  },
  setAnimationPreference: async (animationPreference) => {
    const settings = { ...get().settings, animationPreference }
    set({ settings })
    trackUiEvent('animation-preference-changed', 'User changed animation preference', {
      animationPreference
    })
    try {
      await queueSettingsSave(settings)
    } catch (error) {
      console.error('Failed to save app settings', error)
    }
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
    try {
      await queueSettingsSave(settings)
    } catch (error) {
      console.error('Failed to save app settings', error)
    }
  }
}))
