import { registerChatIpc } from './chat'
import { registerCharacterIpc } from './characters'
import { registerLogIpc } from './logs'
import { registerMemoryIpc } from './memory'
import { registerSettingsIpc } from './settings'
import { registerToolsIpc } from './tools'
import { registerWindowIpc } from './window'

export function registerIpc(): void {
  registerWindowIpc()
  registerChatIpc()
  registerCharacterIpc()
  registerSettingsIpc()
  registerMemoryIpc()
  registerLogIpc()
  registerToolsIpc()
}
