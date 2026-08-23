import type { CharacterSummary, ConversationSession, ModelProfile } from '@shared/chat'
import type { AgentPolicy, AgentResourceId, AgentResourcePage, AgentToolTrace } from '@shared/agent'
import type { StoryScopeResult } from '@shared/story'
import type { AIMessageChunk, BaseMessage } from '@langchain/core/messages'

export type AgentToolContext = {
  character: CharacterSummary
  session: ConversationSession
  policy: AgentPolicy
  accessedResourceIds: Set<AgentResourceId>
  storyScope?: StoryScopeResult
  abortSignal?: AbortSignal
}

export type AgentResource = {
  id: AgentResourceId
  description: string
  query: (input: Record<string, unknown>, context: AgentToolContext) => Promise<AgentResourcePage>
  read?: (input: Record<string, unknown>, context: AgentToolContext) => Promise<AgentResourcePage>
}

export type AgentToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type AgentToolCall = {
  id: string
  name: string
  args: Record<string, unknown>
}

export type AgentToolCallRejection = {
  callId: string
  message: string
}

export type AgentToolResultStatus = 'completed' | 'failed' | 'rejected'

export type AgentToolResult = {
  status: AgentToolResultStatus
  data?: unknown
  error?: string
  sourceIds?: string[]
  complete?: boolean
}

export type AgentTool = {
  name: string
  description: string
  definition: AgentToolDefinition
  execute: (input: Record<string, unknown>, context: AgentToolContext) => Promise<AgentToolResult>
}

export type AgentToolPackage = {
  id: string
  tools: AgentTool[]
  validateCalls?: (calls: AgentToolCall[], context: AgentToolContext) => AgentToolCallRejection[]
}

export type AgentModel = {
  bindTools?: (
    tools: AgentToolDefinition[],
    options?: { parallel_tool_calls?: boolean; tool_choice?: 'auto' | 'required' }
  ) => AgentModel
  stream: (
    messages: BaseMessage[],
    options?: { signal?: AbortSignal }
  ) => AsyncIterable<AIMessageChunk> | Promise<AsyncIterable<AIMessageChunk>>
}

export type AgentModelFactoryOptions = {
  onProviderRequest?: (body: Record<string, unknown>) => void
}

export type AgentModelFactory = (
  profile: ModelProfile,
  options?: AgentModelFactoryOptions
) => AgentModel

export type AgentRunPhase = 'tool-routing' | 'final-response'

export type AgentRunRequest = {
  profile: ModelProfile
  history: BaseMessage[]
  systemPromptText: string
  context: AgentToolContext
  tools: AgentToolPackage[]
  abortSignal: AbortSignal
  onChunk: (text: string) => void
  onTrace?: (trace: AgentToolTrace) => void
  onModelResponse?: (response: AIMessageChunk, phase: AgentRunPhase) => void
  onProviderRequest?: (body: Record<string, unknown>, phase: AgentRunPhase) => void
}

export type AgentRunResult = {
  assistantDraft: string
  messages: BaseMessage[]
  traces: AgentToolTrace[]
  toolRounds: number
  incomplete: boolean
}
