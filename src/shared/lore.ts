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
  knownByTaskIds: string[]
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
  sourceFingerprint: string
  builtAt: string
}

export type LorePackage = {
  source: LorePackageSource
  story: {
    tasks: LoreTask[]
    scenes: LoreScene[]
    summaries: LoreSummary[]
  }
  glossary: {
    terms: LoreTerm[]
  }
}

export type LoreStatus = {
  sourceId: 'lore'
  available: boolean
  sourceFingerprint: string | null
  sourceKind: LorePackageSource['kind'] | null
  sourceUpdatedAt: string | null
  builtAt: string | null
  taskCount: number
  sceneCount: number
  termCount: number
  message?: string
}
