import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  EmbeddingConnectionTestResult,
  LocalEmbeddingCatalogItem,
  MemoryHardwareInfo,
  MemorySettingsStore,
  MemoryStatusSnapshot,
  MemoryTargetSelection,
  MemoryTask,
  WorldKnowledgeRouteStatus,
  WorldIndexStatus
} from '@shared/memory-settings'
import { createDefaultMemorySettingsStore } from '@shared/memory-settings'
import { trackUiEvent } from '@renderer/logging'
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
  storyStatus: WorldKnowledgeRouteStatus | null
  glossaryStatus: WorldKnowledgeRouteStatus | null
  memoryIndex: CharacterMemoryIndexStatus | null
  compatibility: EmbeddingCompatibilityStatus[]
  embeddingTestResult: EmbeddingConnectionTestResult | null
  hardware: MemoryHardwareInfo
  localModels: LocalEmbeddingCatalogItem[]
  localModelUiState: Record<string, LocalModelUiState>
  tasks: MemoryTask[]
  setIsLoaded: (isLoaded: boolean) => void
  hydrateSettings: (settings: MemorySettingsStore) => void
  applySnapshot: (snapshot: MemoryStatusSnapshot) => void
  reconcileTask: (task: MemoryTask) => void
  refreshStatus: (selection?: MemoryTargetSelection | null) => Promise<void>
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
let activeMemorySelection: MemoryTargetSelection | null = null
let refreshTimeout: number | null = null

/**
 * @description 复制当前查看的 memory 目标选择，避免外部后续修改对象时污染调度中的刷新参数。
 * @param selection 当前选择的角色 / 会话目标。
 * @returns 可安全缓存的选择副本；若未传入则返回 `null`。
 */
function cloneMemoryTargetSelection(
  selection?: MemoryTargetSelection | null
): MemoryTargetSelection | null {
  if (!selection) {
    return null
  }

  return {
    characterId: selection.characterId ?? null,
    sessionId: selection.sessionId ?? null
  }
}

/**
 * @description 解析任务错误消息中的标题与原因，供本地模型下载状态展示使用。
 * @param message 主进程返回的原始任务错误消息。
 * @returns 拆分后的错误编码与详细原因。
 */
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

/**
 * @description 判断 memory 任务当前是否仍处于排队或执行中。
 * @param task 待检查的 memory 任务。
 * @returns 若任务仍活跃则返回 `true`。
 */
function isTaskActive(task: MemoryTask): boolean {
  return task.status === 'queued' || task.status === 'running'
}

/**
 * @description 将最新的任务快照合并进任务列表，并按更新时间倒序排序。
 * @param current 当前任务列表。
 * @param nextTask 最新任务快照。
 * @returns 合并后的任务列表。
 */
function reconcileMemoryTasks(current: MemoryTask[], nextTask: MemoryTask): MemoryTask[] {
  const next = [nextTask, ...current.filter((task) => task.taskId !== nextTask.taskId)]
  return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

/**
 * @description 将本地模型下载任务转换为界面需要的展示状态。
 * @param task 当前任务快照。
 * @returns 对应的本地模型 UI 状态；若任务无关则返回 `null`。
 */
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

/**
 * @description 读取当前 memory 页正在查看的目标选择，供异步刷新与任务回调复用。
 * @returns 当前激活的 memory 目标选择快照。
 */
function getActiveMemoryTargetSelection(): MemoryTargetSelection | null {
  return cloneMemoryTargetSelection(activeMemorySelection)
}

/**
 * @description 在指定延迟后刷新 memory 状态，并沿用最近一次显式选择的角色 / 会话目标。
 * @param delayMs 刷新延迟，单位毫秒。
 * @param selection 可选的显式目标；传入后会覆盖当前缓存的目标。
 */
export function scheduleMemoryStatusRefresh(
  delayMs: number,
  selection?: MemoryTargetSelection | null
): void {
  if (selection !== undefined) {
    activeMemorySelection = cloneMemoryTargetSelection(selection)
  }

  if (refreshTimeout != null) {
    window.clearTimeout(refreshTimeout)
  }

  refreshTimeout = window.setTimeout(() => {
    refreshTimeout = null
    void useMemoryStore
      .getState()
      .refreshStatus(getActiveMemoryTargetSelection())
      .catch((error) => {
        console.error('Failed to refresh memory status after task event', error)
      })
  }, delayMs)
}

/**
 * @description 清理已注册但尚未执行的 memory 状态延迟刷新任务。
 */
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
  storyStatus: null,
  glossaryStatus: null,
  memoryIndex: null,
  compatibility: [],
  embeddingTestResult: null,
  hardware: { gpuName: null },
  localModels: [],
  localModelUiState: {},
  tasks: [],
  setIsLoaded: (isLoaded) => set({ isLoaded }),
  hydrateSettings: (settings) => set({ settings }),
  applySnapshot: (snapshot) =>
    set({
      settings: snapshot.settings,
      worldIndex: snapshot.worldIndex,
      storyStatus: snapshot.storyStatus,
      glossaryStatus: snapshot.glossaryStatus,
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
  refreshStatus: async (selection) => {
    activeMemorySelection = cloneMemoryTargetSelection(selection)
    const requestId = refreshRequestId + 1
    refreshRequestId = requestId
    const [snapshot, nextCompatibility] = await Promise.all([
      window.memory.getStatus(activeMemorySelection),
      window.memory.getEmbeddingCompatibility(activeMemorySelection)
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
    await get().refreshStatus(getActiveMemoryTargetSelection())
    await get().refreshLocalModels()
  },
  downloadLocalModel: async (modelId) => {
    trackUiEvent(
      'memory-local-model-download',
      'User started downloading a local embedding model',
      {
        modelId
      }
    )
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
      await get().refreshStatus(getActiveMemoryTargetSelection())
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
    await get().refreshStatus(getActiveMemoryTargetSelection())
    await get().refreshLocalModels()
  },
  removeLocalModel: async (modelId) => {
    trackUiEvent('memory-local-model-remove', 'User removed a local embedding model', {
      modelId
    })
    await window.memory.removeLocalModel(modelId)
    get().clearLocalModelUiState(modelId)
    await get().refreshStatus(getActiveMemoryTargetSelection())
    await get().refreshLocalModels()
  },
  testEmbeddingConnection: async () => {
    trackUiEvent('memory-embedding-test', 'User started an embedding connection test', {
      retrievalMode: get().settings.retrievalMode
    })
    const result = await window.memory.testEmbeddingConnection()
    set({ embeddingTestResult: result })
    await get().refreshStatus(getActiveMemoryTargetSelection())
  },
  startWorldBundleDownload: async () => {
    trackUiEvent('memory-world-bundle-download', 'User started world bundle refresh')
    await window.memory.startWorldBundleDownload()
    await get().refreshStatus(getActiveMemoryTargetSelection())
  },
  startWorldVectorBuild: async () => {
    trackUiEvent('memory-world-build', 'User started world vector build')
    await window.memory.startWorldVectorBuild()
    await get().refreshStatus(getActiveMemoryTargetSelection())
  },
  startCharacterMemoryBuild: async (characterId) => {
    trackUiEvent('memory-character-build', 'User started character memory build', {
      characterId
    })
    await window.memory.startCharacterMemoryBuild(characterId)
    await get().refreshStatus(getActiveMemoryTargetSelection())
  },
  startAllMemoryBuild: async () => {
    trackUiEvent('memory-all-build', 'User started rebuilding all character memory')
    await window.memory.startAllMemoryBuild()
    await get().refreshStatus(getActiveMemoryTargetSelection())
  },
  cancelTask: async (taskId) => {
    trackUiEvent('memory-task-cancel', 'User cancelled a memory task', {
      taskId
    })
    await window.memory.cancelTask(taskId)
  }
}))

export { isTaskActive }
