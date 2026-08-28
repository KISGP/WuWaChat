import type { ChatEmoticonDefinition } from './chat-emoticons'

export type ProviderKind = 'openai' | 'deepseek'

export type ReasoningEffort = 'auto' | 'low' | 'medium' | 'high'

export type ModelCatalog = {
  models: string[]
  fetchedAt: string
  provider: ProviderKind
  baseUrl: string
  apiKeyFingerprint: string
}

export type ModelProfile = {
  id: string
  name: string
  provider: ProviderKind
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  reasoningEffort: ReasoningEffort
  modelCatalog?: ModelCatalog
}

export type CharacterSummary = {
  id: string
  name: string
  description?: string
  avatar: string
  cardBg?: string
}

export type CharacterInfo = {
  name: { en?: string; cn?: string; jp?: string }
  description: { en?: string; cn?: string; jp?: string }
  emoticons?: ChatEmoticonDefinition[]
}

export type CharacterSource = 'preset' | 'custom'

export type CharacterSyncStatus = {
  promptUpdateAvailable: boolean
  remoteUnavailable: boolean
  syncError?: string
}

export type LocalCharacterEntry = CharacterSummary & {
  source: CharacterSource
  syncStatus?: CharacterSyncStatus
}

export type RemoteCharacterEntry = {
  id: string
  name: string
  description?: string
  avatar?: string
  cardBg?: string
  isDownloaded: boolean
  syncState?: 'downloading' | 'failed'
  syncError?: string
}

export type CharacterRegistry = {
  local: LocalCharacterEntry[]
  remote: RemoteCharacterEntry[]
  refreshedAt: string | null
  isSyncing: boolean
  syncError?: string
}

export type CharacterPromptDocument = {
  characterId: string
  prompt: string
  promptFileName: string
}

export type MessageRole = 'user' | 'assistant'

export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error' | 'aborted'

export type SessionStatus = 'idle' | 'running' | 'error'

export type ConversationMessage = {
  id: string
  role: MessageRole
  content: string
  emoticonId?: string
  emoticonDescription?: string
  attachments?: ChatImageAttachment[]
  status: MessageStatus
  createdAt: string
}

export type ChatImageAttachment = {
  resourceId: string
  fileName: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  sizeBytes: number
  analysis: string
}

export type ChatImageInput = ChatImageAttachment & {
  dataUrl: string
}

export type ChatImageReadRequest = {
  sessionId: string
  resourceId: string
}

export type ChatImageReadResult = {
  dataUrl: string
  mimeType: ChatImageAttachment['mimeType']
}

export type ConversationSession = {
  id: string
  characterId: string
  messages: ConversationMessage[]
  status: SessionStatus
  createdAt: string
  updatedAt: string
}

export type MemoryEntry = {
  id: string
  text: string
  sourceType: 'story' | 'glossary' | 'chat' | 'summary'
  characterId?: string
  sessionId?: string
  sourcePath?: string
  chunkIndex?: number
  term?: string
  references?: string[]
  createdAt: string
  updatedAt: string
  visibility?: 'private' | 'shared'
}

export type ChatAppendMessageRequest = {
  holdId: string
  requestId: string
  sessionId?: string | null
  characterId: string
  profileId: string
  segment: ChatUserSegment
}

export type ChatUserSegment =
  | { type: 'text'; text: string; images?: ChatImageInput[] }
  | { type: 'emoticon'; emoticonId: string }

export type ChatAppendMessageResult = {
  requestId: string
  sessionId: string
  messageId: string
}

export type ChatTriggerRunRequest = {
  holdId: string
  requestId: string
  sessionId: string
  characterId: string
  profileId: string
}

export type ChatDeleteMessageRequest = {
  sessionId: string
  messageId: string
}

export type ChatDiagnosticRunRequest = {
  sessionId?: string | null
  characterId: string
  userMessage: string
  profileId: string
  requestId: string
  toolsEnabled: boolean
}

export type ChatDiagnosticToolCall = {
  id: string
  name: string
  args: Record<string, unknown>
  type?: string
}

export type ChatTokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type ChatDiagnosticRunStartedEvent = {
  type: 'started'
  requestId: string
  toolsEnabled: boolean
  agentTools: string[]
}

export type ChatDiagnosticLlmRequestEvent = {
  type: 'llm-request'
  requestId: string
  sequence: number
  phase: 'tool-routing' | 'final-response'
  body: Record<string, unknown>
}

export type ChatDiagnosticLlmResponseEvent = {
  type: 'llm-response'
  requestId: string
  sequence: number
  phase: 'tool-routing' | 'final-response'
  content: string
  tool_calls: ChatDiagnosticToolCall[]
  usage?: ChatTokenUsage
}

export type ChatDiagnosticToolResultEvent = {
  type: 'tool-result'
  requestId: string
  round: number
  message: ChatDiagnosticMessage
}

export type ChatDiagnosticRunCompletedEvent = {
  type: 'completed'
  requestId: string
  assistantDraft: string
  toolRounds: number
  incomplete: boolean
  durationMs: number
  tokenUsage?: ChatTokenUsage
}

export type ChatDiagnosticRunErrorEvent = {
  type: 'error'
  requestId: string
  error: string
}

export type ChatDiagnosticRunAbortedEvent = {
  type: 'aborted'
  requestId: string
}

export type ChatDiagnosticRunEvent =
  | ChatDiagnosticRunStartedEvent
  | ChatDiagnosticLlmRequestEvent
  | ChatDiagnosticLlmResponseEvent
  | ChatDiagnosticToolResultEvent
  | ChatDiagnosticRunCompletedEvent
  | ChatDiagnosticRunErrorEvent
  | ChatDiagnosticRunAbortedEvent

export type ChatDiagnosticMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ChatDiagnosticToolCall[]
  tool_call_id?: string
  name?: string
}

export type ChatRunAccepted = {
  requestId: string
  sessionId: string
  messageId: string
}

export type ChatDeleteMessageResult = {
  session: ConversationSession
}

export type ChatRunStartedEvent = {
  type: 'run-started'
  requestId: string
  session: ConversationSession
  messageId: string
}

export type ChatRunChunkEvent = {
  type: 'chunk'
  requestId: string
  sessionId: string
  messageId: string
  chunk: string
}

export type ChatRunMessageUpdatedEvent = {
  type: 'message-updated'
  requestId: string
  sessionId: string
  message: ConversationMessage
}

export type ChatRunSessionSyncedEvent = {
  type: 'session-synced'
  requestId: string
  session: ConversationSession
}

export type ChatRunFinishedEvent = {
  type: 'run-finished'
  requestId: string
  sessionId: string
  messageId: string
}

export type ChatRunErrorEvent = {
  type: 'run-error'
  requestId: string
  sessionId: string
  messageId: string
  error: string
}

export type ChatRunAbortedEvent = {
  type: 'run-aborted'
  requestId: string
  sessionId: string
  messageId: string
}

export type ChatRunEvent =
  | ChatRunStartedEvent
  | ChatRunChunkEvent
  | ChatRunMessageUpdatedEvent
  | ChatRunSessionSyncedEvent
  | ChatRunFinishedEvent
  | ChatRunErrorEvent
  | ChatRunAbortedEvent

export type ChatDebugRunStatus = 'running' | 'completed' | 'error' | 'aborted'

export type ChatDebugRunEvent = {
  sequence: number
  timestamp: string
  type: string
  data: unknown
}

export type ChatDebugRunSummary = {
  requestId: string
  sessionId: string
  messageId: string
  characterId: string
  profileId: string
  status: ChatDebugRunStatus
  startedAt: string
  updatedAt: string
  eventCount: number
}

export type ChatDebugRunRecord = ChatDebugRunSummary & {
  events: ChatDebugRunEvent[]
}

export type ChatDebugRunListRequest = {
  characterId: string
  sessionId: string
}

export type ChatDebugRunReadRequest = ChatDebugRunListRequest & {
  requestId: string
}
