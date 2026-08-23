import { registerChatIpc } from './chat'
import { registerCharacterIpc } from './characters'
import { registerLogIpc } from './logs'
import { registerMemoryIpc } from './memory'
import { registerSettingsIpc } from './settings'
import { registerStorageIpc } from './storage'
import { registerToolsIpc } from './tools'
import { registerTtsIpc } from './tts'
import { registerWindowIpc } from './window'
import { registerWorldIpc } from './world'

export function registerIpc(): void {
  registerWindowIpc()
  registerChatIpc()
  registerCharacterIpc()
  registerSettingsIpc()
  registerMemoryIpc()
  registerLogIpc()
  registerStorageIpc()
  registerToolsIpc()
  registerTtsIpc()
  registerWorldIpc()
}
