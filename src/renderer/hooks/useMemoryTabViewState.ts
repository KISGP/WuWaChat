import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  MemorySettingsStore,
  MemoryTask,
  WorldKnowledgeRouteStatus,
  WorldIndexStatus
} from '@shared/memory-settings'
import {
  hasRunningMemoryBuildTask,
  hasRunningTask
} from '@renderer/components/settings/memory/helpers'

type UseMemoryTabViewStateArgs = {
  draft: MemorySettingsStore
  compatibility: EmbeddingCompatibilityStatus[]
  tasks: MemoryTask[]
  worldIndex: WorldIndexStatus | null
  storyStatus: WorldKnowledgeRouteStatus | null
  glossaryStatus: WorldKnowledgeRouteStatus | null
  memoryIndex: CharacterMemoryIndexStatus | null
}

type UseMemoryTabViewStateResult = {
  worldSearchInfoOpen: boolean
  setWorldSearchInfoOpen: Dispatch<SetStateAction<boolean>>
  memorySearchInfoOpen: boolean
  setMemorySearchInfoOpen: Dispatch<SetStateAction<boolean>>
  crossSessionMemoryInfoOpen: boolean
  setCrossSessionMemoryInfoOpen: Dispatch<SetStateAction<boolean>>
  worldCompatibility?: EmbeddingCompatibilityStatus
  memoryCompatibility?: EmbeddingCompatibilityStatus
  vectorModeSelected: boolean
  worldBundleBusy: boolean
  worldVectorBusy: boolean
  characterMemoryBusy: boolean
  activeWorldBundleTaskId: string | null
  activeWorldVectorTaskId: string | null
  activeCharacterMemoryTaskId: string | null
  activeAllMemoryTaskId: string | null
  storyNeedsBuild: boolean
  glossaryNeedsBuild: boolean
  worldRoutesNeedBuild: boolean
  memoryIndexNeedsBuild: boolean
  memoryIndexMissingWithEntries: boolean
  memoryIndexMissingWithoutEntries: boolean
  shouldSuggestMemoryBuild: boolean
  operationTips: string[]
}

export function useMemoryTabViewState({
  draft,
  compatibility,
  tasks,
  worldIndex,
  storyStatus,
  glossaryStatus,
  memoryIndex
}: UseMemoryTabViewStateArgs): UseMemoryTabViewStateResult {
  const [worldSearchInfoOpen, setWorldSearchInfoOpen] = useState(false)
  const [memorySearchInfoOpen, setMemorySearchInfoOpen] = useState(false)
  const [crossSessionMemoryInfoOpen, setCrossSessionMemoryInfoOpen] = useState(false)

  const worldCompatibility = compatibility.find((item) => item.scope === 'world')
  const memoryCompatibility = compatibility.find((item) => item.scope === 'character-memory')
  const vectorModeSelected = draft.retrievalMode !== 'string'
  const activeWorldBundleTaskId =
    tasks.find(
      (task) =>
        task.taskType === 'world-bundle-download' &&
        (task.status === 'queued' || task.status === 'running')
    )?.taskId || null
  const activeWorldVectorTaskId =
    tasks.find(
      (task) =>
        task.taskType === 'world-vector-build' &&
        (task.status === 'queued' || task.status === 'running')
    )?.taskId || null
  const activeCharacterMemoryTaskId =
    tasks.find(
      (task) =>
        task.taskType === 'character-memory-build' &&
        (task.status === 'queued' || task.status === 'running')
    )?.taskId || null
  const activeAllMemoryTaskId =
    tasks.find(
      (task) =>
        task.taskType === 'all-memory-build' &&
        (task.status === 'queued' || task.status === 'running')
    )?.taskId || null
  const worldBundleBusy = hasRunningTask(tasks, 'world-bundle-download')
  const worldVectorBusy = hasRunningTask(tasks, 'world-vector-build')
  const characterMemoryBusy = hasRunningMemoryBuildTask(tasks)

  const storyNeedsBuild =
    vectorModeSelected &&
    (!storyStatus ||
      storyStatus.indexAvailability === 'missing' ||
      storyStatus.indexAvailability === 'failed' ||
      storyStatus.indexAvailability === 'incompatible')
  const glossaryNeedsBuild =
    vectorModeSelected &&
    (!glossaryStatus ||
      glossaryStatus.indexAvailability === 'missing' ||
      glossaryStatus.indexAvailability === 'failed' ||
      glossaryStatus.indexAvailability === 'incompatible')
  const worldRoutesNeedBuild =
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

  const memoryIndexMissingWithEntries =
    vectorModeSelected && memoryIndex?.availability === 'missing' && memoryIndex.entryCount > 0
  const memoryIndexMissingWithoutEntries =
    vectorModeSelected && memoryIndex?.availability === 'missing' && memoryIndex.entryCount === 0
  const shouldSuggestMemoryBuild =
    vectorModeSelected &&
    (memoryIndex?.availability === 'incompatible' ||
      memoryIndex?.availability === 'failed' ||
      memoryIndexMissingWithEntries)

  const operationTips = useMemo(
    () =>
      [
        worldRoutesNeedBuild
          ? '当前故事或名词索引还不可直接用于向量检索，建议先更新知识包，再构建对应向量。'
          : null,
        memoryIndex?.availability === 'incompatible'
          ? '当前角色记忆索引与正在使用的 embedding 配置不一致，建议重建当前角色或全部角色记忆。'
          : null,
        memoryIndex?.availability === 'failed'
          ? '当前角色记忆索引上一次构建失败，建议检查 embedding 配置后重新构建。'
          : null,
        memoryIndexMissingWithEntries
          ? '当前已有角色记忆内容，但还没有构建向量索引，建议重建当前角色或全部角色记忆。'
          : null,
        memoryIndexMissingWithoutEntries
          ? '当前还没有角色记忆内容，先开始聊天产生记忆后，再构建向量索引即可。'
          : null,
        !vectorModeSelected
          ? '你当前使用的是字符串检索模式，下面这些构建操作不是必须，但提前构建后切到向量模式会更顺畅。'
          : null
      ].filter(Boolean) as string[],
    [
      memoryIndex?.availability,
      memoryIndexMissingWithEntries,
      memoryIndexMissingWithoutEntries,
      vectorModeSelected,
      worldRoutesNeedBuild
    ]
  )

  return {
    worldSearchInfoOpen,
    setWorldSearchInfoOpen,
    memorySearchInfoOpen,
    setMemorySearchInfoOpen,
    crossSessionMemoryInfoOpen,
    setCrossSessionMemoryInfoOpen,
    worldCompatibility,
    memoryCompatibility,
    vectorModeSelected,
    worldBundleBusy,
    worldVectorBusy,
    characterMemoryBusy,
    activeWorldBundleTaskId,
    activeWorldVectorTaskId,
    activeCharacterMemoryTaskId,
    activeAllMemoryTaskId,
    storyNeedsBuild,
    glossaryNeedsBuild,
    worldRoutesNeedBuild,
    memoryIndexNeedsBuild,
    memoryIndexMissingWithEntries,
    memoryIndexMissingWithoutEntries,
    shouldSuggestMemoryBuild,
    operationTips
  }
}
