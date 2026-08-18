import type { MemorySettingsStore } from '@shared/memory-settings'
import { getMemoryService } from '@main/chat'
import { handleLogged } from './logged-handler'

export function registerMemoryIpc(): void {
  const memory = getMemoryService()

  handleLogged('memory:getSettings', () => memory.getSettings())
  handleLogged(
    'memory:saveSettings',
    (_event, store: MemorySettingsStore) => memory.saveSettings(store),
    (store) => ({ crossSessionCharacterMemory: store.crossSessionCharacterMemory })
  )
}
