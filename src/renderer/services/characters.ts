import type { CharacterRegistry } from '@shared/chat'

/**
 * @description 读取当前角色注册表。
 * @returns 包含本地和远程角色状态的注册表 Promise。
 */
export function getCharacterRegistry(): Promise<CharacterRegistry> {
  return window.characters.getCharacterRegistry()
}
/**
 * @description 订阅角色注册表变更。
 * @param listener 接收最新角色注册表的回调。
 * @returns 用于取消订阅的清理函数。
 * @remarks 调用方应在不再需要同步时执行返回的清理函数。
 */
export function onRegistryChanged(
  listener: (registry: CharacterRegistry) => void
): ReturnType<typeof window.characters.onRegistryChanged> {
  return window.characters.onRegistryChanged(listener)
}
/**
 * @description 重试远程角色同步。
 * @param characterId 需要重新同步的远程角色标识。
 * @returns 主进程重试操作完成后的 Promise。
 */
export function retryCharacterSync(
  characterId: string
): ReturnType<typeof window.characters.retryCharacterSync> {
  return window.characters.retryCharacterSync(characterId)
}
/**
 * @description 读取待应用的远程角色 Prompt。
 * @param characterId 要读取候选 Prompt 的远程角色标识。
 * @returns 待应用 Prompt 的读取结果 Promise。
 */
export function getPendingRemoteCharacterPrompt(
  characterId: string
): ReturnType<typeof window.characters.getPendingRemoteCharacterPrompt> {
  return window.characters.getPendingRemoteCharacterPrompt(characterId)
}
/**
 * @description 应用待同步的远程角色 Prompt。
 * @param characterId 要应用候选 Prompt 的远程角色标识。
 * @returns 主进程应用结果的 Promise。
 */
export function applyPendingRemoteCharacterPrompt(
  characterId: string
): ReturnType<typeof window.characters.applyPendingRemoteCharacterPrompt> {
  return window.characters.applyPendingRemoteCharacterPrompt(characterId)
}
