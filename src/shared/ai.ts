export type ProviderKind = 'openai' | 'deepseek'

export type ModelProfile = {
  id: string
  name: string
  provider: ProviderKind
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export type CharacterSummary = {
  id: string
  name: string
  description?: string
  avatar: string
  cardBg?: string
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
  status: MessageStatus
  createdAt: string
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
  sourceType: 'world' | 'chat' | 'summary'
  characterId?: string
  sessionId?: string
  sourcePath?: string
  chunkIndex?: number
  createdAt: string
  updatedAt: string
  visibility?: 'private' | 'shared'
}

export type ChatRunRequest = {
  requestId: string
  sessionId?: string | null
  characterId: string
  userMessage: string
  profileId: string
}

export type ChatRunAccepted = {
  requestId: string
  sessionId: string
  messageId: string
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
