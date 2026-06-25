import type {
  ChatDeleteMessageRequest,
  ChatPromptPreviewRequest,
  ChatRunRequest
} from '@shared/chat'
import {
  abortRun,
  deleteMessage,
  getCharacterPrompt,
  getCharacters,
  getSessions,
  previewModelInput,
  saveCharacterPrompt,
  sendMessage
} from '@main/chat'
import { handleLogged } from './logged-handler'

export function registerChatIpc(): void {
  handleLogged('chat:getCharacters', () => getCharacters())
  handleLogged(
    'chat:getCharacterPrompt',
    (_event, characterId: string) => getCharacterPrompt(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged(
    'chat:saveCharacterPrompt',
    (_event, characterId: string, promptText: string) =>
      saveCharacterPrompt(characterId, promptText),
    (characterId, promptText) => ({
      characterId,
      promptLength: promptText.length
    })
  )
  handleLogged('chat:getSessions', () => getSessions())
  handleLogged(
    'chat:previewModelInput',
    (_event, request: ChatPromptPreviewRequest) => previewModelInput(request),
    (request) => ({
      sessionId: request.sessionId,
      characterId: request.characterId,
      profileId: request.profileId,
      messageLength: request.userMessage.length
    })
  )
  handleLogged(
    'chat:sendMessage',
    (_event, request: ChatRunRequest) => sendMessage(request),
    (request) => ({
      requestId: request.requestId,
      sessionId: request.sessionId,
      characterId: request.characterId,
      profileId: request.profileId,
      messageLength: request.userMessage.length
    })
  )
  handleLogged(
    'chat:deleteMessage',
    (_event, request: ChatDeleteMessageRequest) => deleteMessage(request),
    (request) => ({
      sessionId: request.sessionId,
      messageId: request.messageId
    })
  )
  handleLogged(
    'chat:abortRun',
    (_event, requestId: string) => abortRun(requestId),
    (requestId) => ({ requestId })
  )
}
