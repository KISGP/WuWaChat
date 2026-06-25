import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ChatRunEvent, ChatRunRequest, ModelProfile } from '@shared/chat'
import type { RendererLogEventPayload } from '@shared/logging'
import type {
  MemoryDebugRetrieveRequest,
  MemorySettingsStore,
  MemoryTaskEvent
} from '@shared/memory-settings'
import type { ProfilesStore } from '@shared/model-settings'

const ENABLE_MEMORY_DEBUG_TOOLS = import.meta.env.DEV

const api = {
  minimize: () => ipcRenderer.send('window:minimize')
}

const ai = {
  getCharacters: () => ipcRenderer.invoke('chat:getCharacters'),
  getCharacterPrompt: (characterId: string) =>
    ipcRenderer.invoke('chat:getCharacterPrompt', characterId),
  saveCharacterPrompt: (characterId: string, promptText: string) =>
    ipcRenderer.invoke('chat:saveCharacterPrompt', characterId, promptText),
  getSessions: () => ipcRenderer.invoke('chat:getSessions'),
  sendMessage: (request: ChatRunRequest) => ipcRenderer.invoke('chat:sendMessage', request),
  abortRun: (requestId: string) => ipcRenderer.invoke('chat:abortRun', requestId),
  onRunEvent: (listener: (event: ChatRunEvent) => void) => {
    const wrappedListener = (_event: IpcRendererEvent, payload: ChatRunEvent): void => {
      listener(payload)
    }

    ipcRenderer.on('chat:run:event', wrappedListener)
    return () => {
      ipcRenderer.removeListener('chat:run:event', wrappedListener)
    }
  }
}

const characters = {
  getCharacterCatalog: () => ipcRenderer.invoke('character:getCatalog'),
  refreshRemoteCharacters: () => ipcRenderer.invoke('character:refreshRemote'),
  getRemoteCharacterPrompt: (characterId: string) =>
    ipcRenderer.invoke('character:getRemotePrompt', characterId),
  downloadCharacter: (characterId: string) => ipcRenderer.invoke('character:download', characterId),
  resetPresetCharacter: (characterId: string) =>
    ipcRenderer.invoke('character:resetPreset', characterId)
}

const settings = {
  getProfiles: () => ipcRenderer.invoke('settings:getProfiles'),
  saveProfiles: (data: ProfilesStore) => ipcRenderer.invoke('settings:saveProfiles', data),
  testProfile: (profile: ModelProfile) => ipcRenderer.invoke('settings:testProfile', profile)
}

const memory = {
  getSettings: () => ipcRenderer.invoke('memory:getSettings'),
  saveSettings: (data: MemorySettingsStore) => ipcRenderer.invoke('memory:saveSettings', data),
  getStatus: (characterId?: string | null) => ipcRenderer.invoke('memory:getStatus', characterId),
  listLocalModels: () => ipcRenderer.invoke('memory:listLocalModels'),
  downloadLocalModel: (modelId: string) => ipcRenderer.invoke('memory:downloadLocalModel', modelId),
  selectLocalModel: (modelId: string) => ipcRenderer.invoke('memory:selectLocalModel', modelId),
  removeLocalModel: (modelId: string) => ipcRenderer.invoke('memory:removeLocalModel', modelId),
  testEmbeddingConnection: () => ipcRenderer.invoke('memory:testEmbeddingConnection'),
  getEmbeddingCompatibility: (characterId?: string | null) =>
    ipcRenderer.invoke('memory:getEmbeddingCompatibility', characterId),
  getWorldIndexStatus: () => ipcRenderer.invoke('memory:getWorldIndexStatus'),
  getMemoryIndexStatus: (characterId?: string | null) =>
    ipcRenderer.invoke('memory:getMemoryIndexStatus', characterId),
  startWorldBundleDownload: () => ipcRenderer.invoke('memory:startWorldBundleDownload'),
  startWorldVectorBuild: () => ipcRenderer.invoke('memory:startWorldVectorBuild'),
  startCharacterMemoryBuild: (characterId: string) =>
    ipcRenderer.invoke('memory:startCharacterMemoryBuild', characterId),
  startAllMemoryBuild: () => ipcRenderer.invoke('memory:startAllMemoryBuild'),
  cancelTask: (taskId: string) => ipcRenderer.invoke('memory:cancelTask', taskId),
  ...(ENABLE_MEMORY_DEBUG_TOOLS
    ? {
        debugRetrieve: (request: MemoryDebugRetrieveRequest) =>
          ipcRenderer.invoke('memory:debugRetrieve', request)
      }
    : {}),
  onTaskEvent: (listener: (event: MemoryTaskEvent) => void) => {
    const wrappedListener = (_event: IpcRendererEvent, payload: MemoryTaskEvent): void => {
      listener(payload)
    }

    ipcRenderer.on('memory:task:event', wrappedListener)
    return () => {
      ipcRenderer.removeListener('memory:task:event', wrappedListener)
    }
  }
}

const logs = {
  track: (payload: RendererLogEventPayload) => ipcRenderer.invoke('log:track', payload),
  getViewerState: () => ipcRenderer.invoke('log:getViewerState'),
  readLogs: () => ipcRenderer.invoke('log:readLogs'),
  openDirectory: () => ipcRenderer.invoke('log:openDirectory'),
  clearLogs: () => ipcRenderer.invoke('log:clearLogs')
}

const exposedApis = {
  electron: electronAPI,
  api,
  ai,
  characters,
  settings,
  memory,
  logs
}

if (process.contextIsolated) {
  try {
    Object.entries(exposedApis).forEach(([name, value]) => {
      contextBridge.exposeInMainWorld(name, value)
    })
  } catch (error) {
    console.error(error)
  }
} else {
  Object.assign(window, exposedApis)
}
