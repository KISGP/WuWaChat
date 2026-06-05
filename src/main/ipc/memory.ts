import { is } from '@electron-toolkit/utils'
import type { MemoryDebugRetrieveRequest, MemorySettingsStore } from '../../shared/memory-settings'
import { getMemoryService } from '../ai'
import { handleLogged } from './logged-handler'

export function registerMemoryIpc(): void {
  const memory = getMemoryService()

  handleLogged('memory:getSettings', () => memory.getSettings())
  handleLogged(
    'memory:saveSettings',
    (_event, store: MemorySettingsStore) => memory.saveSettings(store),
    (store) => ({
      retrievalMode: store.retrievalMode,
      worldSearchEnabled: store.worldSearchEnabled,
      memorySearchEnabled: store.memorySearchEnabled
    })
  )
  handleLogged(
    'memory:getStatus',
    (_event, characterId?: string | null) => memory.getStatus(characterId),
    (characterId) => ({ characterId })
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
    (_event, characterId?: string | null) => memory.getEmbeddingCompatibility(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged('memory:getWorldIndexStatus', () => memory.getWorldIndexStatus())
  handleLogged(
    'memory:getMemoryIndexStatus',
    (_event, characterId?: string | null) => memory.getMemoryIndexStatus(characterId),
    (characterId) => ({ characterId })
  )
  handleLogged('memory:startWorldBundleDownload', () => memory.startWorldBundleDownload())
  handleLogged('memory:startWorldVectorBuild', () => memory.startWorldVectorBuild())
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
  if (is.dev) {
    handleLogged(
      'memory:debugRetrieve',
      (_event, request: MemoryDebugRetrieveRequest) => memory.debugRetrieve(request),
      (request) => ({
        scope: request.scope,
        characterId: request.characterId,
        sessionId: request.sessionId,
        queryLength: request.query.length
      })
    )
  }
}
