import {
  downloadCharacter,
  getCharacterCatalog,
  getRemoteCharacterPrompt,
  refreshRemoteCharacters,
  resetPresetCharacter
} from '../characters'
import { handleLogged } from './logged-handler'

export function registerCharacterIpc(): void {
  handleLogged('character:getCatalog', () => getCharacterCatalog())
  handleLogged('character:refreshRemote', () => refreshRemoteCharacters())
  handleLogged(
    'character:getRemotePrompt',
    (_event, characterId: string) => getRemoteCharacterPrompt(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged(
    'character:download',
    (_event, characterId: string) => downloadCharacter(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged(
    'character:resetPreset',
    (_event, characterId: string) => resetPresetCharacter(characterId),
    (characterId) => ({ characterId })
  )
}
