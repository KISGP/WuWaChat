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
import { create } from 'zustand'

type LocalModelUiPhase = 'idle' | 'downloading' | 'success' | 'error'

export type LocalModelUiState = {
  modelId: string
  phase: LocalModelUiPhase
  progress: number
  message: string
  errorCode?: string
  errorDetail?: string
}

type MemoryStore = {
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
  setIsLoaded: (isLoaded: boolean) => void
  applySnapshot: (snapshot: MemoryStatusSnapshot) => void
  reconcileTask: (task: MemoryTask) => void
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

let refreshRequestId = 0
let activeCharacterId: string | null = null
let refreshTimeout: number | null = null

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

function getActiveMemoryCharacterId(): string | null {
  return useMemoryStore.getState().memoryIndex?.characterId || null
}

export function scheduleMemoryStatusRefresh(delayMs: number, characterId?: string | null): void {
  if (characterId !== undefined) {
    activeCharacterId = characterId
  }

  if (refreshTimeout != null) {
    window.clearTimeout(refreshTimeout)
  }

  refreshTimeout = window.setTimeout(() => {
    refreshTimeout = null
    void useMemoryStore
      .getState()
      .refreshStatus(activeCharacterId)
      .catch((error) => {
        console.error('Failed to refresh memory status after task event', error)
      })
  }, delayMs)
}

export function clearScheduledMemoryStatusRefresh(): void {
  if (refreshTimeout != null) {
    window.clearTimeout(refreshTimeout)
    refreshTimeout = null
  }
}

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  settings: createDefaultMemorySettingsStore(),
  isLoaded: false,
  worldIndex: null,
  memoryIndex: null,
  compatibility: [],
  embeddingTestResult: null,
  hardware: { gpuName: null },
  localModels: [],
  localModelUiState: {},
  tasks: [],
  setIsLoaded: (isLoaded) => set({ isLoaded }),
  applySnapshot: (snapshot) =>
    set({
      settings: snapshot.settings,
      worldIndex: snapshot.worldIndex,
      memoryIndex: snapshot.memoryIndex,
      tasks: snapshot.tasks,
      hardware: snapshot.hardware
    }),
  reconcileTask: (task) => {
    const nextLocalModelUiState = createLocalModelUiStateFromTask(task)

    set((current) => ({
      tasks: reconcileMemoryTasks(current.tasks, task),
      localModelUiState: nextLocalModelUiState
        ? {
            ...current.localModelUiState,
            [nextLocalModelUiState.modelId]: nextLocalModelUiState
          }
        : current.localModelUiState
    }))
  },
  refreshStatus: async (characterId) => {
    activeCharacterId = characterId ?? null
    const requestId = refreshRequestId + 1
    refreshRequestId = requestId
    const [snapshot, nextCompatibility] = await Promise.all([
      window.memory.getStatus(characterId),
      window.memory.getEmbeddingCompatibility(characterId)
    ])

    if (refreshRequestId !== requestId) {
      return
    }

    get().applySnapshot(snapshot)
    set({ compatibility: nextCompatibility })
  },
  refreshLocalModels: async () => {
    const models = await window.memory.listLocalModels()
    set({ localModels: models })
  },
  clearLocalModelUiState: (modelId) => {
    set((current) => {
      const next = { ...current.localModelUiState }
      delete next[modelId]
      return { localModelUiState: next }
    })
  },
  saveSettings: async (store) => {
    trackUiEvent('memory-settings-save', 'User saved memory settings', {
      retrievalMode: store.retrievalMode,
      worldSearchEnabled: store.worldSearchEnabled,
      memorySearchEnabled: store.memorySearchEnabled
    })
    const saved = await window.memory.saveSettings(store)
    set({ settings: saved })
    await get().refreshStatus(getActiveMemoryCharacterId())
    await get().refreshLocalModels()
  },
  downloadLocalModel: async (modelId) => {
    trackUiEvent('memory-local-model-download', 'User started downloading a local embedding model', {
      modelId
    })
    set((current) => ({
      localModelUiState: {
        ...current.localModelUiState,
        [modelId]: {
          modelId,
          phase: 'downloading',
          progress: 0,
          message: '准备下载模型...'
        }
      }
    }))

    try {
      await window.memory.downloadLocalModel(modelId)
      await get().refreshStatus(getActiveMemoryCharacterId())
      await get().refreshLocalModels()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const parsed = parseTaskError(message)
      set((current) => ({
        localModelUiState: {
          ...current.localModelUiState,
          [modelId]: {
            modelId,
            phase: 'error',
            progress: current.localModelUiState[modelId]?.progress || 0,
            message,
            errorCode: parsed.errorCode,
            errorDetail: parsed.errorDetail
          }
        }
      }))
      throw error
    }
  },
  selectLocalModel: async (modelId) => {
    trackUiEvent('memory-local-model-select', 'User selected a local embedding model', {
      modelId
    })
    const saved = await window.memory.selectLocalModel(modelId)
    set({ settings: saved })
    await get().refreshStatus(getActiveMemoryCharacterId())
    await get().refreshLocalModels()
  },
  removeLocalModel: async (modelId) => {
    trackUiEvent('memory-local-model-remove', 'User removed a local embedding model', {
      modelId
    })
    await window.memory.removeLocalModel(modelId)
    get().clearLocalModelUiState(modelId)
    await get().refreshStatus(getActiveMemoryCharacterId())
    await get().refreshLocalModels()
  },
  testEmbeddingConnection: async () => {
    trackUiEvent('memory-embedding-test', 'User started an embedding connection test', {
      retrievalMode: get().settings.retrievalMode
    })
    const result = await window.memory.testEmbeddingConnection()
    set({ embeddingTestResult: result })
    await get().refreshStatus(getActiveMemoryCharacterId())
  },
  startWorldBundleDownload: async () => {
    trackUiEvent('memory-world-bundle-download', 'User started world bundle refresh')
    await window.memory.startWorldBundleDownload()
    await get().refreshStatus(getActiveMemoryCharacterId())
  },
  startWorldVectorBuild: async () => {
    trackUiEvent('memory-world-build', 'User started world vector build')
    await window.memory.startWorldVectorBuild()
    await get().refreshStatus(getActiveMemoryCharacterId())
  },
  startCharacterMemoryBuild: async (characterId) => {
    trackUiEvent('memory-character-build', 'User started character memory build', {
      characterId
    })
    await window.memory.startCharacterMemoryBuild(characterId)
    await get().refreshStatus(characterId)
  },
  startAllMemoryBuild: async () => {
    trackUiEvent('memory-all-build', 'User started rebuilding all character memory')
    await window.memory.startAllMemoryBuild()
    await get().refreshStatus(getActiveMemoryCharacterId())
  },
  cancelTask: async (taskId) => {
    trackUiEvent('memory-task-cancel', 'User cancelled a memory task', {
      taskId
    })
    await window.memory.cancelTask(taskId)
  }
}))

export { isTaskActive }

