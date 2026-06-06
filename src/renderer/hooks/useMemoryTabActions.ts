import { useCallback, useState } from 'react'
import type {
  CloudEmbeddingSettings,
  MemorySettingsStore,
  MemoryTask
} from '@shared/memory-settings'
import {
  getDefaultCloudBaseUrl,
  getDefaultCloudModel
} from '@renderer/components/settings/memory/helpers'

type MemoryTabActionDependencies = {
  draft: MemorySettingsStore
  updateCloudEmbedding: (patch: Partial<CloudEmbeddingSettings>) => void
  updateDraft: (patch: Partial<MemorySettingsStore>) => void
  flushPendingChanges: () => Promise<void>
  activeCharacterId: string | null
  clearLocalModelUiState: (modelId: string) => void
  downloadLocalModel: (modelId: string) => Promise<void>
  selectLocalModel: (modelId: string) => Promise<void>
  removeLocalModel: (modelId: string) => Promise<void>
  testEmbeddingConnection: () => Promise<void>
  startWorldVectorBuild: () => Promise<void>
  startCharacterMemoryBuild: (characterId: string) => Promise<void>
  startAllMemoryBuild: () => Promise<void>
}

type BuildLaunchNotice = {
  type: 'error'
  title: string
  message: string
} | null

function createCloudProviderPatch(
  draft: MemorySettingsStore,
  provider: CloudEmbeddingSettings['provider']
): Partial<CloudEmbeddingSettings> {
  const previousProvider = draft.cloudEmbedding.provider
  const previousModel = draft.cloudEmbedding.model.trim()
  const providerApiKeys = draft.cloudEmbedding.providerApiKeys || {}
  const nextModel =
    !previousModel || previousModel === getDefaultCloudModel(previousProvider)
      ? getDefaultCloudModel(provider)
      : previousModel
  const nextApiKey = providerApiKeys[provider] || ''
  const nextProviderApiKeys = {
    ...providerApiKeys,
    [previousProvider]: draft.cloudEmbedding.apiKey,
    [provider]: nextApiKey
  }

  if (provider === 'huggingface-inference') {
    return {
      provider,
      baseUrl: '',
      apiKey: nextApiKey,
      inferenceProvider: draft.cloudEmbedding.inferenceProvider || 'hf-inference',
      model: nextModel,
      providerApiKeys: nextProviderApiKeys,
      dimensions: draft.cloudEmbedding.dimensions
    }
  }

  return {
    provider,
    apiKey: nextApiKey,
    baseUrl:
      draft.cloudEmbedding.baseUrl.trim() && previousProvider === provider
        ? draft.cloudEmbedding.baseUrl
        : getDefaultCloudBaseUrl(provider),
    model: nextModel,
    providerApiKeys: nextProviderApiKeys,
    dimensions: draft.cloudEmbedding.dimensions
  }
}

export function useMemoryTabActions({
  draft,
  updateCloudEmbedding,
  updateDraft,
  flushPendingChanges,
  activeCharacterId,
  clearLocalModelUiState,
  downloadLocalModel,
  selectLocalModel,
  removeLocalModel,
  testEmbeddingConnection,
  startWorldVectorBuild,
  startCharacterMemoryBuild,
  startAllMemoryBuild
}: MemoryTabActionDependencies): {
  isTestingEmbedding: boolean
  pendingBuildTaskType: MemoryTask['taskType'] | null
  buildLaunchNotice: BuildLaunchNotice
  clearBuildLaunchNotice: () => void
  handleTestEmbedding: () => Promise<void>
  handleStartWorldVectorBuild: () => Promise<void>
  handleStartCharacterMemoryBuild: () => Promise<void>
  handleStartAllMemoryBuild: () => Promise<void>
  handleCloudProviderChange: (provider: CloudEmbeddingSettings['provider']) => void
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

  const handleStartWorldVectorBuild = useCallback(async (): Promise<void> => {
    await withBuildPreparation(
      'world-vector-build',
      () => startWorldVectorBuild(),
      '构建世界知识向量失败'
    )
  }, [startWorldVectorBuild, withBuildPreparation])

  const handleStartCharacterMemoryBuild = useCallback(async (): Promise<void> => {
    if (!activeCharacterId) {
      setBuildLaunchNotice({
        type: 'error',
        title: '未选择角色',
        message: '请先选择一个角色，再执行当前角色记忆重建。'
      })
      return
    }

    await withBuildPreparation(
      'character-memory-build',
      () => startCharacterMemoryBuild(activeCharacterId),
      '重建当前角色记忆失败'
    )
  }, [activeCharacterId, startCharacterMemoryBuild, withBuildPreparation])

  const handleStartAllMemoryBuild = useCallback(async (): Promise<void> => {
    await withBuildPreparation(
      'all-memory-build',
      () => startAllMemoryBuild(),
      '重建全部角色记忆失败'
    )
  }, [startAllMemoryBuild, withBuildPreparation])

  const handleCloudProviderChange = useCallback(
    (provider: CloudEmbeddingSettings['provider']): void => {
      updateCloudEmbedding(createCloudProviderPatch(draft, provider))
    },
    [draft, updateCloudEmbedding]
  )

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

  return {
    isTestingEmbedding,
    pendingBuildTaskType,
    buildLaunchNotice,
    clearBuildLaunchNotice,
    handleTestEmbedding,
    handleStartWorldVectorBuild,
    handleStartCharacterMemoryBuild,
    handleStartAllMemoryBuild,
    handleCloudProviderChange,
    handleDownloadLocalModel,
    handleSelectLocalModel,
    handleRemoveLocalModel
  }
}
