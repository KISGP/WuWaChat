import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { MemorySettingsStore } from '@shared/memory-settings'

const AUTOSAVE_DELAY_MS = 600

export type MemoryAutosaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * @description 将记忆设置序列化为可比较的稳定快照。
 * @param store 待序列化的记忆设置。
 * @returns 设置快照的 JSON 字符串。
 */
function stableSerialize(store: MemorySettingsStore): string {
  return JSON.stringify(store)
}

/**
 * @description 清除待执行的记忆设置自动保存定时器。
 * @param timerRef 保存定时器标识的引用。
 * @returns 无返回值。
 */
function clearAutosaveTimer(timerRef: MutableRefObject<number | null>): void {
  if (timerRef.current != null) {
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }
}

/**
 * @description 管理记忆设置草稿、脏状态和带防抖的自动保存流程。
 * @param settings 当前已持久化的记忆设置。
 * @param saveSettings 持久化设置的异步函数。
 * @returns 草稿数据、保存状态以及更新、刷新和重试方法。
 * @remarks 保存失败时会保留待保存状态，并将错误暴露给调用方重试。
 */
export function useMemorySettingsDraft(
  settings: MemorySettingsStore,
  saveSettings: (store: MemorySettingsStore) => Promise<void>
): {
  draft: MemorySettingsStore
  isDirty: boolean
  autosaveState: MemoryAutosaveState
  autosaveError: string | null
  hasPendingChanges: boolean
  updateDraft: (patch: Partial<MemorySettingsStore>) => void
  flushPendingChanges: () => Promise<void>
  retryAutosave: () => Promise<void>
} {
  const [draft, setDraft] = useState<MemorySettingsStore>(settings)
  const [isDirty, setIsDirty] = useState(false)
  const [autosaveState, setAutosaveState] = useState<MemoryAutosaveState>('idle')
  const [autosaveError, setAutosaveError] = useState<string | null>(null)
  const [hasPendingChanges, setHasPendingChanges] = useState(false)

  const draftRef = useRef(draft)
  const saveTimerRef = useRef<number | null>(null)
  const inFlightSaveRef = useRef<Promise<void> | null>(null)
  const flushPendingChangesRef = useRef<(() => Promise<void>) | null>(null)
  const isSavingRef = useRef(false)
  const shouldSaveAgainRef = useRef(false)
  const hasPendingChangesRef = useRef(false)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    if (!hasPendingChangesRef.current && !isSavingRef.current) {
      setDraft(settings)
      draftRef.current = settings
      setIsDirty(false)
      setHasPendingChanges(false)
    }
  }, [settings])

  useEffect(() => {
    return () => {
      clearAutosaveTimer(saveTimerRef)
    }
  }, [])

  /**
   * @description 安排一次延迟保存，并合并短时间内连续发生的草稿修改。
   * @returns 无返回值。
   */
  const scheduleAutosave = useCallback((): void => {
    clearAutosaveTimer(saveTimerRef)

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void flushPendingChangesRef.current?.()
    }, AUTOSAVE_DELAY_MS)
  }, [])

  /**
   * @description 应用草稿更新、标记未保存状态并触发自动保存调度。
   * @param updater 根据当前草稿生成下一份草稿的更新函数。
   * @returns 无返回值。
   */
  const applyDraftUpdate = useCallback(
    (updater: (current: MemorySettingsStore) => MemorySettingsStore): void => {
      setDraft((current) => {
        const next = updater(current)
        draftRef.current = next
        return next
      })
      setIsDirty(true)
      setAutosaveError(null)
      if (autosaveState !== 'saving') {
        setAutosaveState('idle')
      }
      setHasPendingChanges(true)
      hasPendingChangesRef.current = true
      if (isSavingRef.current) {
        shouldSaveAgainRef.current = true
      }
      scheduleAutosave()
    },
    [autosaveState, scheduleAutosave]
  )

  /**
   * @description 立即刷新待保存的草稿，并串行处理保存期间产生的新修改。
   * @returns 所有当前待保存变更处理完成后的 Promise。
   */
  const flushPendingChanges = useCallback(async (): Promise<void> => {
    clearAutosaveTimer(saveTimerRef)

    if (isSavingRef.current) {
      shouldSaveAgainRef.current = shouldSaveAgainRef.current || hasPendingChangesRef.current
      await inFlightSaveRef.current
      return
    }

    if (!hasPendingChangesRef.current) {
      return
    }

    /**
     * @description 执行草稿保存循环，确保保存期间的新修改不会被覆盖。
     * @returns 当前及保存期间新增的草稿修改处理完成后的 Promise。
     * @remarks 保存失败时保留脏状态和错误信息，等待调用方后续重试。
     */
    const runSaveLoop = async (): Promise<void> => {
      isSavingRef.current = true
      setAutosaveState('saving')
      setAutosaveError(null)

      while (hasPendingChangesRef.current) {
        const snapshot = draftRef.current
        const serializedSnapshot = stableSerialize(snapshot)

        hasPendingChangesRef.current = false
        shouldSaveAgainRef.current = false
        setHasPendingChanges(false)

        try {
          await saveSettings(snapshot)

          if (stableSerialize(draftRef.current) === serializedSnapshot) {
            setIsDirty(false)
          } else {
            hasPendingChangesRef.current = true
            setHasPendingChanges(true)
            setIsDirty(true)
          }

          if (shouldSaveAgainRef.current) {
            hasPendingChangesRef.current = true
            setHasPendingChanges(true)
            setIsDirty(true)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          hasPendingChangesRef.current = true
          setHasPendingChanges(true)
          setIsDirty(true)
          setAutosaveState('error')
          setAutosaveError(message)
          isSavingRef.current = false
          inFlightSaveRef.current = null
          return
        }
      }

      setAutosaveState('saved')
      setAutosaveError(null)
      isSavingRef.current = false
      inFlightSaveRef.current = null
    }

    const savePromise = runSaveLoop()
    inFlightSaveRef.current = savePromise
    await savePromise
  }, [saveSettings])

  useEffect(() => {
    flushPendingChangesRef.current = flushPendingChanges
  }, [flushPendingChanges])

  /**
   * @description 合并字段补丁并安排记忆设置自动保存。
   * @param patch 要合并到草稿中的字段。
   * @returns 无返回值。
   */
  const updateDraft = useCallback(
    (patch: Partial<MemorySettingsStore>): void => {
      applyDraftUpdate((current) => ({
        ...current,
        ...patch
      }))
    },
    [applyDraftUpdate]
  )

  /**
   * @description 清除自动保存错误并重试当前待保存的记忆设置。
   * @returns 重试保存完成后的 Promise。
   */
  const retryAutosave = useCallback(async (): Promise<void> => {
    setAutosaveError(null)
    setAutosaveState(hasPendingChangesRef.current ? 'idle' : autosaveState)
    await flushPendingChanges()
  }, [autosaveState, flushPendingChanges])

  return {
    draft,
    isDirty,
    autosaveState,
    autosaveError,
    hasPendingChanges,
    updateDraft,
    flushPendingChanges,
    retryAutosave
  }
}
