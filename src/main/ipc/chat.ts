import type {
 ChatDiagnosticRunRequest,
 ChatDeleteMessageRequest,
  ChatAppendMessageRequest,
  ChatTriggerRunRequest,
  ChatImageReadRequest
} from '@shared/chat'
import {
  abortDiagnosticRun,
  abortRun,
  deleteMessage,
  getCharacterPrompt,
  getCharacterEmoticons,
  getUserEmoticons,
  getSessions,
  readImageResource,
  saveCharacterPrompt,
  startDiagnosticRun,
  appendMessage,
  triggerRun
} from '@main/chat'
import { handleLogged } from './logged-handler'

export function registerChatIpc(): void {
  handleLogged(
    'chat:getCharacterPrompt',
    (_event, characterId: string) => getCharacterPrompt(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged(
    'chat:startDiagnosticRun',
    (_event, request: ChatDiagnosticRunRequest) => startDiagnosticRun(request),
    (request) => ({
      requestId: request.requestId,
      sessionId: request.sessionId,
      characterId: request.characterId,
      profileId: request.profileId,
      toolsEnabled: request.toolsEnabled,
      messageLength: request.userMessage.length
    })
  )
  handleLogged(
    'chat:abortDiagnosticRun',
    (_event, requestId: string) => abortDiagnosticRun(requestId),
    (requestId) => ({ requestId })
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
    'chat:getUserEmoticons',
    () => getUserEmoticons(),
    () => ({ source: 'user' })
  )
  handleLogged(
    'chat:getCharacterEmoticons',
    (_event, characterId: string) => getCharacterEmoticons(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged(
    'chat:readImageResource',
    (_event, request: ChatImageReadRequest) => readImageResource(request),
    (request) => ({ sessionId: request.sessionId, resourceId: request.resourceId })
  )
  handleLogged(
    'chat:appendMessage',
    (_event, request: ChatAppendMessageRequest) => appendMessage(request),
    (request) => ({
      requestId: request.requestId,
      holdId: request.holdId,
      sessionId: request.sessionId,
      characterId: request.characterId,
      profileId: request.profileId,
      messageLength: request.segment.type === 'text' ? request.segment.text.length : 0,
      emoticonId: request.segment.type === 'emoticon' ? request.segment.emoticonId : undefined
    })
  )
  handleLogged(
    'chat:triggerRun',
    (_event, request: ChatTriggerRunRequest) => triggerRun(request),
    (request) => ({
      requestId: request.requestId,
      holdId: request.holdId,
      sessionId: request.sessionId,
      characterId: request.characterId,
      profileId: request.profileId
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
