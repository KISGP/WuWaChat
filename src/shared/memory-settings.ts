export type MemoryRetrievalMode = 'string' | 'vector-local'

export type MemoryScopeMode = 'character-global' | 'session-local'

export type LocalEmbeddingEngine = 'transformers-js'

export type LocalEmbeddingModelSource = 'builtin'

export type LocalEmbeddingModelStatus = 'not-downloaded' | 'downloading' | 'installed' | 'invalid'

export type LocalEmbeddingSettings = {
  engine: LocalEmbeddingEngine
  model: string
  modelPath?: string
  dimensions?: number | null
  batchSize: number
  useGpu: boolean
  useHuggingFaceMirror: boolean
  huggingFaceMirrorUrl: string
}

export type LocalEmbeddingCatalogModel = {
  id: string
  label: string
  repoId: string
  dimensions: number
  languages: string[]
  sizeMb: number
  speedTier: 'fast' | 'balanced' | 'quality'
  recommended: boolean
  description: string
  files?: string[]
}

export type InstalledLocalEmbeddingModel = {
  id: string
  repoId: string
  label: string
  source: LocalEmbeddingModelSource
  installedAt: string
  dimensions: number
  runtime: LocalEmbeddingEngine
  modelPath: string
}

export type LocalEmbeddingCatalogItem = LocalEmbeddingCatalogModel & {
  status: LocalEmbeddingModelStatus
  installedModel?: InstalledLocalEmbeddingModel | null
  isSelected: boolean
  validationMessage?: string
}

export type MemoryHardwareInfo = {
  gpuName: string | null
}

export type MemorySettingsStore = {
  retrievalMode: MemoryRetrievalMode
  loreSearchEnabled: boolean
  memorySearchEnabled: boolean
  crossSessionCharacterMemory: boolean
  recentMessageCount: number
  loreTopK: number
  memoryTopK: number
  summaryTriggerTurns: number
  localEmbedding: LocalEmbeddingSettings
}

export type EmbeddingFingerprint = {
  mode: 'cloud' | 'local'
  provider: string
  model: string
  dimensions?: number | null
  implementationVersion: string
  createdAt: string
}

export type EmbeddingConnectionTestResult = {
  ok: boolean
  message: string
  latencyMs?: number
  dimensions?: number
}

export type IndexManifestRecord = {
  scope: 'character-memory'
  targetId?: string | null
  fingerprintKey: string
  status: IndexAvailability
  entryCount: number
  dataVersion?: string | null
  builtAt?: string | null
  message?: string
}

export type EmbeddingCompatibilityStatus = {
  scope: 'character-memory'
  targetId?: string | null
  compatible: boolean
  expectedFingerprint: EmbeddingFingerprint | null
  activeFingerprint: EmbeddingFingerprint | null
  message?: string
}

export type IndexAvailability = 'missing' | 'ready' | 'building' | 'incompatible' | 'failed'

export type IndexRuntimeMode = 'string' | 'vector' | 'degraded'

export type MemoryRuntimeScope = 'story' | 'glossary' | 'chat-memory'

export type MemoryDebugRetrievalHit = {
  id: string
  scope: MemoryRuntimeScope
  text: string
  score: number
  rank: number
  retrievalModeUsed: IndexRuntimeMode
  sourceType?: 'story' | 'glossary' | 'chat' | 'summary'
  sourcePath?: string | null
  sessionId?: string | null
  characterId?: string | null
}

export type MemoryDebugRuntimeDetail = {
  scope: MemoryRuntimeScope
  enabled: boolean
  indexAvailability: IndexAvailability
  retrievalModeUsed: IndexRuntimeMode
  resultCount: number
  fallbackReason?: string
  targetCharacterId?: string | null
  targetSessionId?: string | null
}

export type MemoryDebugRuntimeSummary = {
  requestedMode: MemoryRetrievalMode
  story: MemoryDebugRuntimeDetail
  glossary: MemoryDebugRuntimeDetail
  chatMemory: MemoryDebugRuntimeDetail
}

export type MemoryTargetSelection = {
  characterId?: string | null
  sessionId?: string | null
}

export type CharacterMemoryIndexStatus = {
  scope: 'character-memory'
  characterId?: string | null
  targetCharacterId?: string | null
  targetSessionId?: string | null
  availability: IndexAvailability
  runtimeMode: IndexRuntimeMode
  entryCount: number
  indexedCharacterCount: number
  fingerprint?: EmbeddingFingerprint | null
  builtAt?: string | null
}

export type MemoryTaskType =
  | 'character-memory-build'
  | 'all-memory-build'
  | 'local-model-download'
  | 'local-model-validate'

export type MemoryTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type MemoryTask = {
  taskId: string
  taskType: MemoryTaskType
  status: MemoryTaskStatus
  progress: number
  message?: string
  scope?: 'character-memory'
  characterId?: string
  createdAt: string
  updatedAt: string
}

export type MemoryTaskEvent = {
  type: 'memory-task'
  task: MemoryTask
}

export type MemoryStatusSnapshot = {
  settings: MemorySettingsStore
  memoryIndex: CharacterMemoryIndexStatus
  tasks: MemoryTask[]
  hardware: MemoryHardwareInfo
}

export function createDefaultMemorySettingsStore(): MemorySettingsStore {
  return {
    retrievalMode: 'string',
    loreSearchEnabled: true,
    memorySearchEnabled: true,
    crossSessionCharacterMemory: true,
    recentMessageCount: 10,
    loreTopK: 4,
    memoryTopK: 4,
    summaryTriggerTurns: 12,
    localEmbedding: {
      engine: 'transformers-js',
      model: 'BAAI/bge-small-zh-v1.5',
      modelPath: '',
      dimensions: 512,
      batchSize: 16,
      useGpu: false,
      useHuggingFaceMirror: true,
      huggingFaceMirrorUrl: 'https://hf-mirror.com'
    }
  }
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(numeric)))
}

export function normalizeMemorySettingsStore(value: unknown): MemorySettingsStore {
  const defaults = createDefaultMemorySettingsStore()

  if (!value || typeof value !== 'object') {
    return defaults
  }

  const raw = value as Partial<MemorySettingsStore>
  const retrievalMode: MemoryRetrievalMode =
    raw.retrievalMode === 'vector-local' ? 'vector-local' : 'string'

  return {
    retrievalMode,
    loreSearchEnabled:
      typeof raw.loreSearchEnabled === 'boolean'
        ? raw.loreSearchEnabled
        : defaults.loreSearchEnabled,
    memorySearchEnabled:
      typeof raw.memorySearchEnabled === 'boolean'
        ? raw.memorySearchEnabled
        : defaults.memorySearchEnabled,
    crossSessionCharacterMemory:
      typeof raw.crossSessionCharacterMemory === 'boolean'
        ? raw.crossSessionCharacterMemory
        : defaults.crossSessionCharacterMemory,
    recentMessageCount: normalizeInteger(
      raw.recentMessageCount,
      defaults.recentMessageCount,
      2,
      50
    ),
    loreTopK: normalizeInteger(raw.loreTopK, defaults.loreTopK, 1, 12),
    memoryTopK: normalizeInteger(raw.memoryTopK, defaults.memoryTopK, 1, 12),
    summaryTriggerTurns: normalizeInteger(
      raw.summaryTriggerTurns,
      defaults.summaryTriggerTurns,
      4,
      100
    ),
    localEmbedding: {
      engine: 'transformers-js',
      model:
        typeof raw.localEmbedding?.model === 'string'
          ? raw.localEmbedding.model
          : defaults.localEmbedding.model,
      modelPath:
        typeof raw.localEmbedding?.modelPath === 'string'
          ? raw.localEmbedding.modelPath
          : defaults.localEmbedding.modelPath,
      useGpu:
        typeof raw.localEmbedding?.useGpu === 'boolean'
          ? raw.localEmbedding.useGpu
          : defaults.localEmbedding.useGpu,
      dimensions:
        raw.localEmbedding?.dimensions == null
          ? defaults.localEmbedding.dimensions
          : normalizeInteger(raw.localEmbedding.dimensions, 256, 8, 4096),
      batchSize: normalizeInteger(
        raw.localEmbedding?.batchSize,
        defaults.localEmbedding.batchSize,
        1,
        128
      ),
      useHuggingFaceMirror:
        typeof raw.localEmbedding?.useHuggingFaceMirror === 'boolean'
          ? raw.localEmbedding.useHuggingFaceMirror
          : defaults.localEmbedding.useHuggingFaceMirror,
      huggingFaceMirrorUrl:
        typeof raw.localEmbedding?.huggingFaceMirrorUrl === 'string' &&
        raw.localEmbedding.huggingFaceMirrorUrl.trim()
          ? raw.localEmbedding.huggingFaceMirrorUrl.trim()
          : defaults.localEmbedding.huggingFaceMirrorUrl
    }
  }
}
