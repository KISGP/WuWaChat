import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ChatDeleteMessageRequest,
  ChatDeleteMessageResult,
  ChatPromptPreviewRequest,
  ChatPromptPreviewResult,
  ChatRunAccepted,
  CharacterCatalog,
  ChatRunEvent,
  ChatRunRequest,
  CharacterPromptDocument,
  CharacterSummary,
  ConversationSession
} from '@shared/chat'
import type { LogEntry, LogViewerState, RendererLogEventPayload } from '@shared/logging'
import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  EmbeddingConnectionTestResult,
  LocalEmbeddingCatalogItem,
  MemorySettingsStore,
  MemoryStatusSnapshot,
  MemoryTargetSelection,
  MemoryTask,
  MemoryTaskEvent
} from '@shared/memory-settings'
import type {
  OpenAIProfileConnectionTestRequest,
  OpenAIProfileConnectionTestResult,
  ProfilesStore
} from '@shared/model-settings'
import type { AppSettings } from '@shared/app-settings'
import type { AppearanceSettings, UnifiedSettings } from '@shared/settings'
import type { StorageUsageSnapshot } from '@shared/storage'
import type { GachaUrlRequest, GachaUrlResult } from '@shared/tools'
import type { TtsSynthesisRequest, TtsSynthesisResult } from '@shared/tts'
import type { LoreStatus } from '@shared/lore'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      minimize: () => void
    }
    ai: {
      getCharacters: () => Promise<CharacterSummary[]>
      getCharacterPrompt: (characterId: string) => Promise<CharacterPromptDocument>
      saveCharacterPrompt: (
        characterId: string,
        promptText: string
      ) => Promise<CharacterPromptDocument>
      getSessions: () => Promise<ConversationSession[]>
      deleteMessage: (request: ChatDeleteMessageRequest) => Promise<ChatDeleteMessageResult>
      previewModelInput?: (request: ChatPromptPreviewRequest) => Promise<ChatPromptPreviewResult>
      sendMessage: (request: ChatRunRequest) => Promise<ChatRunAccepted>
      abortRun: (requestId: string) => Promise<boolean>
      onRunEvent: (listener: (event: ChatRunEvent) => void) => () => void
    }
    characters: {
      getCharacterCatalog: () => Promise<CharacterCatalog>
      refreshRemoteCharacters: () => Promise<CharacterCatalog>
      getRemoteCharacterPrompt: (characterId: string) => Promise<string>
      downloadCharacter: (characterId: string) => Promise<CharacterSummary>
      resetPresetCharacter: (characterId: string) => Promise<CharacterSummary>
    }
    settings: {
      getUnifiedSettings: () => Promise<UnifiedSettings>
      getAppSettings: () => Promise<AppSettings>
      saveAppSettings: (settings: AppSettings) => Promise<AppSettings>
      getProfiles: () => Promise<ProfilesStore>
      saveProfiles: (store: ProfilesStore) => Promise<ProfilesStore>
      saveAppearance: (appearance: AppearanceSettings) => Promise<AppearanceSettings>
      testProfile: (
        request: OpenAIProfileConnectionTestRequest
      ) => Promise<OpenAIProfileConnectionTestResult>
      cancelProfileTest: (requestId: string) => Promise<boolean>
    }
    memory: {
      getSettings: () => Promise<MemorySettingsStore>
      saveSettings: (store: MemorySettingsStore) => Promise<MemorySettingsStore>
      getStatus: (selection?: MemoryTargetSelection | null) => Promise<MemoryStatusSnapshot>
      listLocalModels: () => Promise<LocalEmbeddingCatalogItem[]>
      downloadLocalModel: (modelId: string) => Promise<MemoryTask>
      selectLocalModel: (modelId: string) => Promise<MemorySettingsStore>
      removeLocalModel: (modelId: string) => Promise<boolean>
      testEmbeddingConnection: () => Promise<EmbeddingConnectionTestResult>
      getEmbeddingCompatibility: (
        selection?: MemoryTargetSelection | null
      ) => Promise<EmbeddingCompatibilityStatus[]>
      getMemoryIndexStatus: (
        selection?: MemoryTargetSelection | null
      ) => Promise<CharacterMemoryIndexStatus>
      startCharacterMemoryBuild: (characterId: string) => Promise<MemoryTask>
      startAllMemoryBuild: () => Promise<MemoryTask>
      cancelTask: (taskId: string) => Promise<boolean>
      onTaskEvent: (listener: (event: MemoryTaskEvent) => void) => () => void
    }
    lore: {
      getStatus: () => Promise<LoreStatus>
      updateSource: () => Promise<LoreStatus>
      rebuild: () => Promise<LoreStatus>
      buildSemanticIndex: () => Promise<LoreStatus>
    }
    logs: {
      track: (payload: RendererLogEventPayload) => Promise<void>
      getViewerState: () => Promise<LogViewerState>
      readLogs: () => Promise<LogEntry[]>
      openDirectory: () => Promise<void>
      clearLogs: () => Promise<void>
    }
    storage: {
      getUsage: () => Promise<StorageUsageSnapshot>
    }
    tools: {
      getGachaUrl: (request?: GachaUrlRequest) => Promise<GachaUrlResult>
    }
    tts: {
      synthesize: (request: TtsSynthesisRequest) => Promise<TtsSynthesisResult>
      cancel: (requestId: string) => Promise<boolean>
    }
  }
}

export {}
