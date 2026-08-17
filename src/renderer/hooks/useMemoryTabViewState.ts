import { useMemo } from 'react'
import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  MemorySettingsStore,
  MemoryTask
} from '@shared/memory-settings'
import { hasRunningMemoryBuildTask } from '@renderer/components/settings/memory/helpers'

type UseMemoryTabViewStateArgs = {
  draft: MemorySettingsStore
  compatibility: EmbeddingCompatibilityStatus[]
  tasks: MemoryTask[]
  memoryIndex: CharacterMemoryIndexStatus | null
}

type UseMemoryTabViewStateResult = {
  memoryCompatibility?: EmbeddingCompatibilityStatus
  vectorModeSelected: boolean
  characterMemoryBusy: boolean
  activeCharacterMemoryTaskId: string | null
  activeAllMemoryTaskId: string | null
  shouldSuggestMemoryBuild: boolean
  operationTips: string[]
}

/**
 * @description 汇总角色长期记忆设置页的派生状态和构建提示。
 * @param args 设置草稿、索引状态和后台任务。
 * @returns 页面需要的派生状态与提示文本。
 */
export function useMemoryTabViewState({
  draft,
  compatibility,
  tasks,
  memoryIndex
}: UseMemoryTabViewStateArgs): UseMemoryTabViewStateResult {
  const memoryCompatibility = compatibility.find((item) => item.scope === 'character-memory')
  const vectorModeSelected = draft.retrievalMode !== 'string'
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
  const characterMemoryBusy = hasRunningMemoryBuildTask(tasks)
  const missingWithEntries =
    vectorModeSelected && memoryIndex?.availability === 'missing' && memoryIndex.entryCount > 0
  const missingWithoutEntries =
    vectorModeSelected && memoryIndex?.availability === 'missing' && memoryIndex.entryCount === 0
  const shouldSuggestMemoryBuild =
    vectorModeSelected &&
    (memoryIndex?.availability === 'incompatible' ||
      memoryIndex?.availability === 'failed' ||
      missingWithEntries)

  const operationTips = useMemo(
    () =>
      [
        memoryIndex?.availability === 'incompatible'
          ? '当前角色记忆索引与正在使用的 embedding 配置不一致，建议重建当前角色或全部角色记忆。'
          : null,
        memoryIndex?.availability === 'failed'
          ? '当前角色记忆索引上一次构建失败，建议检查 embedding 配置后重新构建。'
          : null,
        missingWithEntries
          ? '当前已有角色记忆内容，但还没有构建向量索引，建议重建当前角色或全部角色记忆。'
          : null,
        missingWithoutEntries
          ? '当前还没有角色记忆内容，先开始聊天产生记忆后，再构建向量索引即可。'
          : null,
        !vectorModeSelected ? '你当前使用的是字符串检索模式，角色记忆会使用关键词匹配。' : null
      ].filter(Boolean) as string[],
    [memoryIndex?.availability, missingWithEntries, missingWithoutEntries, vectorModeSelected]
  )

  return {
    memoryCompatibility,
    vectorModeSelected,
    characterMemoryBusy,
    activeCharacterMemoryTaskId,
    activeAllMemoryTaskId,
    shouldSuggestMemoryBuild,
    operationTips
  }
}
