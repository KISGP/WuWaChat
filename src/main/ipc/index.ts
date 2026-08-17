import { registerChatIpc } from './chat'
import { registerLoreIpc } from './lore'
import { registerCharacterIpc } from './characters'
import { registerLogIpc } from './logs'
import { registerMemoryIpc } from './memory'
import { registerSettingsIpc } from './settings'
import { registerStorageIpc } from './storage'
import { registerToolsIpc } from './tools'
import { registerTtsIpc } from './tts'
import { registerWindowIpc } from './window'

export function registerIpc(): void {
  registerWindowIpc()
  registerChatIpc()
  registerLoreIpc()
  registerCharacterIpc()
  registerSettingsIpc()
  registerMemoryIpc()
  registerLogIpc()
  registerStorageIpc()
  registerToolsIpc()
  registerTtsIpc()
}
