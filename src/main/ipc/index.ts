import { registerAiIpc } from './ai'
import { registerCharacterIpc } from './characters'
import { registerLogIpc } from './logs'
import { registerMemoryIpc } from './memory'
import { registerSettingsIpc } from './settings'
import { registerWindowIpc } from './window'

export function registerIpc(): void {
  registerWindowIpc()
  registerAiIpc()
  registerCharacterIpc()
  registerSettingsIpc()
  registerMemoryIpc()
  registerLogIpc()
}
