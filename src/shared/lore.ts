export type LoreTask = {
  id: string
  title: string
  category: string | null
  sourcePath: string
  participantLabels: string[]
}

export type LoreScene = {
  id: string
  taskId: string
  ordinal: number
  title: string
  text: string
}

export type LoreTerm = {
  id: string
  term: string
  definition: string
  sourcePath: string
  taskIds: string[]
}

export type LoreSummary = {
  id: string
  taskId: string
  sceneId?: string
  text: string
  sourceSceneIds: string[]
}

export type LorePackageSource = {
  kind: 'markdown-build' | 'remote-package'
  version: string
  sourceFingerprint: string
  builtAt: string
}

export type LorePackage = {
  version: 3
  source: LorePackageSource
  tasks: LoreTask[]
  scenes: LoreScene[]
  terms: LoreTerm[]
  summaries: LoreSummary[]
}

export type LoreStatus = {
  sourceId: 'lore'
  available: boolean
  sourceFingerprint: string | null
  sourceKind: LorePackageSource['kind'] | null
  packageVersion: string | null
  sourceUpdatedAt: string | null
  builtAt: string | null
  taskCount: number
  sceneCount: number
  termCount: number
  semanticIndexBuiltAt: string | null
  message?: string
}

export type LoreSemanticIndex = {
  sourceFingerprint: string
  fingerprintKey: string
  builtAt: string
  taskVectors: Record<string, number[]>
}

export type LoreRouteDisposition = 'retrieve' | 'skip' | 'uncertain'

export type LoreRouteReason =
  | 'past-event'
  | 'character-history'
  | 'lore-term'
  | 'conversation-follow-up'
  | 'daily-freeform'
  | 'ambiguous'
  | 'router-fallback'

export type LoreRouteDecision = {
  disposition: LoreRouteDisposition
  confidence: number
  retrievalQuery: string
  reason: LoreRouteReason
  routerProfileId: string
  fallbackReason?: string
}
