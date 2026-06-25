import { useEffect, type ReactElement } from 'react'
import { List, type RowComponentProps, useDynamicRowHeight, useListCallbackRef } from 'react-window'
import { RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@renderer/utils'
import bgAvatar from '@renderer/assets/avatar-bg.png'
import playerAvatar from '@renderer/assets/T_IconRoleHeadCircle256_5_a_UI.png'

type ChatMessagesListProps = {
  messages: Message[]
  activateChar: Char | null
  onDeleteMessage: (message: Message) => void
  deletingMessageId: string | null
  protectedMessageIds: Set<string>
  retryableMessageId: string | null
  onRetryMessage: (message: Message) => void
  isRetryDisabled: boolean
}

function MessageItem({
  index,
  messages,
  activateChar,
  onDeleteMessage,
  deletingMessageId,
  protectedMessageIds,
  retryableMessageId,
  onRetryMessage,
  isRetryDisabled,
  style
}: RowComponentProps<{
  messages: Message[]
  activateChar: Char
  onDeleteMessage: (message: Message) => void
  deletingMessageId: string | null
  protectedMessageIds: Set<string>
  retryableMessageId: string | null
  onRetryMessage: (message: Message) => void
  isRetryDisabled: boolean
}>): ReactElement {
  const message = messages[index]
  const isUserMessage = message.role === 'user'
  const canRetryMessage = isUserMessage && retryableMessageId === message.id
  const isDeleteDisabled =
    protectedMessageIds.has(message.id) ||
    deletingMessageId === message.id ||
    message.status === 'pending' ||
    message.status === 'streaming'

  return (
    <div
      className={cn('group flex gap-1', isUserMessage && 'flex-row-reverse gap-5')}
      style={style}
    >
      <div className={cn('relative size-15', isUserMessage ? 'mr-4' : 'ml-4')}>
        <img src={bgAvatar} />
        <img
          src={isUserMessage ? playerAvatar : activateChar.avatar}
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
            {isUserMessage ? '漂泊者' : activateChar.name}
          </span>
        </div>

        <div className="relative mt-1 ml-4 max-w-md drop-shadow-[0_1px_2px_rgba(0,0,0,0.05)] filter">
          <div
            className={cn(
              'absolute top-[-0.25px] z-10 h-5 w-5 border-t border-[#e5e7eb]',
              isUserMessage
                ? '-right-5 bg-[radial-gradient(circle_at_100%_100%,transparent_19px,#393C4B_19.5px,#393C4B_20.5px,#393C4B_20.5px)]'
                : '-left-5 bg-[radial-gradient(circle_at_0_100%,transparent_19px,#e5e7eb_19.5px,#e5e7eb_20.5px,white_20.5px)]'
            )}
          />
          <div
            className={cn(
              'relative min-h-12 px-5 py-3 text-[#333]',
              isUserMessage
                ? 'rounded-tl-md rounded-br-md rounded-bl-xl bg-[#393C4B] text-white'
                : 'rounded-tr-md rounded-br-xl rounded-bl-md bg-white text-[#333]'
            )}
          >
            {(message.status === 'pending' || message.status === 'streaming') &&
            !message.content ? (
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
            <button
              type="button"
              onClick={() => onDeleteMessage(message)}
              disabled={isDeleteDisabled}
              className={cn(
                'absolute -top-1 flex size-7 items-center justify-center rounded-md transition-opacity',
                isUserMessage ? '-left-6' : '-right-6',
                isDeleteDisabled
                  ? 'text-gray-400 opacity-0 group-hover:opacity-30 disabled:cursor-not-allowed'
                  : 'text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-500'
              )}
            >
              <Trash2 size={16} />
            </button>
            {canRetryMessage && (
              <button
                type="button"
                onClick={() => onRetryMessage(message)}
                disabled={isRetryDisabled}
                className="absolute right-0 -bottom-7 flex items-center gap-1 rounded-md bg-white/85 px-2 py-1 text-xs font-medium text-gray-500 shadow-sm transition-colors hover:bg-white hover:text-[#333] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw size={13} />
                重试
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ChatMessagesList({
  messages,
  activateChar,
  onDeleteMessage,
  deletingMessageId,
  protectedMessageIds,
  retryableMessageId,
  onRetryMessage,
  isRetryDisabled
}: ChatMessagesListProps): ReactElement {
  const [listApi, setListApi] = useListCallbackRef(null)
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: 80
  })
  const visibleMessages = messages.filter(
    (message) =>
      message.role !== 'assistant' || message.content.trim() || message.status !== 'error'
  )
  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1] || null

  useEffect(() => {
    if (!listApi || visibleMessages.length === 0) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      listApi.scrollToRow({
        align: 'end',
        behavior: 'smooth',
        index: visibleMessages.length - 1
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [lastVisibleMessage?.content, lastVisibleMessage?.id, listApi, visibleMessages.length])

  if (!activateChar) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        请选择一个角色开始聊天
      </div>
    )
  }

  if (visibleMessages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        开始新的一轮对话...
      </div>
    )
  }

  return (
    <List
      listRef={setListApi}
      style={{ paddingBottom: 20, boxSizing: 'border-box' }}
      rowComponent={MessageItem}
      rowCount={visibleMessages.length}
      rowHeight={rowHeight}
      rowProps={{
        messages: visibleMessages,
        activateChar,
        onDeleteMessage,
        deletingMessageId,
        protectedMessageIds,
        retryableMessageId,
        onRetryMessage,
        isRetryDisabled
      }}
    />
  )
}
