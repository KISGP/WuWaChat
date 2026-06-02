import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  MemorySettingsStore,
  MemoryTask,
  WorldIndexStatus
} from '../../shared/memory-settings'
import { CLOUD_PROVIDER_OPTIONS } from '../components/settings/memory/constants'
import {
  hasRunningMemoryBuildTask,
  hasRunningTask
} from '../components/settings/memory/helpers'

type UseMemoryTabViewStateArgs = {
  draft: MemorySettingsStore
  compatibility: EmbeddingCompatibilityStatus[]
  tasks: MemoryTask[]
  worldIndex: WorldIndexStatus | null
  memoryIndex: CharacterMemoryIndexStatus | null
}

type UseMemoryTabViewStateResult = {
  providerListOpen: boolean
  setProviderListOpen: Dispatch<SetStateAction<boolean>>
  worldSearchInfoOpen: boolean
  setWorldSearchInfoOpen: Dispatch<SetStateAction<boolean>>
  memorySearchInfoOpen: boolean
  setMemorySearchInfoOpen: Dispatch<SetStateAction<boolean>>
  crossSessionMemoryInfoOpen: boolean
  setCrossSessionMemoryInfoOpen: Dispatch<SetStateAction<boolean>>
  worldCompatibility?: EmbeddingCompatibilityStatus
  memoryCompatibility?: EmbeddingCompatibilityStatus
  selectedProvider: (typeof CLOUD_PROVIDER_OPTIONS)[number]
  isHuggingFace: boolean
  isVolcengineArk: boolean
  vectorModeSelected: boolean
  worldBundleBusy: boolean
  worldVectorBusy: boolean
  characterMemoryBusy: boolean
  worldIndexNeedsBuild: boolean
  memoryIndexNeedsBuild: boolean
  operationTips: string[]
}

export function useMemoryTabViewState({
  draft,
  compatibility,
  tasks,
  worldIndex,
  memoryIndex
}: UseMemoryTabViewStateArgs): UseMemoryTabViewStateResult {
  const [providerListOpen, setProviderListOpen] = useState(false)
  const [worldSearchInfoOpen, setWorldSearchInfoOpen] = useState(false)
  const [memorySearchInfoOpen, setMemorySearchInfoOpen] = useState(false)
  const [crossSessionMemoryInfoOpen, setCrossSessionMemoryInfoOpen] = useState(false)

  const worldCompatibility = compatibility.find((item) => item.scope === 'world')
  const memoryCompatibility = compatibility.find((item) => item.scope === 'character-memory')
  const selectedProvider =
    CLOUD_PROVIDER_OPTIONS.find((item) => item.value === draft.cloudEmbedding.provider) ||
    CLOUD_PROVIDER_OPTIONS[0]
  const isHuggingFace = draft.cloudEmbedding.provider === 'huggingface-inference'
  const isVolcengineArk = draft.cloudEmbedding.provider === 'volcengine-ark'
  const vectorModeSelected = draft.retrievalMode !== 'string'
  const worldBundleBusy = hasRunningTask(tasks, 'world-bundle-download')
  const worldVectorBusy = hasRunningTask(tasks, 'world-vector-build')
  const characterMemoryBusy = hasRunningMemoryBuildTask(tasks)

  const worldIndexNeedsBuild =
    vectorModeSelected &&
    (!worldIndex ||
      worldIndex.availability === 'missing' ||
      worldIndex.availability === 'failed' ||
      worldIndex.availability === 'incompatible')
  const memoryIndexNeedsBuild =
    vectorModeSelected &&
    (!memoryIndex ||
      memoryIndex.availability === 'missing' ||
      memoryIndex.availability === 'failed' ||
      memoryIndex.availability === 'incompatible')

  const operationTips = useMemo(
    () =>
      [
        worldIndexNeedsBuild ? '当前世界知识索引还不可直接用于向量检索，建议先更新知识包，再构建世界知识向量。' : null,
        memoryIndexNeedsBuild ? '当前角色记忆索引还不可直接用于向量检索，建议重建当前角色或全部角色记忆。' : null,
        !vectorModeSelected
          ? '你当前使用的是字符串检索模式，下面这些构建操作不是必须，但提前构建后切到向量模式会更顺畅。'
          : null
      ].filter(Boolean) as string[],
    [memoryIndexNeedsBuild, vectorModeSelected, worldIndexNeedsBuild]
  )

  return {
    providerListOpen,
    setProviderListOpen,
    worldSearchInfoOpen,
    setWorldSearchInfoOpen,
    memorySearchInfoOpen,
    setMemorySearchInfoOpen,
    crossSessionMemoryInfoOpen,
    setCrossSessionMemoryInfoOpen,
    worldCompatibility,
    memoryCompatibility,
    selectedProvider,
    isHuggingFace,
    isVolcengineArk,
    vectorModeSelected,
    worldBundleBusy,
    worldVectorBusy,
    characterMemoryBusy,
    worldIndexNeedsBuild,
    memoryIndexNeedsBuild,
    operationTips
  }
}
