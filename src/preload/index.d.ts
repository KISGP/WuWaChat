import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ChatDiagnosticRunEvent,
  ChatDiagnosticRunRequest,
  ChatImageReadRequest,
  ChatImageReadResult,
  ChatDeleteMessageRequest,
  ChatDeleteMessageResult,
  ChatRunAccepted,
  CharacterRegistry,
  ChatRunEvent,
  ChatAppendMessageRequest,
  ChatTriggerRunRequest,
  CharacterPromptDocument,
  CharacterSummary,
  ConversationSession
} from '@shared/chat'
import type { ChatEmoticonImage } from '@shared/chat-emoticons'
import type { LogEntry, LogViewerState, RendererLogEventPayload } from '@shared/logging'
import type { MemorySettingsStore } from '@shared/memory-settings'
import type {
  AgentSettingsStore,
  MoeGirlpediaConnectionTestRequest,
  MoeGirlpediaConnectionTestResult
} from '@shared/agent-settings'
import type {
  OpenAIProfileConnectionTestRequest,
  OpenAIProfileConnectionTestResult,
  ProfilesStore
} from '@shared/model-settings'
import type { AppSettings } from '@shared/app-settings'
import type { AppearanceSettings, UnifiedSettings } from '@shared/settings'
import type { StorageUsageSnapshot } from '@shared/storage'
import type { WorldSyncProgress, WorldSyncResult, WorldSyncStatus } from '@shared/world'
import type { GachaUrlRequest, GachaUrlResult } from '@shared/tools'
import type {
  TtsCharacterVoiceStatus,
  TtsConnectionTestResult,
  TtsSynthesisRequest,
  TtsSynthesisResult
} from '@shared/tts'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      minimize: () => void
    }
    ai: {
      getCharacterPrompt: (characterId: string) => Promise<CharacterPromptDocument>
      saveCharacterPrompt: (
        characterId: string,
        promptText: string
      ) => Promise<CharacterPromptDocument>
      getSessions: () => Promise<ConversationSession[]>
      getUserEmoticons: () => Promise<ChatEmoticonImage[]>
      getCharacterEmoticons: (characterId: string) => Promise<ChatEmoticonImage[]>
      deleteMessage: (request: ChatDeleteMessageRequest) => Promise<ChatDeleteMessageResult>
      startDiagnosticRun: (request: ChatDiagnosticRunRequest) => Promise<{ requestId: string }>
      abortDiagnosticRun: (requestId: string) => Promise<boolean>
      appendMessage: (request: ChatAppendMessageRequest) => Promise<{ requestId: string; sessionId: string; messageId: string }>
      triggerRun: (request: ChatTriggerRunRequest) => Promise<ChatRunAccepted>
      readImageResource: (request: ChatImageReadRequest) => Promise<ChatImageReadResult | null>
      abortRun: (requestId: string) => Promise<boolean>
      onRunEvent: (listener: (event: ChatRunEvent) => void) => () => void
      onDiagnosticRunEvent: (listener: (event: ChatDiagnosticRunEvent) => void) => () => void
    }
    characters: {
      getCharacterRegistry: () => Promise<CharacterRegistry>
      onRegistryChanged: (listener: (registry: CharacterRegistry) => void) => () => void
      getPendingRemoteCharacterPrompt: (characterId: string) => Promise<string>
      retryCharacterSync: (characterId: string) => Promise<CharacterRegistry>
      applyPendingRemoteCharacterPrompt: (characterId: string) => Promise<CharacterSummary>
    }
    settings: {
      getUnifiedSettings: () => Promise<UnifiedSettings>
      getAppSettings: () => Promise<AppSettings>
      saveAppSettings: (settings: AppSettings) => Promise<AppSettings>
      getProfiles: () => Promise<ProfilesStore>
      saveProfiles: (store: ProfilesStore) => Promise<ProfilesStore>
      saveAgent: (settings: AgentSettingsStore) => Promise<AgentSettingsStore>
      testMoeGirlpedia: (
        request: MoeGirlpediaConnectionTestRequest
      ) => Promise<MoeGirlpediaConnectionTestResult>
      cancelMoeGirlpediaTest: (requestId: string) => Promise<boolean>
      saveAppearance: (appearance: AppearanceSettings) => Promise<AppearanceSettings>
      testProfile: (
        request: OpenAIProfileConnectionTestRequest
      ) => Promise<OpenAIProfileConnectionTestResult>
      cancelProfileTest: (requestId: string) => Promise<boolean>
    }
    memory: {
      getSettings: () => Promise<MemorySettingsStore>
      saveSettings: (store: MemorySettingsStore) => Promise<MemorySettingsStore>
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
    world: {
      getStatus: () => Promise<WorldSyncStatus>
      checkForUpdates: () => Promise<WorldSyncStatus>
      download: () => Promise<WorldSyncResult>
      onDownloadProgress: (listener: (progress: WorldSyncProgress) => void) => () => void
    }
    tools: {
      getGachaUrl: (request?: GachaUrlRequest) => Promise<GachaUrlResult>
    }
    tts: {
      synthesize: (request: TtsSynthesisRequest) => Promise<TtsSynthesisResult>
      cancel: (requestId: string) => Promise<boolean>
      getCharacterVoiceStatus: (characterId: string) => Promise<TtsCharacterVoiceStatus>
      downloadCharacterVoice: (characterId: string) => Promise<TtsCharacterVoiceStatus>
      testLocalEngineConnection: () => Promise<TtsConnectionTestResult>
    }
  }
}

export {}
