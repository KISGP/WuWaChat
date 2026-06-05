/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  EmbeddingConnectionTestResult,
  LocalEmbeddingCatalogItem,
  MemoryHardwareInfo,
  MemorySettingsStore,
  MemoryStatusSnapshot,
  MemoryTask,
  WorldIndexStatus
} from '../../shared/memory-settings'
import { createDefaultMemorySettingsStore } from '../../shared/memory-settings'
import { trackUiEvent } from '../logging'

type LocalModelUiPhase = 'idle' | 'downloading' | 'success' | 'error'

export type LocalModelUiState = {
  modelId: string
  phase: LocalModelUiPhase
  progress: number
  message: string
  errorCode?: string
  errorDetail?: string
}

interface MemoryContextType {
  settings: MemorySettingsStore
  isLoaded: boolean
  worldIndex: WorldIndexStatus | null
  memoryIndex: CharacterMemoryIndexStatus | null
  compatibility: EmbeddingCompatibilityStatus[]
  embeddingTestResult: EmbeddingConnectionTestResult | null
  hardware: MemoryHardwareInfo
  localModels: LocalEmbeddingCatalogItem[]
  localModelUiState: Record<string, LocalModelUiState>
  tasks: MemoryTask[]
  refreshStatus: (characterId?: string | null) => Promise<void>
  refreshLocalModels: () => Promise<void>
  saveSettings: (store: MemorySettingsStore) => Promise<void>
  downloadLocalModel: (modelId: string) => Promise<void>
  selectLocalModel: (modelId: string) => Promise<void>
  removeLocalModel: (modelId: string) => Promise<void>
  clearLocalModelUiState: (modelId: string) => void
  testEmbeddingConnection: () => Promise<void>
  startWorldBundleDownload: () => Promise<void>
  startWorldVectorBuild: () => Promise<void>
  startCharacterMemoryBuild: (characterId: string) => Promise<void>
  startAllMemoryBuild: () => Promise<void>
  cancelTask: (taskId: string) => Promise<void>
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined)

function parseTaskError(message: string): { errorCode?: string; errorDetail?: string } {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const titleLine = lines.find((line) => line.startsWith('标题：'))
  const reasonLine = lines.find((line) => line.startsWith('原因：'))

  return {
    errorCode: titleLine?.replace('标题：', '').trim(),
    errorDetail: reasonLine?.replace('原因：', '').trim() || message
  }
}

function isTaskActive(task: MemoryTask): boolean {
  return task.status === 'queued' || task.status === 'running'
}

function reconcileMemoryTasks(current: MemoryTask[], nextTask: MemoryTask): MemoryTask[] {
  const next = [nextTask, ...current.filter((task) => task.taskId !== nextTask.taskId)]
  return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function createLocalModelUiStateFromTask(task: MemoryTask): LocalModelUiState | null {
  if (task.taskType !== 'local-model-download' || !task.characterId) {
    return null
  }

  const modelId = task.characterId
  const base: LocalModelUiState = {
    modelId,
    phase: 'idle',
    progress: task.progress,
    message: task.message || ''
  }

  if (isTaskActive(task)) {
    return {
      ...base,
      phase: 'downloading'
    }
  }

  if (task.status === 'completed') {
    return {
      ...base,
      phase: 'success'
    }
  }

  if (task.status === 'failed') {
    const parsed = parseTaskError(task.message || '')
    return {
      ...base,
      phase: 'error',
      errorCode: parsed.errorCode,
      errorDetail: parsed.errorDetail
    }
  }

  return null
}

export function MemoryProvider({ children }: { children: ReactNode }): ReactElement {
  const [settings, setSettings] = useState<MemorySettingsStore>(createDefaultMemorySettingsStore())
  const [worldIndex, setWorldIndex] = useState<WorldIndexStatus | null>(null)
  const [memoryIndex, setMemoryIndex] = useState<CharacterMemoryIndexStatus | null>(null)
  const [compatibility, setCompatibility] = useState<EmbeddingCompatibilityStatus[]>([])
  const [embeddingTestResult, setEmbeddingTestResult] =
    useState<EmbeddingConnectionTestResult | null>(null)
  const [hardware, setHardware] = useState<MemoryHardwareInfo>({ gpuName: null })
  const [localModels, setLocalModels] = useState<LocalEmbeddingCatalogItem[]>([])
  const [localModelUiState, setLocalModelUiState] = useState<Record<string, LocalModelUiState>>({})
  const [tasks, setTasks] = useState<MemoryTask[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const refreshRequestIdRef = useRef(0)
  const activeCharacterIdRef = useRef<string | null>(null)
  const refreshTimeoutRef = useRef<number | null>(null)
  const activeMemoryCharacterId = memoryIndex?.characterId || null

  const applySnapshot = useCallback((snapshot: MemoryStatusSnapshot): void => {
    setSettings(snapshot.settings)
    setWorldIndex(snapshot.worldIndex)
    setMemoryIndex(snapshot.memoryIndex)
    setTasks(snapshot.tasks)
    setHardware(snapshot.hardware)
  }, [])

  const refreshStatus = useCallback(
    async (characterId?: string | null) => {
      activeCharacterIdRef.current = characterId ?? null
      const requestId = refreshRequestIdRef.current + 1
      refreshRequestIdRef.current = requestId
      const [snapshot, nextCompatibility] = await Promise.all([
        window.memory.getStatus(characterId),
        window.memory.getEmbeddingCompatibility(characterId)
      ])

      if (refreshRequestIdRef.current !== requestId) {
        return
      }

      applySnapshot(snapshot)
      setCompatibility(nextCompatibility)
    },
    [applySnapshot]
  )

  const scheduleStatusRefresh = useCallback(
    (delayMs: number, characterId?: string | null): void => {
      if (characterId !== undefined) {
        activeCharacterIdRef.current = characterId
      }

      if (refreshTimeoutRef.current != null) {
        window.clearTimeout(refreshTimeoutRef.current)
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null
        void refreshStatus(activeCharacterIdRef.current).catch((error) => {
          console.error('Failed to refresh memory status after task event', error)
        })
      }, delayMs)
    },
    [refreshStatus]
  )

  const refreshLocalModels = useCallback(async (): Promise<void> => {
    const models = await window.memory.listLocalModels()
    setLocalModels(models)
  }, [])

  const clearLocalModelUiState = useCallback((modelId: string): void => {
    setLocalModelUiState((current) => {
      const next = { ...current }
      delete next[modelId]
      return next
    })
  }, [])

  useEffect(() => {
    let isMounted = true
    const timeout = window.setTimeout(() => {
      Promise.all([refreshStatus(null), refreshLocalModels()])
        .catch((error) => {
          console.error('Failed to load memory status', error)
        })
        .finally(() => {
          if (isMounted) {
            setIsLoaded(true)
          }
        })
    }, 0)

    const unsubscribe = window.memory.onTaskEvent((event) => {
      setTasks((current) => reconcileMemoryTasks(current, event.task))

      const nextLocalModelUiState = createLocalModelUiStateFromTask(event.task)
      if (nextLocalModelUiState) {
        setLocalModelUiState((current) => ({
          ...current,
          [nextLocalModelUiState.modelId]: nextLocalModelUiState
        }))
      }

      if (isTaskActive(event.task)) {
        scheduleStatusRefresh(120)
      } else {
        scheduleStatusRefresh(0)
        if (event.task.taskType === 'local-model-download') {
          void refreshLocalModels().catch((error) => {
            console.error('Failed to refresh local embedding models', error)
          })
        }
      }
    })

    return () => {
      isMounted = false
      window.clearTimeout(timeout)
      if (refreshTimeoutRef.current != null) {
        window.clearTimeout(refreshTimeoutRef.current)
      }
      unsubscribe()
    }
  }, [refreshLocalModels, refreshStatus, scheduleStatusRefresh])

  const saveSettings = useCallback(
    async (store: MemorySettingsStore): Promise<void> => {
      trackUiEvent('memory-settings-save', 'User saved memory settings', {
        retrievalMode: store.retrievalMode,
        worldSearchEnabled: store.worldSearchEnabled,
        memorySearchEnabled: store.memorySearchEnabled
      })
      const saved = await window.memory.saveSettings(store)
      setSettings(saved)
      await refreshStatus(activeMemoryCharacterId)
      await refreshLocalModels()
    },
    [activeMemoryCharacterId, refreshLocalModels, refreshStatus]
  )

  const downloadLocalModel = useCallback(
    async (modelId: string): Promise<void> => {
      trackUiEvent(
        'memory-local-model-download',
        'User started downloading a local embedding model',
        {
          modelId
        }
      )
      setLocalModelUiState((current) => ({
        ...current,
        [modelId]: {
          modelId,
          phase: 'downloading',
          progress: 0,
          message: '准备下载模型...'
        }
      }))

      try {
        await window.memory.downloadLocalModel(modelId)
        await refreshStatus(activeMemoryCharacterId)
        await refreshLocalModels()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const parsed = parseTaskError(message)
        setLocalModelUiState((current) => ({
          ...current,
          [modelId]: {
            modelId,
            phase: 'error',
            progress: current[modelId]?.progress || 0,
            message,
            errorCode: parsed.errorCode,
            errorDetail: parsed.errorDetail
          }
        }))
        throw error
      }
    },
    [activeMemoryCharacterId, refreshLocalModels, refreshStatus]
  )

  const selectLocalModel = useCallback(
    async (modelId: string): Promise<void> => {
      trackUiEvent('memory-local-model-select', 'User selected a local embedding model', {
        modelId
      })
      const saved = await window.memory.selectLocalModel(modelId)
      setSettings(saved)
      await refreshStatus(activeMemoryCharacterId)
      await refreshLocalModels()
    },
    [activeMemoryCharacterId, refreshLocalModels, refreshStatus]
  )

  const removeLocalModel = useCallback(
    async (modelId: string): Promise<void> => {
      trackUiEvent('memory-local-model-remove', 'User removed a local embedding model', {
        modelId
      })
      await window.memory.removeLocalModel(modelId)
      clearLocalModelUiState(modelId)
      await refreshStatus(activeMemoryCharacterId)
      await refreshLocalModels()
    },
    [activeMemoryCharacterId, clearLocalModelUiState, refreshLocalModels, refreshStatus]
  )

  const testEmbeddingConnection = useCallback(async (): Promise<void> => {
    trackUiEvent('memory-embedding-test', 'User started an embedding connection test', {
      retrievalMode: settings.retrievalMode
    })
    const result = await window.memory.testEmbeddingConnection()
    setEmbeddingTestResult(result)
    await refreshStatus(activeMemoryCharacterId)
  }, [activeMemoryCharacterId, refreshStatus, settings.retrievalMode])

  const startWorldBundleDownload = useCallback(async (): Promise<void> => {
    trackUiEvent('memory-world-bundle-download', 'User started world bundle refresh')
    await window.memory.startWorldBundleDownload()
    await refreshStatus(activeMemoryCharacterId)
  }, [activeMemoryCharacterId, refreshStatus])

  const startWorldVectorBuild = useCallback(async (): Promise<void> => {
    trackUiEvent('memory-world-build', 'User started world vector build')
    await window.memory.startWorldVectorBuild()
    await refreshStatus(activeMemoryCharacterId)
  }, [activeMemoryCharacterId, refreshStatus])

  const startCharacterMemoryBuild = useCallback(
    async (characterId: string): Promise<void> => {
      trackUiEvent('memory-character-build', 'User started character memory build', {
        characterId
      })
      await window.memory.startCharacterMemoryBuild(characterId)
      await refreshStatus(characterId)
    },
    [refreshStatus]
  )

  const startAllMemoryBuild = useCallback(async (): Promise<void> => {
    trackUiEvent('memory-all-build', 'User started rebuilding all character memory')
    await window.memory.startAllMemoryBuild()
    await refreshStatus(activeMemoryCharacterId)
  }, [activeMemoryCharacterId, refreshStatus])

  const cancelTask = useCallback(async (taskId: string): Promise<void> => {
    trackUiEvent('memory-task-cancel', 'User cancelled a memory task', {
      taskId
    })
    await window.memory.cancelTask(taskId)
  }, [])

  const contextValue = useMemo<MemoryContextType>(
    () => ({
      settings,
      isLoaded,
      worldIndex,
      memoryIndex,
      compatibility,
      embeddingTestResult,
      hardware,
      localModels,
      localModelUiState,
      tasks,
      refreshStatus,
      refreshLocalModels,
      saveSettings,
      downloadLocalModel,
      selectLocalModel,
      removeLocalModel,
      clearLocalModelUiState,
      testEmbeddingConnection,
      startWorldBundleDownload,
      startWorldVectorBuild,
      startCharacterMemoryBuild,
      startAllMemoryBuild,
      cancelTask
    }),
    [
      cancelTask,
      clearLocalModelUiState,
      compatibility,
      downloadLocalModel,
      embeddingTestResult,
      hardware,
      isLoaded,
      localModelUiState,
      localModels,
      memoryIndex,
      refreshLocalModels,
      refreshStatus,
      removeLocalModel,
      saveSettings,
      selectLocalModel,
      settings,
      startAllMemoryBuild,
      startCharacterMemoryBuild,
      startWorldBundleDownload,
      startWorldVectorBuild,
      tasks,
      testEmbeddingConnection,
      worldIndex
    ]
  )

  return <MemoryContext.Provider value={contextValue}>{children}</MemoryContext.Provider>
}

export function useMemory(): MemoryContextType {
  const context = useContext(MemoryContext)
  if (!context) {
    throw new Error('useMemory must be used within a MemoryProvider')
  }

  return context
}
