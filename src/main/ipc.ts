import { BrowserWindow, ipcMain } from 'electron'
import {
  abortRun,
  getMemoryService,
  getCharacterPrompt,
  getCharacters,
  getSessions,
  saveCharacterPrompt,
  sendMessage
} from './ai'
import { getProfiles, saveProfiles, testProfile } from './settings'
import type { ChatRunRequest, ModelProfile } from '../shared/ai'
import type { RendererLogEventPayload } from '../shared/logging'
import type { ProfilesStore } from '../shared/model-settings'
import type { MemorySettingsStore } from '../shared/memory-settings'
import { logger } from './logger'

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function summarizeValue(value: unknown): unknown {
  if (value == null) {
    return value
  }

  if (typeof value === 'string') {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return { type: 'array', length: value.length }
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
  }

  return typeof value
}

function getSenderContext(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
): { webContentsId: number } {
  return {
    webContentsId: event.sender.id
  }
}

function handleLogged<Args extends unknown[], Result>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: Args) => Promise<Result> | Result,
  describe?: (...args: Args) => Record<string, unknown>
): void {
  ipcMain.handle(channel, async (event, ...args: Args) => {
    const context = {
      channel,
      ...getSenderContext(event),
      ...(describe ? describe(...args) : {})
    }

    await logger.info('ipc', 'invoke-start', `IPC ${channel} started`, context)

    try {
      const result = await handler(event, ...args)
      void logger.info('ipc', 'invoke-success', `IPC ${channel} completed`, {
        ...context,
        result: summarizeValue(result)
      })
      return result
    } catch (error) {
      void logger.error('ipc', 'invoke-error', `IPC ${channel} failed`, {
        ...context,
        error: toErrorMessage(error)
      })
      throw error
    }
  })
}

export function registerIpc(): void {
  const memory = getMemoryService()

  ipcMain.on('window:minimize', (event) => {
    void logger.info('ipc', 'window-minimize', 'Renderer requested window minimize', {
      ...getSenderContext(event)
    })
    const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    window?.minimize()
  })

  handleLogged('ai:getCharacters', () => getCharacters())
  handleLogged('ai:getCharacterPrompt', (_event, characterId: string) => getCharacterPrompt(characterId), (characterId) => ({
    characterId
  }))
  handleLogged(
    'ai:saveCharacterPrompt',
    (_event, characterId: string, promptText: string) => saveCharacterPrompt(characterId, promptText),
    (characterId, promptText) => ({
      characterId,
      promptLength: promptText.length
    })
  )
  handleLogged('ai:getSessions', () => getSessions())
  handleLogged(
    'ai:sendMessage',
    (_event, request: ChatRunRequest) => sendMessage(request),
    (request) => ({
      requestId: request.requestId,
      sessionId: request.sessionId,
      characterId: request.characterId,
      profileId: request.profileId,
      messageLength: request.userMessage.length
    })
  )
  handleLogged('ai:abortRun', (_event, requestId: string) => abortRun(requestId), (requestId) => ({
    requestId
  }))
  handleLogged('settings:getProfiles', () => getProfiles())
  handleLogged(
    'settings:saveProfiles',
    (_event, store: ProfilesStore) => saveProfiles(store),
    (store) => ({
      profileCount: store.profiles.length,
      activeProfileId: store.activeProfileId
    })
  )
  handleLogged(
    'settings:testProfile',
    (_event, profile: ModelProfile) => testProfile(profile),
    (profile) => ({
      profileId: profile.id,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      model: profile.model
    })
  )
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
  handleLogged('memory:getStatus', (_event, characterId?: string | null) => memory.getStatus(characterId), (characterId) => ({
    characterId
  }))
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
  handleLogged('memory:cancelTask', (_event, taskId: string) => memory.cancelTask(taskId), (taskId) => ({
    taskId
  }))
  handleLogged('log:track', (_event, payload: RendererLogEventPayload) => logger.trackRendererEvent(payload), (payload) => ({
    event: payload.event
  }))
  handleLogged('log:getViewerState', () => logger.getViewerState())
  handleLogged('log:readEntries', () => logger.readEntries())
  handleLogged('log:openDirectory', () => logger.openDirectory())
}
