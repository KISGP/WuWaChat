import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { List, type RowComponentProps, useDynamicRowHeight } from 'react-window'
import { Send, StopCircle } from 'lucide-react'
import type { ChatRunEvent } from '../../shared/ai'
import { useCharacter } from '../context/CharacterContext'
import { useSessions } from '../context/SessionsContext'
import { useSettings } from '../context/SettingsContext'
import { trackUiEvent } from '../logging'
import { cn } from '../utils'

import bgAvatar from '../assets/avatar-bg.png'
import bgRight from '../assets/T_PhoneSystemPanel_01.png'
import bgChar from '../assets/T_PhoneSystemModel03.png'
import bgLine from '../assets/T_PhoneSystemModel03Line.png'
import playerAvatar from '../assets/T_IconRoleHeadCircle256_5_a_UI.png'

function getChatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/^Error invoking remote method 'ai:sendMessage': Error:\s*/u, '')
    .replace(/^Error invoking remote method "ai:sendMessage": Error:\s*/u, '')
}

function MessageItem({
  index,
  messages,
  activateChar,
  style
}: RowComponentProps<{
  messages: Message[]
  activateChar: Char
}>): ReactElement {
  const message = messages[index]
  const isUserMessage = message.role === 'user'

  return (
    <div className={cn('flex gap-1', isUserMessage && 'flex-row-reverse gap-5')} style={style}>
      <div className={cn('relative size-15', isUserMessage ? 'mr-4' : 'ml-4')}>
        <img src={bgAvatar} />
        <img
          src={isUserMessage ? playerAvatar : activateChar?.avatar}
          className="absolute top-0.5 left-0.5 size-14"
          draggable="false"
        />
      </div>

      <div className={cn('flex flex-col', isUserMessage ? 'items-end' : 'items-start')}>
        <div>
          <span
            className={cn(
              'mt-2 block text-sm font-[550] text-[#555]/70',
              isUserMessage ? 'mr-2' : 'ml-2'
            )}
          >
            {isUserMessage ? '漂泊者' : activateChar?.name}
          </span>
        </div>

        <div className="relative mt-1 ml-4 max-w-md drop-shadow-[0_1px_2px_rgba(0,0,0,0.05)] filter">
          <div
            className={cn(
              'absolute -top-[0.25px] z-10 h-5 w-5 border-t border-[#e5e7eb]',
              isUserMessage
                ? '-right-5 bg-[radial-gradient(circle_at_100%_100%,transparent_19px,#393C4B_19.5px,#393C4B_20.5px,#393C4B_20.5px)]'
                : '-left-5 bg-[radial-gradient(circle_at_0_100%,transparent_19px,#e5e7eb_19.5px,#e5e7eb_20.5px,white_20.5px)]'
            )}
          />
          <div
            className={cn(
              'min-h-12 px-5 py-3 text-[#333]',
              isUserMessage
                ? 'rounded-tl-md rounded-br-md rounded-bl-xl bg-[#393C4B] text-white'
                : 'rounded-tr-md rounded-br-xl rounded-bl-md bg-white text-[#333]'
            )}
          >
            {(message.status === 'pending' || message.status === 'streaming') && !message.content ? (
              <div className="flex h-6 items-center gap-1 px-1">
                <div className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                <div className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                <div className="size-2 animate-bounce rounded-full bg-gray-400" />
              </div>
            ) : (
              <p className="text-[15px] leading-relaxed font-medium tracking-wide select-text">
                {message.content}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MessagesList({ messages }: { messages: Message[] }): ReactElement {
  const { activateChar } = useCharacter()

  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: 80
  })

  if (!activateChar) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        请选择一个角色开始聊天
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        开始新的一轮对话...
      </div>
    )
  }

  return (
    <List
      className=""
      rowComponent={MessageItem}
      rowCount={messages.length}
      rowHeight={rowHeight}
      rowProps={{ messages, activateChar }}
    />
  )
}

function InputArea({
  onSendMessage,
  onStop,
  isLoading,
  charId
}: {
  onSendMessage: (message: string) => void
  onStop?: () => void
  isLoading: boolean
  charId?: string
}): ReactElement {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = (): void => {
    if (input.trim() && !isLoading && charId) {
      onSendMessage(input)
      setInput('')
      inputRef.current?.focus()
    }
  }

  const handleKeyPress = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="absolute right-10 bottom-8 left-14 flex h-14 items-center gap-2 rounded-xl border-2 border-[#e5e7eb] bg-white/40 px-2 backdrop-blur-sm transition-colors focus-within:bg-white/90 hover:bg-white/60">
      <input
        ref={inputRef}
        type="text"
        placeholder="发送消息..."
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyUp={handleKeyPress}
        disabled={isLoading || !charId}
        className="h-full flex-1 bg-transparent px-3 text-[#333] outline-none placeholder:text-gray-400 disabled:opacity-50"
      />
      <button
        onClick={isLoading ? onStop : handleSend}
        disabled={(!input.trim() || !charId) && !isLoading}
        className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#333] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <div className="group relative flex size-10 items-center justify-center">
            <div className="absolute size-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 group-hover:opacity-0" />
            <StopCircle
              size={20}
              className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
        ) : (
          <Send size={20} />
        )}
      </button>
    </div>
  )
}

export default function AreaRight(): ReactElement {
  const { activateChar } = useCharacter()
  const { activeProfile } = useSettings()
  const { currentSessionId, setCurrentSessionId, getSession } = useSessions()
  const [isLoading, setIsLoading] = useState(false)
  const pendingRequestIdRef = useRef<string | null>(null)

  const currentSession = getSession(currentSessionId)
  const messages =
    currentSession && currentSession.characterId === activateChar?.id ? currentSession.messages : []

  const clearPendingRequest = useCallback((): void => {
    pendingRequestIdRef.current = null
  }, [])

  useEffect(() => {
    const unsubscribe = window.ai?.onRunEvent?.((event: ChatRunEvent) => {
      if (pendingRequestIdRef.current !== event.requestId) {
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
  }, [clearPendingRequest])

  const handleStop = useCallback(() => {
    const requestId = pendingRequestIdRef.current
    if (!requestId) return

    trackUiEvent('chat-abort-requested', 'User requested to abort the current chat run', {
      requestId,
      sessionId: currentSession?.id,
      characterId: activateChar?.id
    })
    void window.ai.abortRun(requestId)
  }, [activateChar?.id, currentSession?.id])

  const handleSendMessage = useCallback(
    (text: string): void => {
      if (!activateChar?.id) return

      const requestId = globalThis.crypto.randomUUID()
      const sessionId =
        currentSession && currentSession.characterId === activateChar.id ? currentSession.id : null

      pendingRequestIdRef.current = requestId
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

  return (
    <div className="relative h-156 w-205">
      <div className="relative h-156 w-205">
        <img
          src={bgRight}
          className="absolute top-0 left-0 object-contain drop-shadow-[0_0_0_#ffffff]"
          draggable="false"
        />

        <img
          src={bgChar}
          className="absolute top-1 left-2 z-10 scale-95 object-contain"
          draggable="false"
        />
        <img
          src={bgLine}
          className="absolute top-21 left-2 z-10 scale-95 object-contain"
          draggable="false"
        />
      </div>

      <span className="absolute top-4 left-12 z-20 text-lg font-semibold">
        {activateChar?.name}
      </span>

      <div className="absolute top-26 right-3 bottom-24 left-4">
        <MessagesList messages={messages} />
      </div>

      <InputArea
        onSendMessage={handleSendMessage}
        onStop={handleStop}
        isLoading={isLoading}
        charId={activateChar?.id}
      />
    </div>
  )
}
