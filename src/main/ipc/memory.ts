import type { MemorySettingsStore, MemoryTargetSelection } from '@shared/memory-settings'
import { getMemoryService } from '@main/chat'
import { handleLogged } from './logged-handler'

export function registerMemoryIpc(): void {
  const memory = getMemoryService()

  handleLogged('memory:getSettings', () => memory.getSettings())
  handleLogged(
    'memory:saveSettings',
    (_event, store: MemorySettingsStore) => memory.saveSettings(store),
    (store) => ({
      retrievalMode: store.retrievalMode,
      loreSearchEnabled: store.loreSearchEnabled,
      memorySearchEnabled: store.memorySearchEnabled
    })
  )
  handleLogged(
    'memory:getStatus',
    (_event, selection?: MemoryTargetSelection | null) => memory.getStatus(selection),
    (selection) => ({
      characterId: selection?.characterId,
      sessionId: selection?.sessionId
    })
  )
  handleLogged('memory:listLocalModels', () => memory.listLocalModels())
  handleLogged(
    'memory:downloadLocalModel',
    (_event, modelId: string) => memory.downloadLocalModel(modelId),
    (modelId) => ({ modelId })
  )
  handleLogged(
    'memory:selectLocalModel',
    (_event, modelId: string) => memory.selectLocalModel(modelId),
    (modelId) => ({ modelId })
  )
  handleLogged(
    'memory:removeLocalModel',
    (_event, modelId: string) => memory.removeLocalModel(modelId),
    (modelId) => ({ modelId })
  )
  handleLogged('memory:testEmbeddingConnection', () => memory.testEmbeddingConnection())
  handleLogged(
    'memory:getEmbeddingCompatibility',
    (_event, selection?: MemoryTargetSelection | null) =>
      memory.getEmbeddingCompatibility(selection),
    (selection) => ({
      characterId: selection?.characterId,
      sessionId: selection?.sessionId
    })
  )
  handleLogged(
    'memory:getMemoryIndexStatus',
    (_event, selection?: MemoryTargetSelection | null) => memory.getMemoryIndexStatus(selection),
    (selection) => ({
      characterId: selection?.characterId,
      sessionId: selection?.sessionId
    })
  )
  handleLogged(
    'memory:startCharacterMemoryBuild',
    (_event, characterId: string) => memory.startCharacterMemoryBuild(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged('memory:startAllMemoryBuild', () => memory.startAllMemoryBuild())
  handleLogged(
    'memory:cancelTask',
    (_event, taskId: string) => memory.cancelTask(taskId),
    (taskId) => ({ taskId })
  )
}
