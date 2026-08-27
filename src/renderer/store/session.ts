import type { ChatRunEvent } from '@shared/chat'
import { create } from 'zustand'

type SessionStore = {
  sessions: Session[]
  currentSessionId: Session['id'] | null
  setSessions: (sessions: Session[]) => void
  upsertSession: (session: Session) => void
  setCurrentSessionId: (sessionId: Session['id'] | null) => void
  startNewSession: (charId: Char['id']) => void
  mergeRunEventSession: (event: ChatRunEvent) => void
}

/**
 * @description 将新的会话快照合并到现有列表，并按更新时间倒序排列。
 * @param sessions 当前会话列表。
 * @param nextSession 待合并的会话快照。
 * @returns 合并并排序后的会话列表。
 */
function mergeSession(sessions: Session[], nextSession: Session): Session[] {
  const merged = [nextSession, ...sessions.filter((session) => session.id !== nextSession.id)]
  return merged.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  currentSessionId: null,
  /**
   * @description 替换当前会话快照列表。
   * @param sessions 要写入 Store 的完整会话快照列表。
   * @returns 无返回值。
   */
  setSessions: (sessions) => set({ sessions }),
  /**
   * @description 将单个会话合并进列表，并按更新时间保持会话顺序。
   * @param session 需要写入或更新的会话快照。
   * @returns 无返回值。
   */
  upsertSession: (session) =>
    set((current) => ({
      sessions: mergeSession(current.sessions, session)
    })),
  /**
   * @description 设置当前显示的会话标识。
   * @param sessionId 要选中的会话标识；传入 null 时取消选择。
   * @returns 无返回值。
   */
  setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
  /**
   * @description 清除当前会话选择并开始新的会话流程。
   * @param charId 发起新会话的角色标识。
   * @returns 无返回值。
   * @remarks 当前角色标识由调用链保留，Store 仅负责清除会话选择。
   */
  startNewSession: (charId) => {
    void charId
    set({ currentSessionId: null })
  },
  /**
   * @description 根据聊天运行事件同步会话快照。
   * @param event 主进程发送的聊天运行事件。
   * @returns 无返回值。
   * @remarks 仅处理包含完整会话快照的 run-started 与 session-synced 事件。
   */
  mergeRunEventSession: (event) => {
    if (event.type !== 'run-started' && event.type !== 'session-synced') {
      return
    }

    set((current) => ({
      sessions: mergeSession(current.sessions, event.session)
    }))
  }
}))

/**
 * @description 创建按会话标识查找会话的 Zustand 选择器。
 * @param sessionId 待查找的会话标识，可为空。
 * @returns 接收 Store 状态并返回匹配会话的选择器。
 */
export const selectSessionById =
  (sessionId: Session['id'] | null) =>
  (state: SessionStore): Session | null => {
    if (!sessionId) return null
    return state.sessions.find((session) => session.id === sessionId) || null
  }
