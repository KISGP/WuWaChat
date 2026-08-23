import type { ChatDiagnosticRunEvent, ChatDiagnosticRunRequest } from '@shared/chat'
import { create } from 'zustand'

export type PromptDiagnosticStatus = 'idle' | 'running' | 'completed' | 'aborted' | 'error'

export type PromptDiagnosticSnapshot = {
  request: ChatDiagnosticRunRequest
  status: PromptDiagnosticStatus
  events: ChatDiagnosticRunEvent[]
  startedAt: number
  updatedAt: number
}

type PromptDiagnosticStore = {
  snapshot: PromptDiagnosticSnapshot | null
  startRun: (request: Omit<ChatDiagnosticRunRequest, 'requestId'>) => Promise<void>
  abortRun: () => Promise<void>
  clear: () => void
}

let unsubscribeDiagnosticEvents: (() => void) | null = null

/**
 * @description 创建用于关联主进程诊断事件的唯一请求标识。
 * @returns 当前应用运行期间唯一的诊断请求标识。
 */
function createDiagnosticRequestId(): string {
  return `diagnostic-${crypto.randomUUID()}`
}

/**
 * @description 将主进程事件归并到当前诊断快照，并同步其运行状态。
 * @param snapshot 当前诊断快照。
 * @param event 新收到的诊断事件。
 * @returns 更新后的诊断快照。
 */
function appendDiagnosticEvent(
  snapshot: PromptDiagnosticSnapshot,
  event: ChatDiagnosticRunEvent
): PromptDiagnosticSnapshot {
  const status: PromptDiagnosticStatus =
    event.type === 'completed'
      ? 'completed'
      : event.type === 'aborted'
        ? 'aborted'
        : event.type === 'error'
          ? 'error'
          : 'running'

  return {
    ...snapshot,
    status,
    events: [...snapshot.events, event],
    updatedAt: Date.now()
  }
}

/**
 * @description 订阅一次诊断事件通道，使应用级快照跨 Tab 生命周期持续更新。
 */
function ensureDiagnosticEventSubscription(): void {
  if (unsubscribeDiagnosticEvents) {
    return
  }

  unsubscribeDiagnosticEvents = window.ai.onDiagnosticRunEvent((event) => {
    const snapshot = usePromptDiagnosticStore.getState().snapshot
    if (!snapshot || snapshot.request.requestId !== event.requestId) {
      return
    }

    usePromptDiagnosticStore.setState({ snapshot: appendDiagnosticEvent(snapshot, event) })
  })
}

export const usePromptDiagnosticStore = create<PromptDiagnosticStore>((set, get) => ({
  snapshot: null,
  /**
   * @description 创建新的诊断快照并请求主进程开始隔离的 Agent 运行。
   * @param request 不含请求标识的诊断运行参数。
   * @remarks 新运行会替换已有结果；结果仅存于 renderer 内存。
   */
  startRun: async (request): Promise<void> => {
    ensureDiagnosticEventSubscription()
    const fullRequest = { ...request, requestId: createDiagnosticRequestId() }
    const startedAt = Date.now()
    set({
      snapshot: {
        request: fullRequest,
        status: 'running',
        events: [],
        startedAt,
        updatedAt: startedAt
      }
    })

    try {
      await window.ai.startDiagnosticRun(fullRequest)
    } catch (cause) {
      const snapshot = get().snapshot
      if (!snapshot || snapshot.request.requestId !== fullRequest.requestId) {
        return
      }

      set({
        snapshot: appendDiagnosticEvent(snapshot, {
          type: 'error',
          requestId: fullRequest.requestId,
          error: cause instanceof Error ? cause.message : String(cause)
        })
      })
    }
  },
  /**
   * @description 中断当前仍在运行的诊断请求。
   * @remarks 中断失败时保留现有快照，等待主进程终态事件更新界面。
   */
  abortRun: async (): Promise<void> => {
    const snapshot = get().snapshot
    if (!snapshot || snapshot.status !== 'running') {
      return
    }

    try {
      await window.ai.abortDiagnosticRun(snapshot.request.requestId)
    } catch (cause) {
      console.error('Failed to abort diagnostic run:', cause)
      set({
        snapshot: appendDiagnosticEvent(snapshot, {
          type: 'error',
          requestId: snapshot.request.requestId,
          error: cause instanceof Error ? cause.message : String(cause)
        })
      })
    }
  },
  /**
   * @description 清除当前应用内存中的诊断运行快照。
   */
  clear: (): void => set({ snapshot: null })
}))
