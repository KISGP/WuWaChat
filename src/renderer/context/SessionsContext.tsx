/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import type { ChatRunEvent } from '../../shared/ai'

interface SessionContextType {
  sessions: Session[]
  currentSessionId: Session['id'] | null
  setCurrentSessionId: (sessionId: Session['id'] | null) => void
  startNewSession: (charId: Char['id']) => void
  getSession: (sessionId: Session['id'] | null) => Session | null
  getSessionsForCharacter: (charId: Char['id']) => Session[]
}

const SessionContext = createContext<SessionContextType | undefined>(undefined)

function mergeSession(sessions: Session[], nextSession: Session): Session[] {
  const merged = [nextSession, ...sessions.filter((session) => session.id !== nextSession.id)]
  return merged.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export function SessionProvider({ children }: { children: ReactNode }): ReactElement {
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<Session['id'] | null>(null)

  useEffect(() => {
    let isMounted = true

    window.ai
      ?.getSessions?.()
      .then((snapshot) => {
        if (isMounted) {
          setSessions(snapshot)
        }
      })
      .catch((error) => {
        console.error('Failed to load session snapshot', error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.ai?.onRunEvent?.((event: ChatRunEvent) => {
      if (event.type === 'run-started' || event.type === 'session-synced') {
        setSessions((current) => mergeSession(current, event.session))
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const startNewSession = useCallback((charId: Char['id']) => {
    void charId
    setCurrentSessionId(null)
  }, [])

  const getSession = useCallback(
    (sessionId: Session['id'] | null): Session | null => {
      if (!sessionId) return null
      return sessions.find((session) => session.id === sessionId) || null
    },
    [sessions]
  )

  const getSessionsForCharacter = useCallback(
    (charId: Char['id']): Session[] => sessions.filter((session) => session.characterId === charId),
    [sessions]
  )

  const contextValue = useMemo<SessionContextType>(
    () => ({
      sessions,
      currentSessionId,
      setCurrentSessionId,
      startNewSession,
      getSession,
      getSessionsForCharacter
    }),
    [currentSessionId, getSession, getSessionsForCharacter, sessions, startNewSession]
  )

  return <SessionContext.Provider value={contextValue}>{children}</SessionContext.Provider>
}

export function useSessions(): SessionContextType {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSessions must be used within a SessionProvider')
  }

  return context
}

export type { SessionContextType }
