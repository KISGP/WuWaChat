import {
  applyPendingRemoteCharacterPrompt,
  getCharacterRegistry,
  getPendingRemoteCharacterPrompt,
  retryCharacterSync
} from '../characters'
import { handleLogged } from './logged-handler'

export function registerCharacterIpc(): void {
  handleLogged('character:getRegistry', () => getCharacterRegistry())
  handleLogged(
    'character:getPendingRemotePrompt',
    (_event, characterId: string) => getPendingRemoteCharacterPrompt(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged(
    'character:retrySync',
    (_event, characterId: string) => retryCharacterSync(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged(
    'character:applyPendingPrompt',
    (_event, characterId: string) => applyPendingRemoteCharacterPrompt(characterId),
    (characterId) => ({ characterId })
  )
}
