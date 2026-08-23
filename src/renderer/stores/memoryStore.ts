import { createDefaultMemorySettingsStore, type MemorySettingsStore } from '@shared/memory-settings'
import { trackUiEvent } from '@renderer/logging'
import { create } from 'zustand'

type MemoryStore = {
  settings: MemorySettingsStore
  hydrateSettings: (settings: MemorySettingsStore) => void
  saveSettings: (settings: MemorySettingsStore) => Promise<void>
}

/**
 * @description 保存长期记忆会话范围设置，并同步渲染进程状态。
 * @param settings 待保存的设置。
 * @param set Zustand 状态更新函数。
 */
async function persistMemorySettings(
  settings: MemorySettingsStore,
  set: (partial: Partial<MemoryStore>) => void
): Promise<void> {
  trackUiEvent('memory-settings-save', 'Saved long-term memory access settings', {
    crossSessionCharacterMemory: settings.crossSessionCharacterMemory
  })
  const saved = await window.memory.saveSettings(settings)
  set({ settings: saved })
}

export const useMemoryStore = create<MemoryStore>((set) => ({
  settings: createDefaultMemorySettingsStore(),
  hydrateSettings: (settings) => set({ settings }),
  saveSettings: (settings) => persistMemorySettings(settings, set)
}))
