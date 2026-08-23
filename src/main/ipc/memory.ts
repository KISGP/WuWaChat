import type { MemorySettingsStore } from '@shared/memory-settings'
import { memoryService } from '@main/app/services'
import { handleLogged } from './logged-handler'

export function registerMemoryIpc(): void {
  handleLogged('memory:getSettings', () => memoryService.getSettings())
  handleLogged(
    'memory:saveSettings',
    (_event, store: MemorySettingsStore) => memoryService.saveSettings(store),
    (store) => ({ crossSessionCharacterMemory: store.crossSessionCharacterMemory })
  )
}
