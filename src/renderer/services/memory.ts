import type { MemorySettingsStore } from '@shared/memory-settings'
/**
 * @description 读取记忆设置。
 * @returns 当前长期记忆设置快照的 Promise。
 */
export function getSettings(): ReturnType<typeof window.memory.getSettings> {
  return window.memory.getSettings()
}
/**
 * @description 保存记忆设置。
 * @param settings 要持久化的完整长期记忆设置。
 * @returns 主进程保存设置后的 Promise。
 */
export function saveSettings(
  settings: MemorySettingsStore
): ReturnType<typeof window.memory.saveSettings> {
  return window.memory.saveSettings(settings)
}
