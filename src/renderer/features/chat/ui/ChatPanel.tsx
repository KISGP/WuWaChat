import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { ChatImageInput, ChatRunEvent } from '@shared/chat'
import { trackUiEvent } from '@renderer/app/telemetry'
import { useCharacterRegistryStore } from '@renderer/store/character-registry'
import { selectActiveBackground, useAppearanceStore } from '@renderer/store/appearance'
import { selectSessionById, useSessionStore } from '@renderer/store/session'
import { selectActiveProfile, useSettingsStore } from '@renderer/store/profiles'
import { useAppSettingsStore } from '@renderer/store/app-settings'
import ChatPanelView from './ChatPanelView'
import {
  abortRun,
  deleteMessage,
  onRunEvent,
  readImageResource,
  appendMessage,
  triggerRun as triggerRunService
} from '@renderer/services/ai'

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

/**
 * @description 清理聊天 IPC 错误中的远程调用前缀，生成适合记录和展示的错误文本。
 * @param error 聊天运行过程中捕获的异常。
 * @returns 去除 IPC 包装前缀后的错误消息。
 */
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

export default function ChatPanel(): ReactElement {
  const activateChar = useCharacterRegistryStore((state) => state.activateChar)
  const activeBackground = useAppearanceStore(selectActiveBackground)
  const activeProfile = useSettingsStore(selectActiveProfile)
  const chatSendMerge = useAppSettingsStore((state) => state.settings.chatSendMerge)
  const currentStoreSessionId = useSessionStore((state) => state.currentSessionId)
  const setCurrentSessionId = useSessionStore((state) => state.setCurrentSessionId)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const holdRef = useRef<{
    holdId: string
    sessionId: string | null
    characterId: string
    profileId: string
    firstAppendAt: number
    timer: ReturnType<typeof setTimeout> | null
  } | null>(null)
  const lastTypingAtRef = useRef(0)

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
      void deleteMessage({
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
    const unsubscribe = onRunEvent((event: ChatRunEvent) => {
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
      unsubscribe()
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
    void abortRun(requestId)
  }, [activateChar?.id, currentSession?.id, pendingRequestId])

  const triggerRun = useCallback((): void => {
    const hold = holdRef.current
    if (!hold || !hold.sessionId) return
    const session = useSessionStore.getState().sessions.find((item) => item.id === hold.sessionId)
    let index = (session?.messages.length || 0) - 1
    let count = 0
    while (index >= 0 && session?.messages[index].role === 'user') {
      count += 1
      index -= 1
    }
    if (!session || count === 0) {
      holdRef.current = null
      return
    }
    if (hold.timer) {
      clearTimeout(hold.timer)
      hold.timer = null
    }
    const requestId = globalThis.crypto.randomUUID()
    setPendingRequestId(requestId)
    setIsLoading(true)
    trackUiEvent('chat-run-triggered', 'Chat hold triggered a model run', {
      requestId, holdId: hold.holdId, sessionId: hold.sessionId, characterId: hold.characterId,
      messageCount: count
    })
    void triggerRunService({
      holdId: hold.holdId, requestId, sessionId: hold.sessionId, characterId: hold.characterId, profileId: hold.profileId
    }).catch((error) => {
      console.error(getChatErrorMessage(error))
      clearPendingRequest()
      setIsLoading(false)
    }).finally(() => {
      holdRef.current = null
    })
  }, [clearPendingRequest])

  const scheduleHold = useCallback((): void => {
    const hold = holdRef.current
    if (!hold) return
    if (hold.timer) clearTimeout(hold.timer)
    const configured = chatSendMerge.enabled ? chatSendMerge.delaySeconds * 1000 : 0
    const remaining = Math.max(0, hold.firstAppendAt + 30000 - Date.now())
    const delay = Math.min(configured, remaining)
    hold.timer = setTimeout(triggerRun, delay)
    if (delay === 0) triggerRun()
  }, [chatSendMerge.delaySeconds, chatSendMerge.enabled, triggerRun])

  const handleTypingActivity = useCallback((): void => {
    const hold = holdRef.current
    if (!hold) return
    const now = Date.now()
    if (now - lastTypingAtRef.current < 500) return
    lastTypingAtRef.current = now
    scheduleHold()
  }, [scheduleHold])
  const triggerRunRef = useRef(triggerRun)
  useEffect(() => {
    triggerRunRef.current = triggerRun
  }, [triggerRun])

  const handleSendMessage = useCallback(
    (text: string, images: ChatImageInput[] = []): void => {
      if (!activateChar?.id) return
      let hold = holdRef.current
      if (!hold || hold.characterId !== activateChar.id) {
        hold = { holdId: globalThis.crypto.randomUUID(), sessionId: currentSessionId, characterId: activateChar.id, profileId: activeProfile.id, firstAppendAt: Date.now(), timer: null }
        holdRef.current = hold
      }
      const requestId = globalThis.crypto.randomUUID()
      trackUiEvent('chat-send', 'User sent a chat message', {
        requestId,
        holdId: hold.holdId,
        sessionId: hold.sessionId,
        characterId: activateChar.id,
        profileId: activeProfile.id,
        messageLength: text.length
      })
      void appendMessage({
        holdId: hold.holdId,
        requestId,
        sessionId: hold.sessionId,
        characterId: activateChar.id,
        content: text,
        profileId: activeProfile.id,
        images: images.length > 0 ? images : undefined
      })
        .then((result) => {
          const currentHold = holdRef.current
          if (!currentHold || currentHold.holdId !== hold?.holdId) return
          currentHold.sessionId = result.sessionId
          setCurrentSessionId(result.sessionId)
          if (!chatSendMerge.enabled) {
            triggerRun()
          } else {
            scheduleHold()
          }
        })
        .catch((error) => {
          console.error(getChatErrorMessage(error))
        })
    },
    [activateChar, activeProfile.id, chatSendMerge.enabled, currentSessionId, scheduleHold, setCurrentSessionId, triggerRun]
  )

  useEffect(() => () => {
    triggerRunRef.current()
  }, [])

  const previousCharacterIdRef = useRef(activateChar?.id)
  useEffect(() => {
    const previousCharacterId = previousCharacterIdRef.current
    previousCharacterIdRef.current = activateChar?.id
    const hold = holdRef.current
    if (hold && previousCharacterId && activateChar?.id !== previousCharacterId && hold.characterId === previousCharacterId) {
      triggerRun()
    }
  }, [activateChar?.id, triggerRun])

  const handleRetryMessage = useCallback(
    async (message: Message): Promise<void> => {
      if (message.role !== 'user' || message.id !== retryableMessageId) {
        return
      }

      const images: ChatImageInput[] = []
      for (const attachment of message.attachments ?? []) {
        try {
          if (!currentSessionId) {
            throw new Error('当前会话不可用')
          }
          const result = await readImageResource({
            sessionId: currentSessionId,
            resourceId: attachment.resourceId
          })
          if (!result) {
            throw new Error('图片文件不存在：' + attachment.fileName)
          }
          images.push({
            ...attachment,
            dataUrl: result.dataUrl
          })
        } catch (error) {
          console.error('Failed to restore chat image for retry', error)
          trackUiEvent('chat-retry-failed', 'Failed to restore image attachment for retry', {
            sessionId: currentSessionId,
            messageId: message.id,
            resourceId: attachment.resourceId
          })
          return
        }
      }

      handleSendMessage(message.content, images)
    },
    [currentSessionId, handleSendMessage, retryableMessageId]
  )

  return (
    <ChatPanelView
      activateChar={activateChar}
      activeBackgroundFullSrc={activeBackground.fullSrc}
      messages={messages}
      sessionId={currentSessionId}
      onDeleteMessage={handleDeleteMessage}
      deletingMessageId={deletingMessageId}
      protectedMessageIds={protectedMessageIds}
      retryableMessageId={retryableMessageId}
      onRetryMessage={handleRetryMessage}
      onSendMessage={handleSendMessage}
      onTypingActivity={handleTypingActivity}
      onStop={handleStop}
      isLoading={effectiveIsLoading}
    />
  )
}
