import type { CharacterRegistry, CharacterSummary } from '@shared/chat'
import { create } from 'zustand'
import { getCharacterRegistry } from '@renderer/services/characters'

const EMPTY_REGISTRY: CharacterRegistry = {
  local: [],
  remote: [],
  refreshedAt: null,
  isSyncing: false
}

type CharacterRegistryStore = {
  registry: CharacterRegistry
  activateChar: CharacterSummary | null
  /**
   * @description 替换当前角色注册表并重新关联激活角色。
   * @param registry 要写入的最新角色注册表。
   * @returns 无返回值。
   */
  setRegistry: (registry: CharacterRegistry) => void
  /**
   * @description 设置当前激活的本地角色。
   * @param char 要激活的角色；传入 null 时清除当前选择。
   * @returns 无返回值。
   */
  setActivateChar: (char: CharacterSummary | null) => void
  /**
   * @description 从主进程读取最新角色注册表。
   * @returns 角色注册表刷新完成后的 Promise。
   */
  refreshRegistry: () => Promise<void>
}

export const useCharacterRegistryStore = create<CharacterRegistryStore>((set) => ({
  registry: EMPTY_REGISTRY,
  activateChar: null,
  /**
   * @description 替换当前角色注册表并重新关联激活角色。
   * @param registry 要写入的最新角色注册表。
   * @returns 无返回值。
   */
  setRegistry: (registry) =>
    set((current) => ({
      registry,
      activateChar: current.activateChar
        ? registry.local.find((char) => char.id === current.activateChar?.id) ||
          current.activateChar
        : current.activateChar
    })),
  /**
   * @description 设置当前激活的本地角色。
   * @param char 要激活的角色；传入 null 时清除当前选择。
   * @returns 无返回值。
   */
  setActivateChar: (char) => set({ activateChar: char }),
  /**
   * @description 从主进程读取最新角色注册表。
   * @returns 角色注册表刷新完成后的 Promise。
   */
  refreshRegistry: async () => {
    const registry = await getCharacterRegistry()
    set((current) => ({
      registry,
      activateChar: current.activateChar
        ? registry.local.find((char) => char.id === current.activateChar?.id) ||
          current.activateChar
        : current.activateChar
    }))
  }
}))
