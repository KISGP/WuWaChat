import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { CloudEmbeddingSettings, MemorySettingsStore } from '@shared/memory-settings'

const AUTOSAVE_DELAY_MS = 600

export type MemoryAutosaveState = 'idle' | 'saving' | 'saved' | 'error'

function syncProviderApiKey(
  current: MemorySettingsStore,
  provider: CloudEmbeddingSettings['provider'],
  apiKey: string
): CloudEmbeddingSettings {
  return {
    ...current.cloudEmbedding,
    apiKey,
    providerApiKeys: {
      ...(current.cloudEmbedding.providerApiKeys || {}),
      [provider]: apiKey
    }
  }
}

function stableSerialize(store: MemorySettingsStore): string {
  return JSON.stringify(store)
}

function clearAutosaveTimer(timerRef: MutableRefObject<number | null>): void {
  if (timerRef.current != null) {
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }
}

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
  updateCloudEmbedding: (patch: Partial<CloudEmbeddingSettings>) => void
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

  const scheduleAutosave = useCallback((): void => {
    clearAutosaveTimer(saveTimerRef)

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void flushPendingChangesRef.current?.()
    }, AUTOSAVE_DELAY_MS)
  }, [])

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

  const updateDraft = useCallback(
    (patch: Partial<MemorySettingsStore>): void => {
      applyDraftUpdate((current) => ({
        ...current,
        ...patch
      }))
    },
    [applyDraftUpdate]
  )

  const updateCloudEmbedding = useCallback(
    (patch: Partial<CloudEmbeddingSettings>): void => {
      applyDraftUpdate((current) => ({
        ...current,
        cloudEmbedding:
          patch.apiKey != null
            ? {
                ...syncProviderApiKey(current, current.cloudEmbedding.provider, patch.apiKey),
                ...patch,
                providerApiKeys: {
                  ...(current.cloudEmbedding.providerApiKeys || {}),
                  [current.cloudEmbedding.provider]: patch.apiKey
                }
              }
            : {
                ...current.cloudEmbedding,
                ...patch
              }
      }))
    },
    [applyDraftUpdate]
  )

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
    updateCloudEmbedding,
    flushPendingChanges,
    retryAutosave
  }
}
