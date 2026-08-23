import type { MoeGirlpediaSettings } from './agent-settings'

export type AgentResourceId = 'memory.entries'

export type AgentToolPackageId = 'story' | 'glossary' | 'memory' | 'datetime' | 'moegirlpedia'

export type AgentQueryOperator = 'equals' | 'contains' | 'in'

export type AgentQueryCondition = {
  field: string
  operator: AgentQueryOperator
  value: string | string[]
}

export type AgentResourceQuery = {
  source: AgentResourceId
  conditions?: AgentQueryCondition[]
  limit?: number
  cursor?: string | null
}

export type AgentResourceRecord = {
  id: string
  source: AgentResourceId
  text: string
  title?: string
  location?: string
  characterId?: string
  sessionId?: string
  metadata?: Record<string, string | number | boolean | null>
}

export type AgentResourcePage = {
  records: AgentResourceRecord[]
  nextCursor: string | null
  truncated: boolean
}

export type AgentToolTrace = {
  round: number
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  outputSummary: string
  output?: unknown
  status: 'completed' | 'failed' | 'rejected'
  sourceIds?: string[]
}

export type AgentPolicy = {
  maxToolRounds: number
  memoryScope: 'none' | 'current-session' | 'character-all-sessions'
  enabledToolPackageIds: AgentToolPackageId[]
  moegirlpedia: MoeGirlpediaSettings
}
