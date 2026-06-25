import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { ChatRunEvent } from '@shared/chat'
import { trackUiEvent } from '@renderer/logging'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { selectActiveBackground, useAppearanceStore } from '@renderer/stores/appearanceStore'
import { selectSessionById, useSessionStore } from '@renderer/stores/sessionStore'
import { selectActiveProfile, useSettingsStore } from '@renderer/stores/settingsStore'
import AreaRightView from '@renderer/components/area-right-view'

/**
 * @description 找出当前正在运行轮次中不允许删除的消息 ID。
 * @param messages 当前会话消息列表。
 * @param sessionStatus 当前会话状态。
 * @returns 需要在 UI 中禁用删除的消息 ID 集合。
 */
function getProtectedDeleteMessageIds(
  messages: Message[],
  sessionStatus: Session['status']
): Set<string> {
  if (sessionStatus !== 'running' || messages.length === 0) {
    return new Set()
  }

  const protectedIds = new Set<string>()
  let index = messages.length - 1

  while (index >= 0 && messages[index].role === 'assistant') {
    protectedIds.add(messages[index].id)
    index -= 1
  }

  if (index >= 0 && messages[index].role === 'user') {
    protectedIds.add(messages[index].id)
  }

  return protectedIds
}

function getChatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method ['"][^'"]+['"]: Error:\s*/u, '')
}

/**
 * @description 找出最新失败轮次对应的用户消息 ID，用于控制重试入口只出现在最新消息处。
 * @param messages 当前会话消息列表。
 * @param sessionStatus 当前会话状态。
 * @returns 最新可重试用户消息 ID；没有失败轮次时返回 null。
 */
function getLatestRetryableUserMessageId(
  messages: Message[],
  sessionStatus: Session['status']
): string | null {
  if (sessionStatus !== 'error') {
    return null
  }

  let index = messages.length - 1
  let hasFailedAssistantMessage = false

  while (index >= 0 && messages[index].role === 'assistant') {
    hasFailedAssistantMessage = hasFailedAssistantMessage || messages[index].status === 'error'
    index -= 1
  }

  if (!hasFailedAssistantMessage || index < 0 || messages[index].role !== 'user') {
    return null
  }

  return messages[index].id
}

export default function AreaRight(): ReactElement {
  const activateChar = useCharacterStore((state) => state.activateChar)
  const activeBackground = useAppearanceStore(selectActiveBackground)
  const activeProfile = useSettingsStore(selectActiveProfile)
  const currentStoreSessionId = useSessionStore((state) => state.currentSessionId)
  const setCurrentSessionId = useSessionStore((state) => state.setCurrentSessionId)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)

  const currentSession = useSessionStore(selectSessionById(currentStoreSessionId))
  const currentSessionId = currentSession?.id ?? null
  const messages =
    currentSession && currentSession.characterId === activateChar?.id ? currentSession.messages : []
  const activeAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant')
  const protectedMessageIds = getProtectedDeleteMessageIds(
    messages,
    currentSession?.status ?? 'idle'
  )
  const retryableMessageId = getLatestRetryableUserMessageId(
    messages,
    currentSession?.status ?? 'idle'
  )
  const hasSettledPendingRun = Boolean(
    pendingRequestId &&
    currentSession &&
    (currentSession.status !== 'running' ||
      (activeAssistantMessage &&
        (activeAssistantMessage.status === 'complete' ||
          activeAssistantMessage.status === 'error' ||
          activeAssistantMessage.status === 'aborted')))
  )
  const effectiveIsLoading = isLoading && !hasSettledPendingRun

  const clearPendingRequest = useCallback((): void => {
    setPendingRequestId(null)
  }, [])

  const handleDeleteMessage = useCallback(
    (message: Message): void => {
      if (!currentSessionId || deletingMessageId || protectedMessageIds.has(message.id)) {
        return
      }

      setDeletingMessageId(message.id)
      void window.ai
        .deleteMessage({
          sessionId: currentSessionId,
          messageId: message.id
        })
        .then((result) => {
          useSessionStore.getState().upsertSession(result.session)
        })
        .catch((error) => {
          console.error(getChatErrorMessage(error))
        })
        .finally(() => {
          setDeletingMessageId(null)
        })
    },
    [currentSessionId, deletingMessageId, protectedMessageIds]
  )

  useEffect(() => {
    const unsubscribe = window.ai?.onRunEvent?.((event: ChatRunEvent) => {
      if (pendingRequestId !== event.requestId) {
        return
      }

      if (
        event.type === 'run-finished' ||
        event.type === 'run-error' ||
        event.type === 'run-aborted'
      ) {
        clearPendingRequest()
        setIsLoading(false)
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [clearPendingRequest, pendingRequestId])

  const handleStop = useCallback(() => {
    const requestId = pendingRequestId
    if (!requestId) return

    trackUiEvent('chat-abort-requested', 'User requested to abort the current chat run', {
      requestId,
      sessionId: currentSession?.id,
      characterId: activateChar?.id
    })
    void window.ai.abortRun(requestId)
  }, [activateChar?.id, currentSession?.id, pendingRequestId])

  const handleSendMessage = useCallback(
    (text: string): void => {
      if (!activateChar?.id) return

      const requestId = globalThis.crypto.randomUUID()
      const sessionId =
        currentSession && currentSession.characterId === activateChar.id ? currentSession.id : null

      setPendingRequestId(requestId)
      setIsLoading(true)
      trackUiEvent('chat-send', 'User sent a chat message', {
        requestId,
        sessionId,
        characterId: activateChar.id,
        profileId: activeProfile.id,
        messageLength: text.length
      })

      window.ai
        .sendMessage({
          requestId,
          sessionId,
          characterId: activateChar.id,
          userMessage: text,
          profileId: activeProfile.id
        })
        .then((result) => {
          setCurrentSessionId(result.sessionId)
        })
        .catch((error) => {
          console.error(getChatErrorMessage(error))
          clearPendingRequest()
          setIsLoading(false)
        })
    },
    [activateChar, activeProfile.id, clearPendingRequest, currentSession, setCurrentSessionId]
  )

  const handleRetryMessage = useCallback(
    (message: Message): void => {
      if (message.role !== 'user' || message.id !== retryableMessageId) {
        return
      }

      handleSendMessage(message.content)
    },
    [handleSendMessage, retryableMessageId]
  )

  return (
    <AreaRightView
      activateChar={activateChar}
      activeBackgroundFullSrc={activeBackground.fullSrc}
      messages={messages}
      onDeleteMessage={handleDeleteMessage}
      deletingMessageId={deletingMessageId}
      protectedMessageIds={protectedMessageIds}
      retryableMessageId={retryableMessageId}
      onRetryMessage={handleRetryMessage}
      onSendMessage={handleSendMessage}
      onStop={handleStop}
      isLoading={effectiveIsLoading}
    />
  )
}
