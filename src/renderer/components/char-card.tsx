import { useState, type ReactElement } from 'react'
import BG1 from '@renderer/assets/1.png'
import BG2 from '@renderer/assets/2.png'
import BG4 from '@renderer/assets/4.png'
import { cn } from '@renderer/utils'
import { trackUiEvent } from '@renderer/logging'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useSessionStore } from '@renderer/stores/sessionStore'
import ConversationItem from './conversation-item'
import { useShallow } from 'zustand/react/shallow'

function getConversationPreview(session: Session): string {
  const lastMessage = [...session.messages]
    .reverse()
    .find((message) => message.role === 'assistant' || message.role === 'user')

  return lastMessage?.content || '新的对话已开始'
}

export default function CharCard({ char }: { char: Char }): ReactElement {
  const { activateChar, setActivateChar } = useCharacterStore(
    useShallow((state) => ({
      activateChar: state.activateChar,
      setActivateChar: state.setActivateChar
    }))
  )
  const { currentSessionId, setCurrentSessionId, startNewSession } = useSessionStore(
    useShallow((state) => ({
      currentSessionId: state.currentSessionId,
      setCurrentSessionId: state.setCurrentSessionId,
      startNewSession: state.startNewSession
    }))
  )
  const sessions = useSessionStore(
    useShallow((state) => state.sessions.filter((session) => session.characterId === char.id))
  )
  const isActive = activateChar?.id === char.id
  const [isHovering, setIsHovering] = useState(false)

  const currentBg = isActive ? BG4 : isHovering ? BG2 : BG1

  return (
    <div className="flex flex-col gap-2 transition-all duration-300">
      <div
        className={cn(
          'h-fit w-full cursor-pointer rounded-sm border-2 border-transparent p-0.5 transition-all duration-200',
          !isActive ? 'hover:scale-101 hover:border-white' : 'border-transparent'
        )}
        onClick={() => {
          trackUiEvent('character-selected', 'User selected a character card', {
            characterId: char.id,
            nextSessionId: sessions[0]?.id || null
          })
          setActivateChar(char)
          setCurrentSessionId(sessions[0]?.id || null)
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="relative z-10 h-fit w-full cursor-pointer">
          <img src={currentBg} className="object-contain" draggable="false" />

          <img
            src={char.avatar}
            className="pointer-events-none absolute top-2 left-4 size-15"
            draggable="false"
          />

          <span
            className={cn(
              'pointer-events-none absolute top-3.5 left-26 text-lg font-semibold',
              isActive ? 'text-black' : isHovering ? 'text-black/60' : 'text-white'
            )}
          >
            {char.name}
          </span>
        </div>
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          isActive ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className={cn(!isActive && 'hidden')}>
          <div className="flex flex-col gap-2 px-1">
            {sessions.map((session) => (
              <ConversationItem
                key={session.id}
                content={getConversationPreview(session)}
                isActive={session.id === currentSessionId}
                onClick={() => {
                  trackUiEvent('session-selected', 'User switched conversation session', {
                    characterId: char.id,
                    sessionId: session.id
                  })
                  setCurrentSessionId(session.id)
                }}
              />
            ))}
            <ConversationItem
              isNew
              onClick={() => {
                trackUiEvent('session-new', 'User started a new conversation session', {
                  characterId: char.id
                })
                setActivateChar(char)
                startNewSession(char.id)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
