import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { List, type RowComponentProps, useDynamicRowHeight, useListCallbackRef } from 'react-window'
import {
  Check,
  CircleAlert,
  Copy,
  LoaderCircle,
  RotateCcw,
  Square,
  Trash2,
  Volume2
} from 'lucide-react'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { cn } from '@renderer/common/lib/cn'
import { useMotionPreference } from '@renderer/app/hooks/useMotionPreference'
import { useAppSettingsStore } from '@renderer/store/app-settings'
import bgAvatar from '@renderer/assets/avatar-bg.png'
import playerAvatar from '@renderer/assets/T_IconRoleHeadCircle256_5_a_UI.png'
import {
  Bubble,
  BubbleContent,
  BubbleReactions,
  BubbleTail
} from '@renderer/common/components/bubble'
import { track } from '@renderer/services/logs'
import { cancel, synthesize } from '@renderer/services/tts'
import { readImageResource } from '@renderer/services/ai'
import { getCharacterEmoticons, getUserEmoticons } from '@renderer/services/emoticons'
import type { ChatImageAttachment } from '@shared/chat'
import type { ChatEmoticonImage } from '@shared/chat-emoticons'

gsap.registerPlugin(useGSAP)

type MessageListProps = {
  messages: Message[]
  sessionId: string | null
  activateChar: Char | null
  onDeleteMessage: (message: Message) => void
  deletingMessageId: string | null
  protectedMessageIds: Set<string>
  retryableMessageId: string | null
  onRetryMessage: (message: Message) => void
  isRetryDisabled: boolean
}

/**
 * @description 将消息内容写入系统剪贴板。
 * @param content 需要复制的消息文本。
 * @returns 内容是否已成功复制。
 * @remarks 剪贴板权限被拒绝时记录错误，避免点击操作静默失败。
 */
async function copyMessageContent(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content)
    return true
  } catch (error) {
    console.error('Failed to copy chat message content', error)
    return false
  }
}

type CopyMessageButtonProps = {
  content: string
  messageId: string
  disabled: boolean
}

type SpeechState = {
  messageId: string
  phase: 'synthesizing' | 'playing'
} | null

type SpeechError = {
  messageId: string
  message: string
}

type SpeakMessageButtonProps = {
  message: Message
  speechState: SpeechState
  speechError: SpeechError | null
  onToggle: (message: Message) => void
}

/**
 * @description 从 IPC 错误中提取适合在语音播放控件中展示的短文本。
 * @param error TTS IPC 或浏览器音频播放产生的异常。
 * @returns 去除 Electron IPC 前缀后的错误信息。
 */
function getTtsErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method ['"][^'"]+['"]: Error:\s*/u, '')
}

/**
 * @description 将浏览器音频元素的失败状态写入应用日志，用于区分协议加载与 WAV 解码问题。
 * @param audio 触发错误事件的音频元素。
 * @param messageId 当前播放控制对应的角色消息标识。
 */
function logTtsPlaybackFailure(audio: HTMLAudioElement, messageId: string): void {
  const mediaError = audio.error
  void track({
    level: 'error',
    source: 'renderer',
    event: 'tts-audio-playback-failed',
    message: 'Synthesized TTS audio could not be played',
    context: {
      currentSrc: audio.currentSrc,
      mediaErrorCode: mediaError?.code ?? null,
      mediaErrorMessage: mediaError?.message ?? null,
      messageId,
      networkState: audio.networkState,
      readyState: audio.readyState,
      src: audio.src
    }
  }).catch((error: unknown) => {
    console.error('Failed to record TTS playback failure', error)
  })
}

function SpeakMessageButton({
  message,
  speechState,
  speechError,
  onToggle
}: SpeakMessageButtonProps): ReactElement {
  const isCurrentMessage = speechState?.messageId === message.id
  const isSynthesizing = isCurrentMessage && speechState.phase === 'synthesizing'
  const isPlaying = isCurrentMessage && speechState.phase === 'playing'
  const hasError = speechError?.messageId === message.id
  const disabled = message.status !== 'complete' || !message.content.trim()
  const title = isSynthesizing
    ? '停止生成语音'
    : isPlaying
      ? '停止播放'
      : hasError
        ? `语音生成失败：${speechError.message}`
        : '播放角色语音'

  return (
    <button
      type="button"
      onClick={() => onToggle(message)}
      disabled={disabled}
      className={cn(
        'flex size-7 items-center justify-center rounded-full opacity-60 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        hasError
          ? 'text-red-500 hover:opacity-100'
          : 'text-gray-400 hover:text-[#333] hover:opacity-100'
      )}
      title={title}
      aria-label={title}
    >
      {isSynthesizing ? (
        <LoaderCircle size={16} className="animate-spin" />
      ) : isPlaying ? (
        <Square size={14} fill="currentColor" />
      ) : hasError ? (
        <CircleAlert size={16} />
      ) : (
        <Volume2 size={16} />
      )}
    </button>
  )
}

function CopyMessageButton({ content, messageId, disabled }: CopyMessageButtonProps): ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const resetTimerRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const animateCopyConfirmationRef = useRef<() => void>(() => {})
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const { shouldAnimate } = useMotionPreference()
  const isCopied = copiedMessageId === messageId

  useGSAP(
    (_, contextSafe) => {
      if (!contextSafe) {
        return
      }

      animateCopyConfirmationRef.current = contextSafe(() => {
        const indicator = indicatorRef.current

        if (!indicator || !shouldAnimate) {
          return
        }

        gsap.killTweensOf(indicator)
        gsap.fromTo(
          indicator,
          { autoAlpha: 0.35, rotation: -18, scale: 0.65 },
          { autoAlpha: 1, duration: 0.28, ease: 'back.out(2)', rotation: 0, scale: 1 }
        )
      })

      return () => {
        animateCopyConfirmationRef.current = () => {}
      }
    },
    { dependencies: [messageId, shouldAnimate], revertOnUpdate: true, scope: buttonRef }
  )

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [messageId])

  const handleCopy = async (): Promise<void> => {
    const wasCopied = await copyMessageContent(content)

    if (!wasCopied) {
      return
    }

    setCopiedMessageId(messageId)

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animateCopyConfirmationRef.current()
    })
    resetTimerRef.current = window.setTimeout(() => {
      setCopiedMessageId((currentMessageId) =>
        currentMessageId === messageId ? null : currentMessageId
      )
    }, 1600)
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => void handleCopy()}
      disabled={disabled}
      className={cn(
        'flex size-7 items-center justify-center rounded-full opacity-60 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        isCopied ? 'text-green-500' : 'text-gray-400 hover:text-[#333] hover:opacity-100'
      )}
      title={isCopied ? '已复制' : '复制消息'}
      aria-label={isCopied ? '消息已复制' : '复制消息'}
    >
      <span ref={indicatorRef} className="flex items-center justify-center">
        {isCopied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} />}
      </span>
    </button>
  )
}

type MessageActionAreaProps = {
  align: 'start' | 'end'
  actionCount: number
  actions: ReactNode
  children: ReactNode
  messageId: string
}

type CollapsibleMessageContentProps = {
  content: string
  maxLineCount: number
}

type AttachmentPreviewProps = {
  sessionId: string | null
  attachment: ChatImageAttachment
}

type EmoticonBubbleProps = {
  id: string
  role: Message['role']
  characterId: string
}

/**
 * @description 按消息来源读取并展示表情图片，缺失时显示稳定占位符。
 * @param id 表情全局 ID。
 * @param role 消息角色。
 * @param characterId 当前角色 ID。
 * @returns 表情图片或占位元素。
 */
function EmoticonBubble({ id, role, characterId }: EmoticonBubbleProps): ReactElement {
  const [image, setImage] = useState<ChatEmoticonImage | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = role === 'user' ? getUserEmoticons() : getCharacterEmoticons(characterId)
    void load
      .then((images) => {
        if (!cancelled) setImage(images.find((item) => item.id === id) || null)
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load chat emoticon', error)
          setImage(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [characterId, id, role])

  if (image?.dataUrl && !image.unavailable) {
    return <img src={image.dataUrl} alt={image.description} className="size-30 object-contain" draggable="false" />
  }
  return (
    <div className="flex size-30 items-center justify-center bg-gray-200/80 px-2 text-center text-xs text-gray-500">
      {id}
    </div>
  )
}

/**
 * @description 按需读取并展示历史聊天图片，避免将图片字节写入会话消息快照。
 * @param sessionId 当前会话 ID。
 * @param attachment 图片附件元数据。
 */
function AttachmentPreview({ sessionId, attachment }: AttachmentPreviewProps): ReactElement {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedResourceId, setLoadedResourceId] = useState<string | null>(null)
  const [errorResourceId, setErrorResourceId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!sessionId) {
      return () => {
        cancelled = true
      }
    }

    void readImageResource({ sessionId, resourceId: attachment.resourceId })
      .then((result) => {
        if (cancelled) {
          return
        }
        if (!result) {
          setErrorResourceId(attachment.resourceId)
          setError('图片文件不存在')
          return
        }
        setLoadedResourceId(attachment.resourceId)
        setDataUrl(result.dataUrl)
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return
        }
        const message = cause instanceof Error ? cause.message : String(cause)
        console.error('Failed to load chat image resource', cause)
        setErrorResourceId(attachment.resourceId)
        setError(message)
      })

    return () => {
      cancelled = true
    }
  }, [attachment.resourceId, sessionId])

  const visibleDataUrl = loadedResourceId === attachment.resourceId ? dataUrl : null
  const visibleError = errorResourceId === attachment.resourceId ? error : null
  const loadingText = sessionId ? '加载中...' : '会话不可用'

  return (
    <div className="relative size-28 shrink-0 overflow-hidden rounded-md border border-black/10 bg-gray-100">
      {visibleDataUrl ? (
        <img
          src={visibleDataUrl}
          alt={attachment.fileName}
          className="size-full object-cover"
          draggable="false"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-[10px] text-gray-500">
          <span className="max-w-full truncate">{attachment.fileName}</span>
          <span>{visibleError || loadingText}</span>
        </div>
      )}
    </div>
  )
}

function CollapsibleMessageContent({
  content,
  maxLineCount
}: CollapsibleMessageContentProps): ReactElement {
  const contentRef = useRef<HTMLParagraphElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useLayoutEffect(() => {
    const contentElement = contentRef.current

    if (!contentElement || isExpanded) {
      return
    }

    /**
     * @description 根据折叠后的实际高度判断消息是否需要展示展开按钮。
     */
    const updateOverflowState = (): void => {
      setIsOverflowing(contentElement.scrollHeight > contentElement.clientHeight + 1)
    }

    updateOverflowState()
    const resizeObserver = new ResizeObserver(updateOverflowState)
    resizeObserver.observe(contentElement)

    return () => {
      resizeObserver.disconnect()
    }
  }, [content, isExpanded, maxLineCount])

  return (
    <div>
      <p
        ref={contentRef}
        className="text-[15px] leading-relaxed font-medium tracking-wide select-text"
        style={
          isExpanded
            ? undefined
            : {
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: maxLineCount,
                display: '-webkit-box',
                overflow: 'hidden'
              }
        }
      >
        {content}
      </p>
      {isOverflowing && (
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="mt-1 text-sm font-medium opacity-75 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-expanded={isExpanded}
        >
          {isExpanded ? '收起' : '展开'}
        </button>
      )}
    </div>
  )
}

function MessageActionArea({
  align,
  actionCount,
  actions,
  children,
  messageId
}: MessageActionAreaProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const showActionsRef = useRef<() => void>(() => {})
  const hideActionsRef = useRef<() => void>(() => {})
  const { shouldAnimate } = useMotionPreference()

  useGSAP(
    (_, contextSafe) => {
      if (!contextSafe) {
        return
      }

      const capsule = containerRef.current?.querySelector<HTMLElement>(
        '[data-slot="bubble-reactions"]'
      )

      if (!capsule) {
        return
      }

      const expandedWidth = capsule.getBoundingClientRect().width

      gsap.set(capsule, {
        autoAlpha: 0,
        pointerEvents: 'none',
        width: 0
      })

      showActionsRef.current = contextSafe(() => {
        if (!shouldAnimate) {
          gsap.set(capsule, { autoAlpha: 1, pointerEvents: 'auto', width: expandedWidth })
          return
        }

        gsap.killTweensOf(capsule)
        gsap.set(capsule, { pointerEvents: 'auto' })
        gsap.to(capsule, {
          autoAlpha: 1,
          duration: 0.36,
          ease: 'power3.out',
          width: expandedWidth
        })
      })

      hideActionsRef.current = contextSafe(() => {
        gsap.killTweensOf(capsule)

        if (!shouldAnimate) {
          gsap.set(capsule, {
            autoAlpha: 0,
            pointerEvents: 'none',
            width: 0
          })
          return
        }

        gsap.to(capsule, {
          autoAlpha: 0,
          duration: 0.2,
          ease: 'power1.in',
          onComplete: () => {
            gsap.set(capsule, { pointerEvents: 'none' })
          },
          overwrite: 'auto',
          width: 0
        })
      })

      return () => {
        showActionsRef.current = () => {}
        hideActionsRef.current = () => {}
      }
    },
    {
      dependencies: [actionCount, align, messageId, shouldAnimate],
      revertOnUpdate: true,
      scope: containerRef
    }
  )

  return (
    <div
      ref={containerRef}
      className="relative mt-1 ml-4 w-fit max-w-md pb-6"
      onPointerEnter={() => showActionsRef.current()}
      onPointerLeave={() => hideActionsRef.current()}
      onFocus={() => showActionsRef.current()}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget

        if (
          !(nextFocusedElement instanceof Node) ||
          !event.currentTarget.contains(nextFocusedElement)
        ) {
          hideActionsRef.current()
        }
      }}
    >
      {children}
      <BubbleReactions align={align} className="bottom-1 translate-y-0 overflow-hidden opacity-0">
        {actions}
      </BubbleReactions>
    </div>
  )
}

function MessageItem({
  index,
  messages,
  sessionId,
  activateChar,
  onDeleteMessage,
  deletingMessageId,
  protectedMessageIds,
  retryableMessageId,
  onRetryMessage,
  isRetryDisabled,
  speechState,
  speechError,
  onToggleSpeech,
  messageCollapseLineCount,
  ttsEnabled,
  style
}: RowComponentProps<{
  messages: Message[]
  sessionId: string | null
  activateChar: Char
  onDeleteMessage: (message: Message) => void
  deletingMessageId: string | null
  protectedMessageIds: Set<string>
  retryableMessageId: string | null
  onRetryMessage: (message: Message) => void
  isRetryDisabled: boolean
  speechState: SpeechState
  speechError: SpeechError | null
  onToggleSpeech: (message: Message) => void
  messageCollapseLineCount: number
  ttsEnabled: boolean
}>): ReactElement {
  const message = messages[index]
  const isUserMessage = message.role === 'user'
  const canRetryMessage = isUserMessage && retryableMessageId === message.id
  const isCopyDisabled = !message.content.trim()
  const canSpeak =
    ttsEnabled && !isUserMessage && message.status === 'complete' && Boolean(message.content.trim())
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

        <MessageActionArea
          align={isUserMessage ? 'start' : 'end'}
          actionCount={canSpeak || canRetryMessage ? 3 : 2}
          messageId={message.id}
          actions={
            <>
              <CopyMessageButton
                content={message.content}
                messageId={message.id}
                disabled={isCopyDisabled}
              />
              {canSpeak && (
                <SpeakMessageButton
                  message={message}
                  speechState={speechState}
                  speechError={speechError}
                  onToggle={onToggleSpeech}
                />
              )}
              <button
                type="button"
                onClick={() => onDeleteMessage(message)}
                disabled={isDeleteDisabled}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-gray-400 transition-colors',
                  isDeleteDisabled
                    ? 'cursor-not-allowed opacity-30'
                    : 'opacity-60 hover:text-red-500 hover:opacity-100'
                )}
                title="删除消息"
                aria-label="删除消息"
              >
                <Trash2 size={16} />
              </button>
              {canRetryMessage && (
                <button
                  type="button"
                  onClick={() => onRetryMessage(message)}
                  disabled={isRetryDisabled}
                  className="flex size-7 items-center justify-center rounded-full text-gray-400 opacity-60 transition-colors hover:text-[#333] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                  title="重试"
                  aria-label="重试"
                >
                  <RotateCcw size={16} />
                </button>
              )}
            </>
          }
        >
          <div className={cn('flex flex-col gap-2', isUserMessage ? 'items-end' : 'items-start')}>
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex max-w-full flex-wrap gap-2">
                {message.attachments.map((attachment) => (
                  <AttachmentPreview
                    key={attachment.resourceId}
                    sessionId={sessionId}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}
            {message.emoticonId ? (
              <EmoticonBubble id={message.emoticonId} role={message.role} characterId={activateChar.id} />
            ) : (message.status === 'pending' || message.status === 'streaming') &&
            !message.content ? (
              <Bubble
                align={isUserMessage ? 'end' : 'start'}
                variant="chat"
                className="max-w-md drop-shadow-[0_1px_2px_rgba(0,0,0,0.05)] filter"
              >
                <BubbleTail />
                <BubbleContent
                  className={cn(
                    'min-h-12 px-5 py-3 text-[#333]',
                    isUserMessage
                      ? 'rounded-tl-md rounded-tr-none rounded-br-md rounded-bl-xl bg-[#393C4B] text-white'
                      : 'rounded-tl-none rounded-tr-md rounded-br-xl rounded-bl-md bg-white text-[#333]'
                  )}
                >
                  <div className="flex h-6 items-center gap-1 px-1">
                    <div className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                    <div className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                    <div className="size-2 animate-bounce rounded-full bg-gray-400" />
                  </div>
                </BubbleContent>
              </Bubble>
            ) : message.content ? (
              <Bubble
                align={isUserMessage ? 'end' : 'start'}
                variant="chat"
                className="max-w-md drop-shadow-[0_1px_2px_rgba(0,0,0,0.05)] filter"
              >
                <BubbleTail />
                <BubbleContent
                  className={cn(
                    'min-h-12 px-5 py-3 text-[#333]',
                    isUserMessage
                      ? 'rounded-tl-md rounded-tr-none rounded-br-md rounded-bl-xl bg-[#393C4B] text-white'
                      : 'rounded-tl-none rounded-tr-md rounded-br-xl rounded-bl-md bg-white text-[#333]'
                  )}
                >
                  <CollapsibleMessageContent
                    key={message.id}
                    content={message.content}
                    maxLineCount={messageCollapseLineCount}
                  />
                </BubbleContent>
              </Bubble>
            ) : null}
          </div>
        </MessageActionArea>
      </div>
    </div>
  )
}

export default function MessageList({
  messages,
  sessionId,
  activateChar,
  onDeleteMessage,
  deletingMessageId,
  protectedMessageIds,
  retryableMessageId,
  onRetryMessage,
  isRetryDisabled
}: MessageListProps): ReactElement {
  const messageCollapseLineCount = useAppSettingsStore(
    (state) => state.settings.messageCollapseLineCount
  )
  const ttsEnabled = useAppSettingsStore((state) => state.settings.tts.enabled)
  const characterId = activateChar?.id || ''
  const [listApi, setListApi] = useListCallbackRef(null)
  const [speechState, setSpeechState] = useState<SpeechState>(null)
  const [speechError, setSpeechError] = useState<SpeechError | null>(null)
  const activeSynthesisRequestIdRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: 80
  })
  const visibleMessages = messages.filter(
    (message) =>
      message.role !== 'assistant' || message.content.trim() || message.status !== 'error'
  )
  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1] || null

  /**
   * @description 停止当前浏览器音频播放，并释放与该播放关联的状态。
   */
  const stopPlayback = useCallback((): void => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.pause()
    audio.currentTime = 0
    audioRef.current = null
  }, [])

  /**
   * @description 停止正在运行的 TTS 合成或当前已经开始的音频播放。
   */
  const stopSpeech = useCallback((): void => {
    const requestId = activeSynthesisRequestIdRef.current
    activeSynthesisRequestIdRef.current = null
    stopPlayback()
    setSpeechState(null)

    if (requestId) {
      void cancel(requestId).catch((error: unknown) => {
        console.error('Failed to cancel TTS synthesis', error)
      })
    }
  }, [stopPlayback])

  /**
   * @description 为一条已完成的角色消息生成语音，或停止该消息当前的生成与播放。
   * @param message 用户点击语音控制按钮对应的角色消息。
   */
  const handleToggleSpeech = useCallback(
    (message: Message): void => {
      if (
        !characterId ||
        message.role !== 'assistant' ||
        message.status !== 'complete' ||
        !message.content.trim()
      ) {
        return
      }

      if (speechState?.messageId === message.id) {
        stopSpeech()
        return
      }

      stopSpeech()
      const requestId = globalThis.crypto.randomUUID()
      activeSynthesisRequestIdRef.current = requestId
      setSpeechError(null)
      setSpeechState({ messageId: message.id, phase: 'synthesizing' })

      void synthesize({
        requestId,
        messageId: message.id,
        characterId,
        text: message.content
      })
        .then((result) => {
          if (activeSynthesisRequestIdRef.current !== requestId) {
            return
          }

          activeSynthesisRequestIdRef.current = null
          const audio = new Audio(result.audioUrl)
          audioRef.current = audio
          setSpeechState({ messageId: message.id, phase: 'playing' })

          const stopWhenFinished = (): void => {
            if (audioRef.current !== audio) {
              return
            }
            audioRef.current = null
            setSpeechState(null)
          }
          audio.addEventListener('ended', stopWhenFinished, { once: true })
          audio.addEventListener(
            'error',
            () => {
              logTtsPlaybackFailure(audio, message.id)
              if (audioRef.current !== audio) {
                return
              }
              audioRef.current = null
              setSpeechState(null)
              setSpeechError({ messageId: message.id, message: '生成的音频无法播放。' })
            },
            { once: true }
          )
          void audio.play().catch((error: unknown) => {
            if (audioRef.current !== audio) {
              return
            }
            audioRef.current = null
            setSpeechState(null)
            setSpeechError({ messageId: message.id, message: getTtsErrorMessage(error) })
            console.error('Failed to play synthesized TTS audio', error)
          })
        })
        .catch((error: unknown) => {
          if (activeSynthesisRequestIdRef.current !== requestId) {
            return
          }

          activeSynthesisRequestIdRef.current = null
          setSpeechState(null)
          setSpeechError({ messageId: message.id, message: getTtsErrorMessage(error) })
          console.error('Failed to synthesize TTS audio', error)
        })
    },
    [characterId, speechState, stopSpeech]
  )

  useEffect(() => {
    return () => {
      const requestId = activeSynthesisRequestIdRef.current
      activeSynthesisRequestIdRef.current = null
      stopPlayback()

      if (requestId) {
        void cancel(requestId).catch((error: unknown) => {
          console.error('Failed to cancel TTS synthesis during cleanup', error)
        })
      }
    }
  }, [stopPlayback])

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
        sessionId,
        activateChar,
        onDeleteMessage,
        deletingMessageId,
        protectedMessageIds,
        retryableMessageId,
        onRetryMessage,
        isRetryDisabled,
        speechState,
        speechError,
        onToggleSpeech: handleToggleSpeech,
        messageCollapseLineCount,
        ttsEnabled
      }}
    />
  )
}
