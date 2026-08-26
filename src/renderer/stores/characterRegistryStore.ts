import type { CharacterRegistry, CharacterSummary } from '@shared/chat'
import { create } from 'zustand'

const EMPTY_REGISTRY: CharacterRegistry = {
  local: [],
  remote: [],
  refreshedAt: null,
  isSyncing: false
}

type CharacterRegistryStore = {
  registry: CharacterRegistry
  activateChar: CharacterSummary | null
  /** @description 替换当前角色注册表并重新关联激活角色。 */
  setRegistry: (registry: CharacterRegistry) => void
  /** @description 设置当前激活的本地角色。 */
  setActivateChar: (char: CharacterSummary | null) => void
  /** @description 从主进程读取最新角色注册表。 */
  refreshRegistry: () => Promise<void>
}

export const useCharacterRegistryStore = create<CharacterRegistryStore>((set) => ({
  registry: EMPTY_REGISTRY,
  activateChar: null,
  setRegistry: (registry) =>
    set((current) => ({
      registry,
      activateChar: current.activateChar
        ? registry.local.find((char) => char.id === current.activateChar?.id) ||
          current.activateChar
        : current.activateChar
    })),
  setActivateChar: (char) => set({ activateChar: char }),
  refreshRegistry: async () => {
    const registry = await window.characters.getCharacterRegistry()
    set((current) => ({
      registry,
      activateChar: current.activateChar
        ? registry.local.find((char) => char.id === current.activateChar?.id) ||
          current.activateChar
        : current.activateChar
    }))
  }
}))
