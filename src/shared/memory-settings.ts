export type MemoryRetrievalMode = 'string' | 'vector-cloud' | 'vector-local'

export type MemoryScopeMode = 'character-global' | 'session-local'

export type LocalEmbeddingEngine = 'transformers-js'

export type LocalEmbeddingModelSource = 'builtin'

export type LocalEmbeddingModelStatus = 'not-downloaded' | 'downloading' | 'installed' | 'invalid'

export const HUGGING_FACE_INFERENCE_PROVIDERS = [
  'auto',
  'baseten',
  'black-forest-labs',
  'cerebras',
  'clarifai',
  'cohere',
  'deepinfra',
  'fal-ai',
  'featherless-ai',
  'fireworks-ai',
  'groq',
  'hf-inference',
  'hyperbolic',
  'nebius',
  'novita',
  'nscale',
  'nvidia',
  'openai',
  'ovhcloud',
  'publicai',
  'replicate',
  'sambanova',
  'scaleway',
  'together',
  'wavespeed',
  'zai-org'
] as const

export type HuggingFaceInferenceProvider = (typeof HUGGING_FACE_INFERENCE_PROVIDERS)[number]

export type CloudEmbeddingSettings = {
  provider: 'openai-compatible' | 'huggingface-inference' | 'volcengine-ark'
  baseUrl: string
  apiKey: string
  model: string
  inferenceProvider?: HuggingFaceInferenceProvider
  providerApiKeys?: Partial<Record<CloudEmbeddingSettings['provider'], string>>
  dimensions?: number | null
}

export type LocalEmbeddingSettings = {
  engine: LocalEmbeddingEngine
  model: string
  modelPath?: string
  dimensions?: number | null
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

export type MemorySettingsStore = {
  version: 1
  retrievalMode: MemoryRetrievalMode
  worldSearchEnabled: boolean
  memorySearchEnabled: boolean
  crossSessionCharacterMemory: boolean
  recentMessageCount: number
  worldTopK: number
  memoryTopK: number
  summaryTriggerTurns: number
  cloudEmbedding: CloudEmbeddingSettings
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
  scope: 'world' | 'character-memory'
  targetId?: string | null
  fingerprintKey: string
  status: IndexAvailability
  entryCount: number
  dataVersion?: string | null
  builtAt?: string | null
  message?: string
}

export type EmbeddingCompatibilityStatus = {
  scope: 'world' | 'character-memory'
  targetId?: string | null
  compatible: boolean
  expectedFingerprint: EmbeddingFingerprint | null
  activeFingerprint: EmbeddingFingerprint | null
  message?: string
}

export type IndexAvailability = 'missing' | 'ready' | 'building' | 'incompatible' | 'failed'

export type IndexRuntimeMode = 'string' | 'vector' | 'degraded'

export type MemoryDebugScope = 'world' | 'character-memory' | 'all'

export type MemoryDebugRetrievalHit = {
  id: string
  scope: 'world' | 'character-memory'
  text: string
  score: number
  rank: number
  retrievalModeUsed: IndexRuntimeMode
  sourcePath?: string | null
  sessionId?: string | null
  characterId?: string | null
}

export type MemoryDebugRuntimeDetail = {
  scope: 'world' | 'character-memory'
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
  world: MemoryDebugRuntimeDetail
  memory: MemoryDebugRuntimeDetail
}

export type MemoryDebugRetrieveRequest = {
  query: string
  scope: MemoryDebugScope
  characterId?: string | null
  sessionId?: string | null
}

export type MemoryDebugRetrieveResult = {
  query: string
  scope: MemoryDebugScope
  results: MemoryDebugRetrievalHit[]
  runtimeSummary: MemoryDebugRuntimeSummary
}

export type WorldIndexStatus = {
  scope: 'world'
  availability: IndexAvailability
  runtimeMode: IndexRuntimeMode
  updatedAt?: string | null
  entryCount: number
  fingerprint?: EmbeddingFingerprint | null
  builtAt?: string | null
}

export type CharacterMemoryIndexStatus = {
  scope: 'character-memory'
  characterId?: string | null
  availability: IndexAvailability
  runtimeMode: IndexRuntimeMode
  entryCount: number
  indexedCharacterCount: number
  fingerprint?: EmbeddingFingerprint | null
  builtAt?: string | null
}

export type MemoryTaskType =
  | 'world-bundle-download'
  | 'world-vector-build'
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
  scope?: 'world' | 'character-memory'
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
  worldIndex: WorldIndexStatus
  memoryIndex: CharacterMemoryIndexStatus
  tasks: MemoryTask[]
}

export const MEMORY_SETTINGS_VERSION = 1

export function createDefaultMemorySettingsStore(): MemorySettingsStore {
  return {
    version: MEMORY_SETTINGS_VERSION,
    retrievalMode: 'string',
    worldSearchEnabled: true,
    memorySearchEnabled: true,
    crossSessionCharacterMemory: true,
    recentMessageCount: 10,
    worldTopK: 4,
    memoryTopK: 4,
    summaryTriggerTurns: 12,
    cloudEmbedding: {
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'text-embedding-3-small',
      inferenceProvider: 'hf-inference',
      providerApiKeys: {},
      dimensions: null
    },
    localEmbedding: {
      engine: 'transformers-js',
      model: 'BAAI/bge-small-zh-v1.5',
      modelPath: '',
      dimensions: 512,
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

function normalizeHuggingFaceInferenceProvider(value: unknown): HuggingFaceInferenceProvider {
  if (
    typeof value === 'string' &&
    (HUGGING_FACE_INFERENCE_PROVIDERS as readonly string[]).includes(value.trim())
  ) {
    return value.trim() as HuggingFaceInferenceProvider
  }

  return 'hf-inference'
}

export function normalizeMemorySettingsStore(value: unknown): MemorySettingsStore {
  const defaults = createDefaultMemorySettingsStore()

  if (!value || typeof value !== 'object') {
    return defaults
  }

  const raw = value as Partial<MemorySettingsStore>
  const retrievalMode: MemoryRetrievalMode =
    raw.retrievalMode === 'vector-cloud' || raw.retrievalMode === 'vector-local'
      ? raw.retrievalMode
      : 'string'
  const normalizedProvider =
    raw.cloudEmbedding?.provider === 'huggingface-inference'
      ? 'huggingface-inference'
      : raw.cloudEmbedding?.provider === 'volcengine-ark'
        ? 'volcengine-ark'
        : 'openai-compatible'
  const normalizedApiKey =
    typeof raw.cloudEmbedding?.apiKey === 'string'
      ? raw.cloudEmbedding.apiKey
      : defaults.cloudEmbedding.apiKey
  const normalizedProviderApiKeys =
    raw.cloudEmbedding?.providerApiKeys && typeof raw.cloudEmbedding.providerApiKeys === 'object'
      ? {
          'openai-compatible':
            typeof raw.cloudEmbedding.providerApiKeys['openai-compatible'] === 'string'
              ? raw.cloudEmbedding.providerApiKeys['openai-compatible']
              : '',
          'huggingface-inference':
            typeof raw.cloudEmbedding.providerApiKeys['huggingface-inference'] === 'string'
              ? raw.cloudEmbedding.providerApiKeys['huggingface-inference']
              : '',
          'volcengine-ark':
            typeof raw.cloudEmbedding.providerApiKeys['volcengine-ark'] === 'string'
              ? raw.cloudEmbedding.providerApiKeys['volcengine-ark']
              : ''
        }
      : {
          ...defaults.cloudEmbedding.providerApiKeys,
          [normalizedProvider]: normalizedApiKey
        }

  return {
    version: MEMORY_SETTINGS_VERSION,
    retrievalMode,
    worldSearchEnabled:
      typeof raw.worldSearchEnabled === 'boolean'
        ? raw.worldSearchEnabled
        : defaults.worldSearchEnabled,
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
    worldTopK: normalizeInteger(raw.worldTopK, defaults.worldTopK, 1, 12),
    memoryTopK: normalizeInteger(raw.memoryTopK, defaults.memoryTopK, 1, 12),
    summaryTriggerTurns: normalizeInteger(
      raw.summaryTriggerTurns,
      defaults.summaryTriggerTurns,
      4,
      100
    ),
    cloudEmbedding: {
      provider: normalizedProvider,
      baseUrl:
        typeof raw.cloudEmbedding?.baseUrl === 'string'
          ? raw.cloudEmbedding.baseUrl
          : defaults.cloudEmbedding.baseUrl,
      apiKey: normalizedApiKey,
      model:
        typeof raw.cloudEmbedding?.model === 'string'
          ? raw.cloudEmbedding.model
          : defaults.cloudEmbedding.model,
      inferenceProvider: normalizeHuggingFaceInferenceProvider(
        raw.cloudEmbedding?.inferenceProvider
      ),
      providerApiKeys: normalizedProviderApiKeys,
      dimensions:
        raw.cloudEmbedding?.dimensions == null
          ? defaults.cloudEmbedding.dimensions
          : normalizeInteger(raw.cloudEmbedding.dimensions, 0, 1, 8192)
    },
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
      dimensions:
        raw.localEmbedding?.dimensions == null
          ? defaults.localEmbedding.dimensions
          : normalizeInteger(raw.localEmbedding.dimensions, 256, 8, 4096),
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
