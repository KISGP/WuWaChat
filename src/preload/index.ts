import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ChatDeleteMessageRequest,
  ChatPromptPreviewRequest,
  ChatRunEvent,
  ChatRunRequest
} from '@shared/chat'
import { CHAT_RUN_EVENT_CHANNEL } from '@shared/chat-events'
import type { RendererLogEventPayload } from '@shared/logging'
import type { MemorySettingsStore } from '@shared/memory-settings'
import type { AgentSettingsStore } from '@shared/agent-settings'
import type { OpenAIProfileConnectionTestRequest, ProfilesStore } from '@shared/model-settings'
import type { AppSettings } from '@shared/app-settings'
import type { AppearanceSettings, UnifiedSettings } from '@shared/settings'
import type { StorageUsageSnapshot } from '@shared/storage'
import type { GachaUrlRequest } from '@shared/tools'
import type { TtsSynthesisRequest } from '@shared/tts'
import type { LoreStatus } from '@shared/lore'

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
  deleteMessage: (request: ChatDeleteMessageRequest) =>
    ipcRenderer.invoke('chat:deleteMessage', request),
  sendMessage: (request: ChatRunRequest) => ipcRenderer.invoke('chat:sendMessage', request),
  abortRun: (requestId: string) => ipcRenderer.invoke('chat:abortRun', requestId),
  previewModelInput: (request: ChatPromptPreviewRequest) =>
    ipcRenderer.invoke('chat:previewModelInput', request),
  onRunEvent: (listener: (event: ChatRunEvent) => void) => {
    const wrappedListener = (_event: IpcRendererEvent, payload: ChatRunEvent): void => {
      listener(payload)
    }

    ipcRenderer.on(CHAT_RUN_EVENT_CHANNEL, wrappedListener)
    return () => {
      ipcRenderer.removeListener(CHAT_RUN_EVENT_CHANNEL, wrappedListener)
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
  getUnifiedSettings: (): Promise<UnifiedSettings> =>
    ipcRenderer.invoke('settings:getUnifiedSettings'),
  getAppSettings: () => ipcRenderer.invoke('settings:getAppSettings'),
  saveAppSettings: (data: AppSettings) => ipcRenderer.invoke('settings:saveAppSettings', data),
  getProfiles: () => ipcRenderer.invoke('settings:getProfiles'),
  saveProfiles: (data: ProfilesStore) => ipcRenderer.invoke('settings:saveProfiles', data),
  saveAgent: (data: AgentSettingsStore) => ipcRenderer.invoke('settings:saveAgent', data),
  saveAppearance: (data: AppearanceSettings) => ipcRenderer.invoke('settings:saveAppearance', data),
  testProfile: (request: OpenAIProfileConnectionTestRequest) =>
    ipcRenderer.invoke('settings:testProfile', request),
  cancelProfileTest: (requestId: string) =>
    ipcRenderer.invoke('settings:cancelProfileTest', requestId)
}

const memory = {
  getSettings: () => ipcRenderer.invoke('memory:getSettings'),
  saveSettings: (data: MemorySettingsStore) => ipcRenderer.invoke('memory:saveSettings', data)
}

const lore = {
  getStatus: (): Promise<LoreStatus> => ipcRenderer.invoke('lore:getStatus'),
  updateSource: (): Promise<LoreStatus> => ipcRenderer.invoke('lore:updateSource'),
  rebuild: (): Promise<LoreStatus> => ipcRenderer.invoke('lore:rebuild')
}

const logs = {
  track: (payload: RendererLogEventPayload) => ipcRenderer.invoke('log:track', payload),
  getViewerState: () => ipcRenderer.invoke('log:getViewerState'),
  readLogs: () => ipcRenderer.invoke('log:readLogs'),
  openDirectory: () => ipcRenderer.invoke('log:openDirectory'),
  clearLogs: () => ipcRenderer.invoke('log:clearLogs')
}

const storage = {
  getUsage: (): Promise<StorageUsageSnapshot> => ipcRenderer.invoke('storage:getUsage')
}

const tools = {
  getGachaUrl: (request?: GachaUrlRequest) => ipcRenderer.invoke('tools:getGachaUrl', request)
}

const tts = {
  /** @description 请求主进程使用固定本地音色生成消息语音。 */
  synthesize: (request: TtsSynthesisRequest) => ipcRenderer.invoke('tts:synthesize', request),
  /** @description 请求主进程停止指定的正在生成语音。 */
  cancel: (requestId: string) => ipcRenderer.invoke('tts:cancel', requestId)
}

const exposedApis = {
  electron: electronAPI,
  api,
  ai,
  characters,
  settings,
  memory,
  lore,
  logs,
  storage,
  tools,
  tts
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
