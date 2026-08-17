export type KnowledgeSourceId = 'lore' | 'encyclopedia-api'

export type KnowledgeLocator = 'exact' | 'semantic'

export type KnowledgeRetrievalPlan = {
  disposition: 'retrieve' | 'skip' | 'uncertain'
  confidence: number
  query: string
  sourceIds: KnowledgeSourceId[]
  reason: string
  routerProfileId: string
  fallbackReason?: string
}

export type KnowledgeHit = {
  id: string
  text: string
  sourceId: KnowledgeSourceId
  sourceLocation: string
  sourceVersion?: string
  locator: KnowledgeLocator
  score: number
  originIds: string[]
}

export type KnowledgeProviderStatus = {
  sourceId: KnowledgeSourceId
  available: boolean
  message?: string
}

export type KnowledgeRequest = {
  query: string
  characterId: string
  characterName: string
  resultLimit: number
}

export type KnowledgeProvider = {
  sourceId: KnowledgeSourceId
  getStatus: () => Promise<KnowledgeProviderStatus>
  retrieve: (request: KnowledgeRequest) => Promise<KnowledgeHit[]>
}
