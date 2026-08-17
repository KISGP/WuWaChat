import { useCallback, useState } from 'react'
import type { MemorySettingsStore, MemoryTask } from '@shared/memory-settings'

type MemoryTabActionDependencies = {
  draft: MemorySettingsStore
  updateDraft: (patch: Partial<MemorySettingsStore>) => void
  flushPendingChanges: () => Promise<void>
  selectedCharacterId: string | null
  clearLocalModelUiState: (modelId: string) => void
  downloadLocalModel: (modelId: string) => Promise<void>
  selectLocalModel: (modelId: string) => Promise<void>
  removeLocalModel: (modelId: string) => Promise<void>
  testEmbeddingConnection: () => Promise<void>
  startCharacterMemoryBuild: (characterId: string) => Promise<void>
  startAllMemoryBuild: () => Promise<void>
  cancelTask: (taskId: string) => Promise<void>
}

type BuildLaunchNotice = {
  type: 'error'
  title: string
  message: string
} | null

/**
 * @description 封装 Memory 页的异步动作与构建前置处理，统一管理临时状态和失败提示。
 * @param dependencies Memory 页动作依赖。
 * @returns 供界面直接绑定的状态与事件处理函数。
 */
export function useMemoryTabActions({
  draft,
  updateDraft,
  flushPendingChanges,
  selectedCharacterId,
  clearLocalModelUiState,
  downloadLocalModel,
  selectLocalModel,
  removeLocalModel,
  testEmbeddingConnection,
  startCharacterMemoryBuild,
  startAllMemoryBuild,
  cancelTask
}: MemoryTabActionDependencies): {
  isTestingEmbedding: boolean
  pendingBuildTaskType: MemoryTask['taskType'] | null
  buildLaunchNotice: BuildLaunchNotice
  clearBuildLaunchNotice: () => void
  handleTestEmbedding: () => Promise<void>
  handleStartCharacterMemoryBuild: () => Promise<void>
  handleStartAllMemoryBuild: () => Promise<void>
  handleCancelTask: (taskId: string) => Promise<void>
  handleDownloadLocalModel: (modelId: string) => Promise<void>
  handleSelectLocalModel: (modelId: string) => Promise<void>
  handleRemoveLocalModel: (modelId: string) => Promise<void>
} {
  const [isTestingEmbedding, setIsTestingEmbedding] = useState(false)
  const [pendingBuildTaskType, setPendingBuildTaskType] = useState<MemoryTask['taskType'] | null>(
    null
  )
  const [buildLaunchNotice, setBuildLaunchNotice] = useState<BuildLaunchNotice>(null)

  const clearBuildLaunchNotice = useCallback((): void => {
    setBuildLaunchNotice(null)
  }, [])

  const withBuildPreparation = useCallback(
    async (
      taskType: MemoryTask['taskType'],
      runner: () => Promise<void>,
      title: string
    ): Promise<void> => {
      setPendingBuildTaskType(taskType)
      setBuildLaunchNotice(null)

      try {
        await flushPendingChanges()
        await runner()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setBuildLaunchNotice({
          type: 'error',
          title,
          message
        })
      } finally {
        setPendingBuildTaskType((current) => (current === taskType ? null : current))
      }
    },
    [flushPendingChanges]
  )

  const handleTestEmbedding = useCallback(async (): Promise<void> => {
    setIsTestingEmbedding(true)
    try {
      await flushPendingChanges()
      await testEmbeddingConnection()
    } finally {
      setIsTestingEmbedding(false)
    }
  }, [flushPendingChanges, testEmbeddingConnection])

  const handleStartCharacterMemoryBuild = useCallback(async (): Promise<void> => {
    if (!selectedCharacterId) {
      setBuildLaunchNotice({
        type: 'error',
        title: '未选择角色',
        message: '请先选择一个角色，再执行当前角色记忆重建。'
      })
      return
    }

    await withBuildPreparation(
      'character-memory-build',
      () => startCharacterMemoryBuild(selectedCharacterId),
      '重建当前角色记忆失败'
    )
  }, [selectedCharacterId, startCharacterMemoryBuild, withBuildPreparation])

  const handleStartAllMemoryBuild = useCallback(async (): Promise<void> => {
    await withBuildPreparation(
      'all-memory-build',
      () => startAllMemoryBuild(),
      '重建全部角色记忆失败'
    )
  }, [startAllMemoryBuild, withBuildPreparation])

  const handleDownloadLocalModel = useCallback(
    async (modelId: string): Promise<void> => {
      clearLocalModelUiState(modelId)
      await downloadLocalModel(modelId)
      if (draft.localEmbedding.model === modelId || !draft.localEmbedding.modelPath) {
        updateDraft({
          localEmbedding: {
            ...draft.localEmbedding,
            model: modelId
          }
        })
      }
    },
    [clearLocalModelUiState, downloadLocalModel, draft.localEmbedding, updateDraft]
  )

  const handleSelectLocalModel = useCallback(
    async (modelId: string): Promise<void> => {
      await selectLocalModel(modelId)
    },
    [selectLocalModel]
  )

  const handleRemoveLocalModel = useCallback(
    async (modelId: string): Promise<void> => {
      await removeLocalModel(modelId)
    },
    [removeLocalModel]
  )

  const handleCancelTask = useCallback(
    async (taskId: string): Promise<void> => {
      await cancelTask(taskId)
    },
    [cancelTask]
  )

  return {
    isTestingEmbedding,
    pendingBuildTaskType,
    buildLaunchNotice,
    clearBuildLaunchNotice,
    handleTestEmbedding,
    handleStartCharacterMemoryBuild,
    handleStartAllMemoryBuild,
    handleCancelTask,
    handleDownloadLocalModel,
    handleSelectLocalModel,
    handleRemoveLocalModel
  }
}
