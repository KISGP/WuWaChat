import type { ReactElement } from 'react'
import type { ChatImageInput } from '@shared/chat'
import bgBase from '@renderer/assets/T_PhoneSystemPanel_01.png'
import bgChar from '@renderer/assets/T_PhoneSystemModel03.png'
import bgLine from '@renderer/assets/T_PhoneSystemModel03Line.png'
import ChatComposer from './ChatComposer'
import MessageList from './MessageList'

type ChatPanelViewProps = {
  activateChar: Char | null
  activeBackgroundFullSrc: string
  messages: Message[]
  sessionId: string | null
  onDeleteMessage: (message: Message) => void
  deletingMessageId: string | null
  protectedMessageIds: Set<string>
  retryableMessageId: string | null
  onRetryMessage: (message: Message) => void
  onSendMessage: (message: string, images: ChatImageInput[]) => void
  onStop?: () => void
  isLoading: boolean
}

export default function ChatPanelView({
  activateChar,
  activeBackgroundFullSrc,
  messages,
  sessionId,
  onDeleteMessage,
  deletingMessageId,
  protectedMessageIds,
  retryableMessageId,
  onRetryMessage,
  onSendMessage,
  onStop,
  isLoading
}: ChatPanelViewProps): ReactElement {
  return (
    <div className="relative h-156 w-205">
      <div className="relative h-156 w-205">
        <img
          src={bgBase}
          className="absolute top-0 left-0 object-contain drop-shadow-[0_0_0_#ffffff]"
          draggable="false"
        />
        {!activeBackgroundFullSrc.includes('T_PhoneSystemPanelS.png') && (
          <img
            src={activeBackgroundFullSrc}
            className="absolute bottom-0 object-contain drop-shadow-[0_0_0_#ffffff]"
            draggable="false"
          />
        )}

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

      <span className="text-foreground/50 absolute top-12 left-12 z-20 text-xs font-semibold">
        {activateChar?.description}
      </span>

      <div className="absolute top-26 right-3 bottom-24 left-4">
        <MessageList
          messages={messages}
          sessionId={sessionId}
          activateChar={activateChar}
          onDeleteMessage={onDeleteMessage}
          deletingMessageId={deletingMessageId}
          protectedMessageIds={protectedMessageIds}
          retryableMessageId={retryableMessageId}
          onRetryMessage={onRetryMessage}
          isRetryDisabled={isLoading}
        />
      </div>

      <ChatComposer
        onSendMessage={onSendMessage}
        onStop={onStop}
        isLoading={isLoading}
        charId={activateChar?.id}
      />
    </div>
  )
}
