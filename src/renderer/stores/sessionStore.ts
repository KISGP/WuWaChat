import type { ChatRunEvent } from '@shared/chat'
import { create } from 'zustand'

type SessionStore = {
  sessions: Session[]
  currentSessionId: Session['id'] | null
  setSessions: (sessions: Session[]) => void
  setCurrentSessionId: (sessionId: Session['id'] | null) => void
  startNewSession: (charId: Char['id']) => void
  mergeRunEventSession: (event: ChatRunEvent) => void
}

function mergeSession(sessions: Session[], nextSession: Session): Session[] {
  const merged = [nextSession, ...sessions.filter((session) => session.id !== nextSession.id)]
  return merged.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  currentSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
  startNewSession: (charId) => {
    void charId
    set({ currentSessionId: null })
  },
  mergeRunEventSession: (event) => {
    if (event.type !== 'run-started' && event.type !== 'session-synced') {
      return
    }

    set((current) => ({
      sessions: mergeSession(current.sessions, event.session)
    }))
  }
}))

export const selectSessionById =
  (sessionId: Session['id'] | null) =>
  (state: SessionStore): Session | null => {
    if (!sessionId) return null
    return state.sessions.find((session) => session.id === sessionId) || null
  }
