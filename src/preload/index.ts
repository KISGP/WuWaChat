import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ChatDiagnosticRunEvent,
  ChatDiagnosticRunRequest,
  ChatImageReadRequest,
  ChatDeleteMessageRequest,
  ChatRunEvent,
  ChatRunRequest,
  CharacterRegistry
} from '@shared/chat'
import { CHAT_DIAGNOSTIC_EVENT_CHANNEL, CHAT_RUN_EVENT_CHANNEL } from '@shared/chat-events'
import { CHARACTER_REGISTRY_CHANGED_CHANNEL } from '@shared/character-events'
import type { RendererLogEventPayload } from '@shared/logging'
import type { MemorySettingsStore } from '@shared/memory-settings'
import type { AgentSettingsStore, MoeGirlpediaConnectionTestRequest } from '@shared/agent-settings'
import type { OpenAIProfileConnectionTestRequest, ProfilesStore } from '@shared/model-settings'
import type { AppSettings } from '@shared/app-settings'
import type { AppearanceSettings, UnifiedSettings } from '@shared/settings'
import type { StorageUsageSnapshot } from '@shared/storage'
import type { WorldSyncProgress, WorldSyncResult, WorldSyncStatus } from '@shared/world'
import { WORLD_SYNC_PROGRESS_CHANNEL } from '@shared/world-events'
import type { GachaUrlRequest } from '@shared/tools'
import type { TtsSynthesisRequest } from '@shared/tts'

const api = {
  minimize: () => ipcRenderer.send('window:minimize')
}

const ai = {
  getCharacterPrompt: (characterId: string) =>
    ipcRenderer.invoke('chat:getCharacterPrompt', characterId),
  saveCharacterPrompt: (characterId: string, promptText: string) =>
    ipcRenderer.invoke('chat:saveCharacterPrompt', characterId, promptText),
  getSessions: () => ipcRenderer.invoke('chat:getSessions'),
  deleteMessage: (request: ChatDeleteMessageRequest) =>
    ipcRenderer.invoke('chat:deleteMessage', request),
  sendMessage: (request: ChatRunRequest) => ipcRenderer.invoke('chat:sendMessage', request),
  readImageResource: (request: ChatImageReadRequest) =>
    ipcRenderer.invoke('chat:readImageResource', request),
  abortRun: (requestId: string) => ipcRenderer.invoke('chat:abortRun', requestId),
  startDiagnosticRun: (request: ChatDiagnosticRunRequest) =>
    ipcRenderer.invoke('chat:startDiagnosticRun', request),
  abortDiagnosticRun: (requestId: string) =>
    ipcRenderer.invoke('chat:abortDiagnosticRun', requestId),
  onRunEvent: (listener: (event: ChatRunEvent) => void) => {
    const wrappedListener = (_event: IpcRendererEvent, payload: ChatRunEvent): void => {
      listener(payload)
    }

    ipcRenderer.on(CHAT_RUN_EVENT_CHANNEL, wrappedListener)
    return () => {
      ipcRenderer.removeListener(CHAT_RUN_EVENT_CHANNEL, wrappedListener)
    }
  },
  onDiagnosticRunEvent: (listener: (event: ChatDiagnosticRunEvent) => void) => {
    const wrappedListener = (_event: IpcRendererEvent, payload: ChatDiagnosticRunEvent): void => {
      listener(payload)
    }

    ipcRenderer.on(CHAT_DIAGNOSTIC_EVENT_CHANNEL, wrappedListener)
    return () => {
      ipcRenderer.removeListener(CHAT_DIAGNOSTIC_EVENT_CHANNEL, wrappedListener)
    }
  }
}

const characters = {
  getCharacterRegistry: (): Promise<CharacterRegistry> =>
    ipcRenderer.invoke('character:getRegistry'),
  /** @description 订阅主进程发布的角色注册表变更，并返回取消订阅函数。 */
  onRegistryChanged: (listener: (registry: CharacterRegistry) => void) => {
    const wrappedListener = (_event: IpcRendererEvent, registry: CharacterRegistry): void => {
      listener(registry)
    }
    ipcRenderer.on(CHARACTER_REGISTRY_CHANGED_CHANNEL, wrappedListener)
    return () => {
      ipcRenderer.removeListener(CHARACTER_REGISTRY_CHANGED_CHANNEL, wrappedListener)
    }
  },
  getPendingRemoteCharacterPrompt: (characterId: string) =>
    ipcRenderer.invoke('character:getPendingRemotePrompt', characterId),
  retryCharacterSync: (characterId: string) =>
    ipcRenderer.invoke('character:retrySync', characterId),
  applyPendingRemoteCharacterPrompt: (characterId: string) =>
    ipcRenderer.invoke('character:applyPendingPrompt', characterId)
}

const settings = {
  getUnifiedSettings: (): Promise<UnifiedSettings> =>
    ipcRenderer.invoke('settings:getUnifiedSettings'),
  getAppSettings: () => ipcRenderer.invoke('settings:getAppSettings'),
  saveAppSettings: (data: AppSettings) => ipcRenderer.invoke('settings:saveAppSettings', data),
  getProfiles: () => ipcRenderer.invoke('settings:getProfiles'),
  saveProfiles: (data: ProfilesStore) => ipcRenderer.invoke('settings:saveProfiles', data),
  saveAgent: (data: AgentSettingsStore) => ipcRenderer.invoke('settings:saveAgent', data),
  testMoeGirlpedia: (request: MoeGirlpediaConnectionTestRequest) =>
    ipcRenderer.invoke('settings:testMoeGirlpedia', request),
  cancelMoeGirlpediaTest: (requestId: string) =>
    ipcRenderer.invoke('settings:cancelMoeGirlpediaTest', requestId),
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

const world = {
  getStatus: (): Promise<WorldSyncStatus> => ipcRenderer.invoke('world:getStatus'),
  checkForUpdates: (): Promise<WorldSyncStatus> => ipcRenderer.invoke('world:checkForUpdates'),
  download: (): Promise<WorldSyncResult> => ipcRenderer.invoke('world:download'),
  onDownloadProgress: (listener: (progress: WorldSyncProgress) => void) => {
    const wrappedListener = (_event: IpcRendererEvent, progress: WorldSyncProgress): void => {
      listener(progress)
    }
    ipcRenderer.on(WORLD_SYNC_PROGRESS_CHANNEL, wrappedListener)
    return () => {
      ipcRenderer.removeListener(WORLD_SYNC_PROGRESS_CHANNEL, wrappedListener)
    }
  }
}

const tools = {
  getGachaUrl: (request?: GachaUrlRequest) => ipcRenderer.invoke('tools:getGachaUrl', request)
}

const tts = {
  /** @description 请求主进程根据当前 provider 与角色声音设置生成消息语音。 */
  synthesize: (request: TtsSynthesisRequest) => ipcRenderer.invoke('tts:synthesize', request),
  /** @description 请求主进程停止指定的正在生成语音。 */
  cancel: (requestId: string) => ipcRenderer.invoke('tts:cancel', requestId),
  /** @description 查询已安装角色的 index-tts 参考音色下载状态。 */
  getCharacterVoiceStatus: (characterId: string) =>
    ipcRenderer.invoke('tts:getCharacterVoiceStatus', characterId),
  /** @description 下载或重新下载角色的 index-tts 参考音色。 */
  downloadCharacterVoice: (characterId: string) =>
    ipcRenderer.invoke('tts:downloadCharacterVoice', characterId),
  /** @description 测试当前本地 TTS 引擎服务是否可访问。 */
  testLocalEngineConnection: () => ipcRenderer.invoke('tts:testLocalEngineConnection')
}

const exposedApis = {
  electron: electronAPI,
  api,
  ai,
  characters,
  settings,
  memory,
  logs,
  storage,
  world,
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
