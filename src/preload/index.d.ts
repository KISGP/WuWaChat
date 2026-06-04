import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ChatRunAccepted,
  CharacterCatalog,
  ChatRunEvent,
  ChatRunRequest,
  CharacterPromptDocument,
  CharacterSummary,
  ConversationSession,
  ModelProfile
} from '../shared/ai'
import type { LogEntry, LogViewerState, RendererLogEventPayload } from '../shared/logging'
import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  EmbeddingConnectionTestResult,
  LocalEmbeddingCatalogItem,
  MemorySettingsStore,
  MemoryTask,
  MemoryTaskEvent,
  WorldIndexStatus
} from '../shared/memory-settings'
import type { OpenAIProfileConnectionTestResult, ProfilesStore } from '../shared/model-settings'

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
      getProfiles: () => Promise<ProfilesStore>
      saveProfiles: (store: ProfilesStore) => Promise<ProfilesStore>
      testProfile: (profile: ModelProfile) => Promise<OpenAIProfileConnectionTestResult>
    }
    memory: {
      getSettings: () => Promise<MemorySettingsStore>
      saveSettings: (store: MemorySettingsStore) => Promise<MemorySettingsStore>
      getStatus: (characterId?: string | null) => Promise<{
        settings: MemorySettingsStore
        worldIndex: WorldIndexStatus
        memoryIndex: CharacterMemoryIndexStatus
        tasks: MemoryTask[]
      }>
      listLocalModels: () => Promise<LocalEmbeddingCatalogItem[]>
      downloadLocalModel: (modelId: string) => Promise<MemoryTask>
      selectLocalModel: (modelId: string) => Promise<MemorySettingsStore>
      removeLocalModel: (modelId: string) => Promise<boolean>
      testEmbeddingConnection: () => Promise<EmbeddingConnectionTestResult>
      getEmbeddingCompatibility: (
        characterId?: string | null
      ) => Promise<EmbeddingCompatibilityStatus[]>
      getWorldIndexStatus: () => Promise<WorldIndexStatus>
      getMemoryIndexStatus: (characterId?: string | null) => Promise<CharacterMemoryIndexStatus>
      startWorldBundleDownload: () => Promise<MemoryTask>
      startWorldVectorBuild: () => Promise<MemoryTask>
      startCharacterMemoryBuild: (characterId: string) => Promise<MemoryTask>
      startAllMemoryBuild: () => Promise<MemoryTask>
      cancelTask: (taskId: string) => Promise<boolean>
      onTaskEvent: (listener: (event: MemoryTaskEvent) => void) => () => void
    }
    logs: {
      track: (payload: RendererLogEventPayload) => Promise<void>
      getViewerState: () => Promise<LogViewerState>
      readLogs: () => Promise<LogEntry[]>
      openDirectory: () => Promise<void>
      clearLogs: () => Promise<void>
    }
  }
}

export {}
