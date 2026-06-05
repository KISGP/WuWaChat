import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import AdmZip from 'adm-zip'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { ConversationSession, MemoryEntry } from '../../shared/ai'
import type {
  CharacterMemoryIndexStatus,
  MemoryDebugRetrieveRequest,
  MemoryDebugRetrieveResult,
  MemoryDebugRetrievalHit,
  MemoryDebugRuntimeDetail,
  EmbeddingCompatibilityStatus,
  EmbeddingConnectionTestResult,
  EmbeddingFingerprint,
  InstalledLocalEmbeddingModel,
  IndexManifestRecord,
  LocalEmbeddingCatalogItem,
  MemoryHardwareInfo,
  MemorySettingsStore,
  MemoryStatusSnapshot,
  MemoryTask,
  MemoryTaskStatus,
  MemoryTaskEvent,
  WorldIndexStatus
} from '../../shared/memory-settings'
import {
  createDefaultMemorySettingsStore,
  normalizeMemorySettingsStore
} from '../../shared/memory-settings'
import {
  CloudEmbeddingProvider,
  createCloudEmbeddingFingerprint
} from '../embedding/cloud-provider'
import {
  createLocalEmbeddingFingerprint,
  getEmbeddingFingerprintKey,
  isSameEmbeddingFingerprint
} from '../embedding/fingerprint'
import { cosineSimilarity, parseVectorJson, scoreTextMatch } from './retrieval'
import { readMemoryHardwareInfo } from './hardware'
import { loadWorldMarkdownEntries, walkMarkdownFiles } from './world'
import { logger } from '../logging'
import { runMonitoredTask } from '../observability/monitored-task'
import {
  getAppDataRoot,
  getMemoryDatabasePath,
  getMemorySettingsPath,
  getWorldMetadataPath,
  getWorldRoot,
  now,
  readOptionalFile,
  pathExists,
  writeJsonFileAtomic
} from '../utils'

type SearchRow = {
  id: string
  text: string
  sourcePath?: string | null
  sessionId?: string | null
  characterId?: string | null
  vectorJson: string
}

type RetrievalExecution = {
  hits: MemoryDebugRetrievalHit[]
  runtimeModeUsed: WorldIndexStatus['runtimeMode']
  fallbackReason?: string
}

type EmbeddingProvider = {
  embedDocuments: (texts: string[]) => Promise<number[][]>
  embedQuery: (text: string) => Promise<number[]>
  testConnection: () => Promise<EmbeddingConnectionTestResult>
  prepare?: () => Promise<{
    requestedDevice: 'cpu' | 'gpu'
    actualDevice: 'cpu' | 'gpu'
    fallbackToCpu: boolean
  }>
}

type LocalEmbeddingModule = typeof import('../embedding/local')

const WORLD_SCOPE = 'world'
const MEMORY_SCOPE = 'character-memory'
const WORLD_BUNDLE_ZIP_URL = 'https://codeload.github.com/KISGP/WuWaChatWorld/zip/refs/heads/main'
const WORLD_BUNDLE_REPO_URL = 'https://api.github.com/repos/KISGP/WuWaChatWorld'

type WorldBundleMetadata = {
  updatedAt: string
}

export class MemoryService {
  private settings = createDefaultMemorySettingsStore()
  private sessions: ConversationSession[] = []
  private worldEntries: MemoryEntry[] = []
  private worldUpdatedAt: string | null = null
  private worldBundleError: string | null = null
  private tasks = new Map<string, MemoryTask>()
  private initialized = false
  private db: DatabaseSync | null = null
  private taskLogStates = new Map<string, MemoryTaskStatus>()
  private localEmbeddingModulePromise: Promise<LocalEmbeddingModule> | null = null
  private hardwareInfoPromise: Promise<MemoryHardwareInfo> | null = null

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.settings = await this.loadSettings()
    this.db = new DatabaseSync(getMemoryDatabasePath())
    this.prepareDatabase()

    try {
      await this.ensureWorldBundleReady()
    } catch (error) {
      this.worldBundleError = error instanceof Error ? error.message : String(error)
      void logger.error(
        'memory',
        'world-bundle-initialize-failed',
        'Failed to prepare world bundle during initialization',
        {
          error: this.worldBundleError
        }
      )
    }

    this.worldEntries = await this.loadWorldEntries()
    this.initialized = true
    void logger.info('memory', 'initialized', 'Memory service initialized', {
      retrievalMode: this.settings.retrievalMode,
      worldEntryCount: this.worldEntries.length,
      worldUpdatedAt: this.worldUpdatedAt
    })
  }

  setSessions(sessions: ConversationSession[]): void {
    this.sessions = sessions
  }

  getSettings(): MemorySettingsStore {
    return this.settings
  }

  async saveSettings(store: MemorySettingsStore): Promise<MemorySettingsStore> {
    this.settings = normalizeMemorySettingsStore(store)
    await writeJsonFileAtomic(getMemorySettingsPath(), this.settings)
    void logger.info('memory', 'settings-saved', 'Memory settings saved', {
      retrievalMode: this.settings.retrievalMode,
      worldSearchEnabled: this.settings.worldSearchEnabled,
      memorySearchEnabled: this.settings.memorySearchEnabled,
      crossSessionCharacterMemory: this.settings.crossSessionCharacterMemory
    })
    return this.settings
  }

  async listLocalModels(): Promise<LocalEmbeddingCatalogItem[]> {
    const { listLocalEmbeddingModels } = await this.getLocalEmbeddingModule()
    return listLocalEmbeddingModels(this.settings.localEmbedding.model)
  }

  async downloadLocalModel(modelId: string): Promise<MemoryTask> {
    return this.runTask(
      'local-model-download',
      'character-memory',
      async (taskId, updateTask) => {
        const { downloadLocalEmbeddingModel } = await this.getLocalEmbeddingModule()
        const installedModel = await downloadLocalEmbeddingModel(
          modelId,
          this.settings.localEmbedding,
          (progress, message) => {
            updateTask(taskId, {
              progress: Math.max(5, progress),
              message,
              characterId: modelId
            })
          }
        )

        if (
          !this.settings.localEmbedding.modelPath ||
          this.settings.localEmbedding.model === modelId
        ) {
          this.settings = normalizeMemorySettingsStore({
            ...this.settings,
            localEmbedding: {
              ...this.settings.localEmbedding,
              model: installedModel.id,
              modelPath: installedModel.modelPath,
              dimensions: installedModel.dimensions
            }
          })
          await writeJsonFileAtomic(getMemorySettingsPath(), this.settings)
        }
      },
      modelId
    )
  }

  async selectLocalModel(modelId: string): Promise<MemorySettingsStore> {
    const { getInstalledLocalEmbeddingModel } = await this.getLocalEmbeddingModule()
    const installedModel = await getInstalledLocalEmbeddingModel(modelId)
    if (!installedModel) {
      throw new Error('Selected local embedding model is not installed or is invalid.')
    }

    this.settings = normalizeMemorySettingsStore({
      ...this.settings,
      localEmbedding: {
        ...this.settings.localEmbedding,
        model: installedModel.id,
        modelPath: installedModel.modelPath,
        dimensions: installedModel.dimensions || this.settings.localEmbedding.dimensions
      }
    })
    await writeJsonFileAtomic(getMemorySettingsPath(), this.settings)
    return this.settings
  }

  async removeLocalModel(modelId: string): Promise<boolean> {
    const { removeLocalEmbeddingModel } = await this.getLocalEmbeddingModule()
    const removed = await removeLocalEmbeddingModel(modelId)
    if (!removed) {
      return false
    }

    if (this.settings.localEmbedding.model === modelId) {
      this.settings = normalizeMemorySettingsStore({
        ...this.settings,
        localEmbedding: {
          ...this.settings.localEmbedding,
          modelPath: ''
        }
      })
      await writeJsonFileAtomic(getMemorySettingsPath(), this.settings)
    }

    return true
  }

  async testEmbeddingConnection(): Promise<EmbeddingConnectionTestResult> {
    const startedAt = Date.now()
    void logger.info('memory', 'embedding-test-started', 'Embedding connection test started', {
      retrievalMode: this.settings.retrievalMode
    })

    try {
      const provider = await this.requireActiveEmbeddingProvider()
      const result = await provider.testConnection()
      void logger.info('memory', 'embedding-test-finished', 'Embedding connection test finished', {
        retrievalMode: this.settings.retrievalMode,
        latencyMs: Date.now() - startedAt,
        ok: result.ok,
        dimensions: result.dimensions
      })
      return result
    } catch (error) {
      void logger.error('memory', 'embedding-test-failed', 'Embedding connection test failed', {
        retrievalMode: this.settings.retrievalMode,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  getEmbeddingCompatibility(characterId?: string | null): EmbeddingCompatibilityStatus[] {
    return [this.getWorldCompatibility(), this.getMemoryCompatibility(characterId || null)]
  }

  getWorldIndexStatus(): WorldIndexStatus {
    const manifest = this.getManifest(WORLD_SCOPE)
    const compatibility = this.getWorldCompatibility()
    const availability = this.getWorldAvailability(manifest, compatibility)
    return {
      scope: WORLD_SCOPE,
      availability,
      runtimeMode: this.getRuntimeMode(availability),
      updatedAt: this.worldUpdatedAt,
      entryCount: compatibility.compatible
        ? manifest?.entryCount || this.worldEntries.length
        : this.worldEntries.length,
      fingerprint: manifest ? this.fingerprintFromManifest(manifest) : null,
      builtAt: manifest?.builtAt || null
    }
  }

  getMemoryIndexStatus(characterId?: string | null): CharacterMemoryIndexStatus {
    const manifest = this.getManifest(MEMORY_SCOPE, characterId || null)
    const compatibility = this.getMemoryCompatibility(characterId || null)
    const availability = this.getMemoryAvailability(manifest, compatibility)
    return {
      scope: MEMORY_SCOPE,
      characterId: characterId || null,
      availability,
      runtimeMode: this.getRuntimeMode(availability),
      entryCount: manifest?.entryCount || this.countMemoryEntries(characterId || null),
      indexedCharacterCount: this.countIndexedCharacters(),
      fingerprint: manifest ? this.fingerprintFromManifest(manifest) : null,
      builtAt: manifest?.builtAt || null
    }
  }

  async getStatus(characterId?: string | null): Promise<MemoryStatusSnapshot> {
    return {
      settings: this.settings,
      worldIndex: this.getWorldIndexStatus(),
      memoryIndex: this.getMemoryIndexStatus(characterId),
      tasks: this.getTasks(),
      hardware: await this.getHardwareInfo()
    }
  }

  private async getHardwareInfo(): Promise<MemoryHardwareInfo> {
    if (!this.hardwareInfoPromise) {
      this.hardwareInfoPromise = readMemoryHardwareInfo().catch((error) => {
        void logger.warn('memory', 'hardware-info-read-failed', 'Failed to read GPU information', {
          error: error instanceof Error ? error.message : String(error)
        })
        return { gpuName: null }
      })
    }

    return this.hardwareInfoPromise
  }

  getTasks(): MemoryTask[] {
    return [...this.tasks.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    )
  }

  async startWorldBundleDownload(): Promise<MemoryTask> {
    return this.runTask('world-bundle-download', 'world', async (taskId, updateTask) => {
      updateTask(taskId, {
        progress: 10,
        message: 'Checking local world update time'
      })
      const localUpdatedAt = await this.getLocalWorldUpdatedAt()

      updateTask(taskId, {
        progress: 25,
        message: 'Fetching remote world update time'
      })
      const remoteUpdatedAt = await this.fetchRemoteWorldUpdatedAt()

      if (localUpdatedAt && remoteUpdatedAt === localUpdatedAt) {
        this.worldUpdatedAt = localUpdatedAt
        this.worldBundleError = null
        this.worldEntries = await this.loadWorldEntries()
        updateTask(taskId, {
          progress: 100,
          message: `World bundle is already up to date (${localUpdatedAt}).`
        })
        return
      }

      updateTask(taskId, {
        progress: 45,
        message: 'Downloading latest world bundle archive'
      })
      const installedVersion = await this.downloadAndInstallWorldBundle(remoteUpdatedAt)

      updateTask(taskId, {
        progress: 90,
        message: 'Reloading local world bundle content'
      })
      this.worldEntries = await this.loadWorldEntries()
      this.worldBundleError = null
      updateTask(taskId, {
        progress: 100,
        message: `World bundle updated to ${installedVersion}. Rebuild world vectors if you use vector retrieval.`
      })
    })
  }

  async startWorldVectorBuild(): Promise<MemoryTask> {
    return this.runTask('world-vector-build', 'world', async (taskId, updateTask) => {
      const provider = await this.requireVectorEmbeddingProvider()
      updateTask(taskId, { progress: 10, message: 'Scanning world markdown files' })
      this.worldEntries = await this.loadWorldEntries()
      const runtimeMessage = await this.describeEmbeddingRuntime(provider)
      updateTask(taskId, {
        progress: 25,
        message: runtimeMessage
          ? `Generating world embeddings (${runtimeMessage})`
          : 'Generating world embeddings'
      })
      const vectors = await provider.embedDocuments(this.worldEntries.map((entry) => entry.text))
      const fingerprint = await this.createActiveEmbeddingFingerprint(vectors[0]?.length)
      updateTask(taskId, { progress: 70, message: 'Writing vectors into local SQLite index' })
      this.saveWorldVectors(this.worldEntries, vectors, fingerprint)
      updateTask(taskId, { progress: 100, message: 'World vector index built successfully' })
    })
  }

  async startCharacterMemoryBuild(characterId: string): Promise<MemoryTask> {
    return this.runTask(
      'character-memory-build',
      'character-memory',
      async (taskId, updateTask) => {
        const provider = await this.requireVectorEmbeddingProvider()
        updateTask(taskId, {
          progress: 15,
          message: 'Collecting current character memory',
          characterId
        })
        const entries = this.buildCharacterMemoryEntries(characterId)
        const runtimeMessage = await this.describeEmbeddingRuntime(provider)
        updateTask(taskId, {
          progress: 45,
          message: runtimeMessage
            ? `Generating character memory embeddings (${runtimeMessage})`
            : 'Generating character memory embeddings',
          characterId
        })
        const vectors = await provider.embedDocuments(entries.map((entry) => entry.text))
        const fingerprint = await this.createActiveEmbeddingFingerprint(vectors[0]?.length)
        updateTask(taskId, {
          progress: 80,
          message: 'Writing character memory index',
          characterId
        })
        this.saveCharacterMemoryVectors(characterId, entries, vectors, fingerprint)
        updateTask(taskId, {
          progress: 100,
          message: 'Current character memory rebuilt',
          characterId
        })
      },
      characterId
    )
  }

  async startAllMemoryBuild(): Promise<MemoryTask> {
    return this.runTask('all-memory-build', 'character-memory', async (taskId, updateTask) => {
      const provider = await this.requireVectorEmbeddingProvider()
      const characterIds = [...new Set(this.sessions.map((session) => session.characterId))]
      let lastDimensions: number | undefined
      const runtimeMessage = await this.describeEmbeddingRuntime(provider)

      for (let index = 0; index < characterIds.length; index += 1) {
        const characterId = characterIds[index]
        updateTask(taskId, {
          progress: Math.round((index / Math.max(characterIds.length, 1)) * 100),
          message: runtimeMessage
            ? `Rebuilding character memory (${index + 1}/${characterIds.length}, ${runtimeMessage})`
            : `Rebuilding character memory (${index + 1}/${characterIds.length})`,
          characterId
        })
        const entries = this.buildCharacterMemoryEntries(characterId)
        const vectors = await provider.embedDocuments(entries.map((entry) => entry.text))
        lastDimensions = vectors[0]?.length || lastDimensions
        const fingerprint = await this.createActiveEmbeddingFingerprint(lastDimensions)
        this.saveCharacterMemoryVectors(characterId, entries, vectors, fingerprint)
      }

      updateTask(taskId, {
        progress: 100,
        message: 'All character memory indices rebuilt'
      })
    })
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status === 'completed' || task.status === 'failed') {
      return false
    }

    const nextTask = {
      ...task,
      status: 'cancelled' as const,
      updatedAt: now(),
      message: 'Task cancelled'
    }
    this.tasks.set(taskId, nextTask)
    this.emitTask(nextTask)
    return true
  }

  async retrieveWorldContext(query: string): Promise<string[]> {
    const result = await this.retrieveWorldDebugHits(query)
    return result.hits.map((hit) => hit.text)
  }

  async retrieveMemoryContext(query: string, session: ConversationSession): Promise<string[]> {
    const result = await this.retrieveMemoryDebugHits(query, session)
    return result.hits.map((hit) => hit.text)
  }

  async debugRetrieve(request: MemoryDebugRetrieveRequest): Promise<MemoryDebugRetrieveResult> {
    const query = request.query.trim()
    const scope = request.scope
    const session = this.resolveDebugSession(request.characterId || null, request.sessionId || null)
    const worldResult =
      scope === 'character-memory'
        ? {
            hits: [],
            runtimeModeUsed: this.getRuntimeMode(this.getWorldIndexStatus().availability),
            fallbackReason: 'World retrieval was not requested.'
          }
        : await this.retrieveWorldDebugHits(query)
    const memoryResult =
      scope === 'world'
        ? {
            hits: [],
            runtimeModeUsed: this.getRuntimeMode(
              this.getMemoryIndexStatus(session?.characterId || null).availability
            ),
            fallbackReason: 'Character memory retrieval was not requested.'
          }
        : await this.retrieveMemoryDebugHits(query, session)

    return {
      query,
      scope,
      results: [...worldResult.hits, ...memoryResult.hits],
      runtimeSummary: {
        requestedMode: this.settings.retrievalMode,
        world: this.buildWorldRuntimeSummary(worldResult),
        memory: this.buildMemoryRuntimeSummary(memoryResult, session)
      }
    }
  }

  getRecentMessageCount(): number {
    return this.settings.recentMessageCount
  }

  private async describeEmbeddingRuntime(provider: EmbeddingProvider): Promise<string | null> {
    const runtime = await provider.prepare?.()
    if (!runtime) {
      return null
    }

    if (runtime.fallbackToCpu) {
      return 'GPU unavailable, falling back to CPU for this build'
    }

    return runtime.actualDevice === 'gpu' ? 'Using GPU for this build' : 'Using CPU for this build'
  }

  private getDatabase(): DatabaseSync {
    if (!this.db) {
      throw new Error('Memory database is not initialized')
    }

    return this.db
  }

  private prepareDatabase(): void {
    const db = this.getDatabase()
    db.exec(`
      CREATE TABLE IF NOT EXISTS world_chunks (
        id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS world_embeddings (
        chunk_id TEXT PRIMARY KEY,
        vector_json TEXT NOT NULL,
        fingerprint_key TEXT NOT NULL,
        built_at TEXT NOT NULL,
        FOREIGN KEY (chunk_id) REFERENCES world_chunks(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        character_id TEXT,
        session_id TEXT,
        source_type TEXT NOT NULL,
        text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_embeddings (
        entry_id TEXT PRIMARY KEY,
        vector_json TEXT NOT NULL,
        fingerprint_key TEXT NOT NULL,
        built_at TEXT NOT NULL,
        FOREIGN KEY (entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS index_manifests (
        scope TEXT NOT NULL,
        target_id TEXT,
        fingerprint_key TEXT NOT NULL,
        fingerprint_json TEXT NOT NULL,
        status TEXT NOT NULL,
        entry_count INTEGER NOT NULL,
        data_version TEXT,
        built_at TEXT,
        message TEXT,
        PRIMARY KEY (scope, target_id)
      );
    `)

    const manifestColumns = db.prepare('PRAGMA table_info(index_manifests)').all() as {
      name: string
    }[]
    if (!manifestColumns.some((column) => column.name === 'data_version')) {
      db.exec('ALTER TABLE index_manifests ADD COLUMN data_version TEXT')
    }

    this.normalizeLegacyManifestRows()
  }

  private async loadSettings(): Promise<MemorySettingsStore> {
    const filePath = getMemorySettingsPath()
    if (!(await pathExists(filePath))) {
      return createDefaultMemorySettingsStore()
    }

    try {
      return normalizeMemorySettingsStore(JSON.parse(await readFile(filePath, 'utf-8')))
    } catch (error) {
      void logger.error(
        'memory',
        'settings-read-failed',
        'Failed to read memory settings, using defaults',
        {
          filePath,
          error: error instanceof Error ? error.message : String(error)
        }
      )
      return createDefaultMemorySettingsStore()
    }
  }

  private async loadWorldEntries(): Promise<MemoryEntry[]> {
    const worldRoot = getWorldRoot()
    this.worldUpdatedAt = await this.getLocalWorldUpdatedAt()
    return loadWorldMarkdownEntries(worldRoot)
  }

  private async ensureWorldBundleReady(): Promise<void> {
    if (await this.hasWorldBundleContent()) {
      this.worldUpdatedAt = await this.getLocalWorldUpdatedAt()
      this.worldBundleError = null
      return
    }

    const remoteUpdatedAt = await this.fetchRemoteWorldUpdatedAt()
    await this.downloadAndInstallWorldBundle(remoteUpdatedAt)
  }

  private async getLocalWorldUpdatedAt(): Promise<string | null> {
    const metadata = await this.readWorldBundleMetadata()
    return this.normalizeWorldVersion(metadata?.updatedAt)
  }

  private async fetchRemoteWorldUpdatedAt(): Promise<string> {
    const response = await this.fetchWorldResource(
      WORLD_BUNDLE_REPO_URL,
      'fetch world repo metadata'
    )
    const payload = (await response.json()) as { pushed_at?: unknown }
    const updatedAt =
      typeof payload?.pushed_at === 'string' ? this.normalizeWorldVersion(payload.pushed_at) : null
    if (!updatedAt) {
      throw new Error(`World repo metadata from ${WORLD_BUNDLE_REPO_URL} is missing pushed_at.`)
    }

    return updatedAt
  }

  private async downloadAndInstallWorldBundle(updatedAt: string): Promise<string> {
    const tempRoot = join(getAppDataRoot(), 'tmp', `world-bundle-${randomUUID()}`)
    const archivePath = join(tempRoot, 'world.zip')
    const extractRoot = join(tempRoot, 'extracted')
    const stagedWorldRoot = join(tempRoot, 'world')
    const targetRoot = getWorldRoot()
    const backupRoot = join(getAppDataRoot(), `world-backup-${randomUUID()}`)

    await mkdir(extractRoot, { recursive: true })

    try {
      const response = await this.fetchWorldResource(
        WORLD_BUNDLE_ZIP_URL,
        'download world bundle archive'
      )
      const archiveBuffer = Buffer.from(await response.arrayBuffer())
      await writeFile(archivePath, archiveBuffer)

      const zip = new AdmZip(archivePath)
      zip.extractAllTo(extractRoot, true)

      const bundleRoot = await this.findWorldBundleRoot(extractRoot)
      if (!bundleRoot) {
        throw new Error('Downloaded world bundle does not contain recognizable world content.')
      }

      await rename(bundleRoot, stagedWorldRoot)
      await this.replaceWorldDirectory(stagedWorldRoot, targetRoot, backupRoot)
      await this.writeWorldBundleMetadata(updatedAt)

      this.worldUpdatedAt = updatedAt
      this.worldBundleError = null
      return updatedAt
    } catch (error) {
      this.worldBundleError = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(backupRoot, { recursive: true, force: true })
    }
  }

  private async replaceWorldDirectory(
    sourceRoot: string,
    targetRoot: string,
    backupRoot: string
  ): Promise<void> {
    const targetExists = await pathExists(targetRoot)
    if (targetExists) {
      await rm(backupRoot, { recursive: true, force: true })
      await rename(targetRoot, backupRoot)
    }

    try {
      await rename(sourceRoot, targetRoot)
    } catch (error) {
      if (await pathExists(backupRoot)) {
        await rm(targetRoot, { recursive: true, force: true })
        await rename(backupRoot, targetRoot)
      }

      throw error
    }
  }

  private async findWorldBundleRoot(rootPath: string): Promise<string | null> {
    const entries = await readdir(rootPath, { withFileTypes: true })
    const hasMarkdownFile = entries.some(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md')
    )
    if (hasMarkdownFile) {
      return rootPath
    }

    const directoryEntries = entries.filter((entry) => entry.isDirectory())
    if (entries.length === 1 && directoryEntries.length === 1) {
      return this.findWorldBundleRoot(join(rootPath, directoryEntries[0].name))
    }

    if (directoryEntries.length > 0) {
      return rootPath
    }

    return null
  }

  private async hasWorldBundleContent(): Promise<boolean> {
    const worldRoot = getWorldRoot()
    if (!(await pathExists(worldRoot))) {
      return false
    }

    const markdownFiles = await walkMarkdownFiles(worldRoot)
    return markdownFiles.length > 0
  }

  private async readWorldBundleMetadata(): Promise<WorldBundleMetadata | null> {
    const content = await readOptionalFile(getWorldMetadataPath())
    if (!content) {
      return null
    }

    try {
      const parsed = JSON.parse(content) as Partial<WorldBundleMetadata>
      const updatedAt = this.normalizeWorldVersion(parsed.updatedAt)
      if (!updatedAt) {
        return null
      }

      return {
        updatedAt
      }
    } catch {
      return null
    }
  }

  private async writeWorldBundleMetadata(updatedAt: string): Promise<void> {
    await writeJsonFileAtomic(getWorldMetadataPath(), {
      updatedAt
    } satisfies WorldBundleMetadata)
  }

  private async fetchWorldResource(url: string, action: string): Promise<Response> {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`${action} failed (${response.status} ${response.statusText})`)
      }

      return response
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`${action} failed for ${url}: ${reason}`)
    }
  }

  private normalizeWorldVersion(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null
    }

    const trimmed = value.trim()
    return trimmed || null
  }

  private buildWorldStringHits(
    query: string,
    runtimeModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    return this.worldEntries
      .map((entry) => ({
        entry,
        score: scoreTextMatch(query, `${entry.sourcePath || ''}\n${entry.text}`)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, this.settings.worldTopK)
      .map((item, index) => ({
        id: item.entry.id,
        scope: WORLD_SCOPE,
        text: item.entry.text,
        score: item.score,
        rank: index + 1,
        retrievalModeUsed: runtimeModeUsed,
        sourcePath: item.entry.sourcePath || null
      }))
  }

  private buildMemoryStringHits(
    query: string,
    session: ConversationSession,
    runtimeModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    const entries = this.getMemoryEntriesForSession(session)

    return entries
      .map((entry) => ({
        entry,
        score: scoreTextMatch(query, entry.text)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, this.settings.memoryTopK)
      .map((item, index) => ({
        id: item.entry.id,
        scope: MEMORY_SCOPE,
        text: item.entry.text,
        score: item.score,
        rank: index + 1,
        retrievalModeUsed: runtimeModeUsed,
        sessionId: item.entry.sessionId || null,
        characterId: item.entry.characterId || null
      }))
  }

  private async buildWorldVectorHits(query: string): Promise<MemoryDebugRetrievalHit[]> {
    const provider = await this.requireVectorEmbeddingProvider()
    const queryVector = await provider.embedQuery(query)
    const manifest = this.getManifest(WORLD_SCOPE)
    if (!manifest) {
      return []
    }

    const rows = this.getDatabase()
      .prepare(
        `
          SELECT world_chunks.id AS id, world_chunks.text AS text, world_chunks.source_path AS sourcePath, world_embeddings.vector_json AS vectorJson
          FROM world_chunks
          INNER JOIN world_embeddings ON world_embeddings.chunk_id = world_chunks.id
          WHERE world_embeddings.fingerprint_key = ?
        `
      )
      .all(manifest.fingerprintKey) as SearchRow[]

    return rows
      .map((row) => ({
        id: row.id,
        text: row.text,
        sourcePath: row.sourcePath || null,
        score: cosineSimilarity(queryVector, parseVectorJson(row.vectorJson))
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, this.settings.worldTopK)
      .map((item, index) => ({
        id: item.id,
        scope: WORLD_SCOPE,
        text: item.text,
        score: item.score,
        rank: index + 1,
        retrievalModeUsed: 'vector',
        sourcePath: item.sourcePath
      }))
  }

  private async buildMemoryVectorHits(
    query: string,
    session: ConversationSession
  ): Promise<MemoryDebugRetrievalHit[]> {
    const provider = await this.requireVectorEmbeddingProvider()
    const queryVector = await provider.embedQuery(query)
    const targetId = this.settings.crossSessionCharacterMemory ? session.characterId : session.id
    const manifest = this.getManifest(MEMORY_SCOPE, targetId)
    if (!manifest) {
      return []
    }

    const whereClause = this.settings.crossSessionCharacterMemory
      ? 'character_id = ?'
      : 'session_id = ?'
    const rows = this.getDatabase()
      .prepare(
        `
          SELECT memory_entries.id AS id, memory_entries.text AS text, memory_entries.session_id AS sessionId, memory_entries.character_id AS characterId, memory_embeddings.vector_json AS vectorJson
          FROM memory_entries
          INNER JOIN memory_embeddings ON memory_embeddings.entry_id = memory_entries.id
          WHERE memory_embeddings.fingerprint_key = ? AND ${whereClause}
        `
      )
      .all(manifest.fingerprintKey, targetId) as SearchRow[]

    return rows
      .map((row) => ({
        id: row.id,
        text: row.text,
        sessionId: row.sessionId || null,
        characterId: row.characterId || null,
        score: cosineSimilarity(queryVector, parseVectorJson(row.vectorJson))
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, this.settings.memoryTopK)
      .map((item, index) => ({
        id: item.id,
        scope: MEMORY_SCOPE,
        text: item.text,
        score: item.score,
        rank: index + 1,
        retrievalModeUsed: 'vector',
        sessionId: item.sessionId,
        characterId: item.characterId
      }))
  }

  private buildCharacterMemoryEntries(characterId: string): MemoryEntry[] {
    const characterSessions = this.sessions.filter((session) => session.characterId === characterId)

    return characterSessions.flatMap((session) => {
      const completedMessages = session.messages.filter((message) =>
        Boolean(message.content.trim())
      )
      const recentMessages = completedMessages.slice(
        -Math.max(this.settings.summaryTriggerTurns, 4)
      )
      if (recentMessages.length === 0) {
        return []
      }

      return [
        {
          id: `memory:${characterId}:${session.id}`,
          text: recentMessages
            .map(
              (message) => `${message.role === 'user' ? 'User' : 'Character'}: ${message.content}`
            )
            .join('\n'),
          sourceType: 'summary',
          characterId,
          sessionId: session.id,
          createdAt: session.updatedAt,
          updatedAt: session.updatedAt,
          visibility: 'private'
        }
      ]
    })
  }

  private getMemoryEntriesForSession(session: ConversationSession): MemoryEntry[] {
    return this.buildCharacterMemoryEntries(session.characterId).filter((entry) =>
      this.settings.crossSessionCharacterMemory ? true : entry.sessionId === session.id
    )
  }

  private saveWorldVectors(
    entries: MemoryEntry[],
    vectors: number[][],
    fingerprint: EmbeddingFingerprint
  ): void {
    const db = this.getDatabase()
    const key = getEmbeddingFingerprintKey(fingerprint)
    const insertChunk = db.prepare(
      'INSERT OR REPLACE INTO world_chunks (id, source_path, chunk_index, text, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    const insertEmbedding = db.prepare(
      'INSERT OR REPLACE INTO world_embeddings (chunk_id, vector_json, fingerprint_key, built_at) VALUES (?, ?, ?, ?)'
    )

    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM world_embeddings').run()
      db.prepare('DELETE FROM world_chunks').run()

      entries.forEach((entry, index) => {
        insertChunk.run(
          entry.id,
          entry.sourcePath || '',
          entry.chunkIndex || 0,
          entry.text,
          entry.updatedAt
        )
        insertEmbedding.run(entry.id, JSON.stringify(vectors[index] || []), key, now())
      })

      this.saveManifest({
        scope: WORLD_SCOPE,
        targetId: null,
        fingerprintKey: key,
        status: 'ready',
        entryCount: entries.length,
        builtAt: now(),
        message: 'World vector index is ready',
        fingerprint
      })

      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      this.saveManifest({
        scope: WORLD_SCOPE,
        targetId: null,
        fingerprintKey: key,
        status: 'failed',
        entryCount: 0,
        builtAt: now(),
        message: error instanceof Error ? error.message : String(error),
        fingerprint
      })
      throw error
    }
  }

  private saveCharacterMemoryVectors(
    characterId: string,
    entries: MemoryEntry[],
    vectors: number[][],
    fingerprint: EmbeddingFingerprint
  ): void {
    const db = this.getDatabase()
    const key = getEmbeddingFingerprintKey(fingerprint)
    const insertEntry = db.prepare(
      'INSERT OR REPLACE INTO memory_entries (id, character_id, session_id, source_type, text, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const insertEmbedding = db.prepare(
      'INSERT OR REPLACE INTO memory_embeddings (entry_id, vector_json, fingerprint_key, built_at) VALUES (?, ?, ?, ?)'
    )

    db.exec('BEGIN')
    try {
      db.prepare(
        `
          DELETE FROM memory_embeddings
          WHERE entry_id IN (
            SELECT id FROM memory_entries WHERE character_id = ?
          )
        `
      ).run(characterId)
      db.prepare('DELETE FROM memory_entries WHERE character_id = ?').run(characterId)

      entries.forEach((entry, index) => {
        insertEntry.run(
          entry.id,
          entry.characterId || null,
          entry.sessionId || null,
          entry.sourceType,
          entry.text,
          entry.updatedAt
        )
        insertEmbedding.run(entry.id, JSON.stringify(vectors[index] || []), key, now())
      })

      this.saveManifest({
        scope: MEMORY_SCOPE,
        targetId: characterId,
        fingerprintKey: key,
        status: 'ready',
        entryCount: entries.length,
        builtAt: now(),
        message: 'Character memory vector index is ready',
        fingerprint
      })

      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      this.saveManifest({
        scope: MEMORY_SCOPE,
        targetId: characterId,
        fingerprintKey: key,
        status: 'failed',
        entryCount: 0,
        builtAt: now(),
        message: error instanceof Error ? error.message : String(error),
        fingerprint
      })
      throw error
    }
  }

  private saveManifest(input: IndexManifestRecord & { fingerprint: EmbeddingFingerprint }): void {
    const db = this.getDatabase()
    db.prepare('DELETE FROM index_manifests WHERE scope = ? AND target_id IS ?').run(
      input.scope,
      input.targetId || null
    )
    db.prepare(
      `
        INSERT INTO index_manifests
        (scope, target_id, fingerprint_key, fingerprint_json, status, entry_count, data_version, built_at, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      input.scope,
      input.targetId || null,
      input.fingerprintKey,
      JSON.stringify(input.fingerprint),
      input.status,
      input.entryCount,
      input.dataVersion || null,
      input.builtAt || null,
      input.message || null
    )
  }

  private getManifest(
    scope: 'world' | 'character-memory',
    targetId?: string | null
  ): IndexManifestRecord | null {
    const row = this.getDatabase()
      .prepare(
        `
          SELECT
            scope,
            target_id AS targetId,
            fingerprint_key AS fingerprintKey,
            status,
            entry_count AS entryCount,
            data_version AS dataVersion,
            built_at AS builtAt,
            message
          FROM index_manifests
          WHERE scope = ? AND target_id IS ?
          ORDER BY built_at DESC, rowid DESC
          LIMIT 1
        `
      )
      .get(scope, targetId || null) as
      | (IndexManifestRecord & { targetId?: string | null })
      | undefined

    return row || null
  }

  private fingerprintFromManifest(
    manifest: IndexManifestRecord & { targetId?: string | null }
  ): EmbeddingFingerprint | null {
    const row = this.getDatabase()
      .prepare(
        `
          SELECT fingerprint_json AS fingerprintJson
          FROM index_manifests
          WHERE scope = ? AND target_id IS ?
          ORDER BY built_at DESC, rowid DESC
          LIMIT 1
        `
      )
      .get(manifest.scope, manifest.targetId || null) as { fingerprintJson: string } | undefined

    return row ? (JSON.parse(row.fingerprintJson) as EmbeddingFingerprint) : null
  }

  private normalizeLegacyManifestRows(): void {
    const db = this.getDatabase()
    db.exec(`
      DELETE FROM index_manifests
      WHERE rowid NOT IN (
        SELECT rowid
        FROM (
          SELECT
            rowid,
            ROW_NUMBER() OVER (
              PARTITION BY scope, target_id
              ORDER BY built_at DESC, rowid DESC
            ) AS row_number
          FROM index_manifests
        )
        WHERE row_number = 1
      )
    `)
  }

  private getExpectedFingerprint(): EmbeddingFingerprint | null {
    if (this.settings.retrievalMode === 'vector-cloud') {
      return createCloudEmbeddingFingerprint(this.settings.cloudEmbedding)
    }

    if (this.settings.retrievalMode === 'vector-local' && this.settings.localEmbedding.modelPath) {
      return createLocalEmbeddingFingerprint({
        id: this.settings.localEmbedding.model,
        repoId: this.settings.localEmbedding.model,
        installedAt: now(),
        dimensions: this.settings.localEmbedding.dimensions || 0,
        runtime: 'transformers-js'
      })
    }

    return null
  }

  private getWorldCompatibility(): EmbeddingCompatibilityStatus {
    const manifest = this.getManifest(WORLD_SCOPE)
    const expected = this.getExpectedFingerprint()
    const active = manifest ? this.fingerprintFromManifest(manifest) : null
    const compatible =
      this.settings.retrievalMode === 'string' || isSameEmbeddingFingerprint(active, expected)

    return {
      scope: WORLD_SCOPE,
      compatible,
      expectedFingerprint: expected,
      activeFingerprint: active,
      message:
        this.settings.retrievalMode !== 'string' && !compatible
          ? 'Current world index does not match the active embedding model and needs to be rebuilt.'
          : undefined
    }
  }

  private getMemoryCompatibility(characterId: string | null): EmbeddingCompatibilityStatus {
    const targetId = characterId || null
    const manifest = this.getManifest(MEMORY_SCOPE, targetId)
    const expected = this.getExpectedFingerprint()
    const active = manifest ? this.fingerprintFromManifest(manifest) : null
    const compatible =
      this.settings.retrievalMode === 'string' || isSameEmbeddingFingerprint(active, expected)

    return {
      scope: MEMORY_SCOPE,
      targetId,
      compatible,
      expectedFingerprint: expected,
      activeFingerprint: active,
      message:
        this.settings.retrievalMode !== 'string' && !compatible
          ? 'Current memory index does not match the active embedding model and needs to be rebuilt.'
          : undefined
    }
  }

  private getWorldAvailability(
    manifest: IndexManifestRecord | null,
    compatibility: EmbeddingCompatibilityStatus
  ): WorldIndexStatus['availability'] {
    const runningTask = this.getTasks().find(
      (task) => task.scope === 'world' && (task.status === 'queued' || task.status === 'running')
    )
    if (runningTask) {
      return 'building'
    }

    if (this.worldBundleError && this.worldEntries.length === 0) {
      return 'failed'
    }

    if (this.settings.retrievalMode === 'string') {
      return this.worldEntries.length > 0 ? 'ready' : 'missing'
    }

    if (!manifest) {
      return 'missing'
    }

    if (manifest.status === 'failed') {
      return 'failed'
    }

    return compatibility.compatible ? 'ready' : 'incompatible'
  }

  private getMemoryAvailability(
    manifest: IndexManifestRecord | null,
    compatibility: EmbeddingCompatibilityStatus
  ): CharacterMemoryIndexStatus['availability'] {
    const runningTask = this.getTasks().find(
      (task) =>
        task.scope === 'character-memory' && (task.status === 'queued' || task.status === 'running')
    )
    if (runningTask) {
      return 'building'
    }

    if (this.settings.retrievalMode === 'string') {
      return this.countIndexedCharacters() > 0 ? 'ready' : 'missing'
    }

    if (!manifest) {
      return 'missing'
    }

    if (manifest.status === 'failed') {
      return 'failed'
    }

    return compatibility.compatible ? 'ready' : 'incompatible'
  }

  private getRuntimeMode(
    availability: WorldIndexStatus['availability'] | CharacterMemoryIndexStatus['availability']
  ): WorldIndexStatus['runtimeMode'] {
    if (this.settings.retrievalMode === 'string') {
      return 'string'
    }

    return availability === 'ready' ? 'vector' : 'degraded'
  }

  private async retrieveWorldDebugHits(query: string): Promise<RetrievalExecution> {
    if (!this.settings.worldSearchEnabled) {
      return {
        hits: [],
        runtimeModeUsed: this.settings.retrievalMode === 'string' ? 'string' : 'degraded',
        fallbackReason: 'World retrieval is disabled in the current memory settings.'
      }
    }

    const compatibility = this.getWorldCompatibility()
    if (this.settings.retrievalMode !== 'string' && compatibility.compatible) {
      try {
        return {
          hits: await this.buildWorldVectorHits(query),
          runtimeModeUsed: 'vector'
        }
      } catch (error) {
        return {
          hits: this.buildWorldStringHits(query, 'degraded'),
          runtimeModeUsed: 'degraded',
          fallbackReason: this.describeVectorFailure(error)
        }
      }
    }

    return {
      hits: this.buildWorldStringHits(
        query,
        this.settings.retrievalMode === 'string' ? 'string' : 'degraded'
      ),
      runtimeModeUsed: this.settings.retrievalMode === 'string' ? 'string' : 'degraded',
      fallbackReason:
        this.settings.retrievalMode === 'string'
          ? undefined
          : this.getWorldCompatibilityReason(compatibility)
    }
  }

  private async retrieveMemoryDebugHits(
    query: string,
    session: ConversationSession | null
  ): Promise<RetrievalExecution> {
    if (!this.settings.memorySearchEnabled) {
      return {
        hits: [],
        runtimeModeUsed: this.settings.retrievalMode === 'string' ? 'string' : 'degraded',
        fallbackReason: 'Character memory retrieval is disabled in the current memory settings.'
      }
    }

    if (!session) {
      return {
        hits: [],
        runtimeModeUsed: this.settings.retrievalMode === 'string' ? 'string' : 'degraded',
        fallbackReason:
          'No matching session was found for the selected character, so character memory cannot be inspected yet.'
      }
    }

    const compatibility = this.getMemoryCompatibility(
      this.settings.crossSessionCharacterMemory ? session.characterId : session.id
    )
    if (this.settings.retrievalMode !== 'string' && compatibility.compatible) {
      try {
        return {
          hits: await this.buildMemoryVectorHits(query, session),
          runtimeModeUsed: 'vector'
        }
      } catch (error) {
        return {
          hits: this.buildMemoryStringHits(query, session, 'degraded'),
          runtimeModeUsed: 'degraded',
          fallbackReason: this.describeVectorFailure(error)
        }
      }
    }

    return {
      hits: this.buildMemoryStringHits(
        query,
        session,
        this.settings.retrievalMode === 'string' ? 'string' : 'degraded'
      ),
      runtimeModeUsed: this.settings.retrievalMode === 'string' ? 'string' : 'degraded',
      fallbackReason:
        this.settings.retrievalMode === 'string'
          ? undefined
          : this.getMemoryCompatibilityReason(compatibility, session)
    }
  }

  private buildWorldRuntimeSummary(result: RetrievalExecution): MemoryDebugRuntimeDetail {
    const worldIndex = this.getWorldIndexStatus()
    return {
      scope: WORLD_SCOPE,
      enabled: this.settings.worldSearchEnabled,
      indexAvailability: worldIndex.availability,
      retrievalModeUsed: result.runtimeModeUsed,
      resultCount: result.hits.length,
      fallbackReason: result.fallbackReason
    }
  }

  private buildMemoryRuntimeSummary(
    result: RetrievalExecution,
    session: ConversationSession | null
  ): MemoryDebugRuntimeDetail {
    const memoryIndex = this.getMemoryIndexStatus(
      session
        ? this.settings.crossSessionCharacterMemory
          ? session.characterId
          : session.id
        : null
    )
    return {
      scope: MEMORY_SCOPE,
      enabled: this.settings.memorySearchEnabled,
      indexAvailability: memoryIndex.availability,
      retrievalModeUsed: result.runtimeModeUsed,
      resultCount: result.hits.length,
      fallbackReason: result.fallbackReason,
      targetCharacterId: session?.characterId || null,
      targetSessionId: session?.id || null
    }
  }

  private getWorldCompatibilityReason(compatibility: EmbeddingCompatibilityStatus): string {
    const worldIndex = this.getWorldIndexStatus()
    if (worldIndex.availability === 'missing') {
      return 'World vector index is missing, so the query fell back to keyword matching.'
    }

    if (worldIndex.availability === 'failed') {
      return 'World vector index is marked as failed, so the query fell back to keyword matching.'
    }

    if (worldIndex.availability === 'building') {
      return 'World vector index is still building, so the query fell back to keyword matching.'
    }

    return (
      compatibility.message ||
      'World vector retrieval is unavailable, so the query fell back to keyword matching.'
    )
  }

  private getMemoryCompatibilityReason(
    compatibility: EmbeddingCompatibilityStatus,
    session: ConversationSession
  ): string {
    const memoryIndex = this.getMemoryIndexStatus(
      this.settings.crossSessionCharacterMemory ? session.characterId : session.id
    )
    if (memoryIndex.availability === 'missing') {
      return 'Character memory index is missing, so the query fell back to keyword matching.'
    }

    if (memoryIndex.availability === 'failed') {
      return 'Character memory index is marked as failed, so the query fell back to keyword matching.'
    }

    if (memoryIndex.availability === 'building') {
      return 'Character memory index is still building, so the query fell back to keyword matching.'
    }

    return (
      compatibility.message ||
      'Character memory vector retrieval is unavailable, so the query fell back to keyword matching.'
    )
  }

  private describeVectorFailure(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return `Vector retrieval failed at runtime, so the query fell back to keyword matching. ${message}`
  }

  private resolveDebugSession(
    characterId: string | null,
    sessionId: string | null
  ): ConversationSession | null {
    if (sessionId) {
      const session = this.sessions.find((item) => item.id === sessionId)
      if (session) {
        return session
      }
    }

    if (!characterId) {
      return null
    }

    const sessions = this.sessions
      .filter((item) => item.characterId === characterId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return sessions[0] || null
  }

  private countMemoryEntries(characterId: string | null): number {
    if (characterId) {
      const field = this.settings.crossSessionCharacterMemory ? 'character_id' : 'session_id'
      const result = this.getDatabase()
        .prepare(`SELECT COUNT(*) AS count FROM memory_entries WHERE ${field} = ?`)
        .get(characterId) as { count: number }
      return result.count
    }

    const result = this.getDatabase()
      .prepare('SELECT COUNT(*) AS count FROM memory_entries')
      .get() as { count: number }
    return result.count
  }

  private countIndexedCharacters(): number {
    const result = this.getDatabase()
      .prepare('SELECT COUNT(DISTINCT character_id) AS count FROM memory_entries')
      .get() as { count: number }
    return result.count
  }

  private async getLocalEmbeddingModule(): Promise<LocalEmbeddingModule> {
    if (!this.localEmbeddingModulePromise) {
      this.localEmbeddingModulePromise = import('../embedding/local')
    }

    return this.localEmbeddingModulePromise
  }

  private async requireInstalledLocalModel(): Promise<InstalledLocalEmbeddingModel> {
    if (this.settings.retrievalMode !== 'vector-local') {
      throw new Error('Local embeddings are only available in vector-local mode')
    }

    const { getInstalledLocalEmbeddingModel } = await this.getLocalEmbeddingModule()
    const installedModel = await getInstalledLocalEmbeddingModel(this.settings.localEmbedding.model)
    if (!installedModel) {
      throw new Error('Selected local embedding model is not installed or is invalid.')
    }

    return installedModel
  }

  private async requireVectorEmbeddingProvider(): Promise<EmbeddingProvider> {
    if (this.settings.retrievalMode === 'vector-cloud') {
      return new CloudEmbeddingProvider(this.settings.cloudEmbedding)
    }

    if (this.settings.retrievalMode === 'vector-local') {
      const installedModel = await this.requireInstalledLocalModel()
      const { LocalEmbeddingProvider } = await this.getLocalEmbeddingModule()
      return new LocalEmbeddingProvider(installedModel, this.settings.localEmbedding)
    }

    throw new Error('Vector embeddings are only available in vector modes')
  }

  private async requireActiveEmbeddingProvider(): Promise<EmbeddingProvider> {
    if (this.settings.retrievalMode === 'string') {
      throw new Error('Embedding connection test is only available in vector modes')
    }

    return this.requireVectorEmbeddingProvider()
  }

  private async createActiveEmbeddingFingerprint(
    dimensions?: number
  ): Promise<EmbeddingFingerprint> {
    if (this.settings.retrievalMode === 'vector-cloud') {
      return createCloudEmbeddingFingerprint(this.settings.cloudEmbedding, dimensions)
    }

    const installedModel = await this.requireInstalledLocalModel()
    return createLocalEmbeddingFingerprint({
      id: installedModel.id,
      repoId: installedModel.repoId,
      installedAt: now(),
      dimensions: dimensions || installedModel.dimensions,
      runtime: installedModel.runtime
    })
  }

  private getTaskStartMessage(taskType: MemoryTask['taskType']): string {
    switch (taskType) {
      case 'world-bundle-download':
        return 'Refreshing world knowledge bundle'
      case 'world-vector-build':
        return 'Preparing world vector index build'
      case 'character-memory-build':
        return 'Preparing character memory rebuild'
      case 'all-memory-build':
        return 'Preparing full character memory rebuild'
      case 'local-model-download':
        return 'Preparing local embedding model download'
      case 'local-model-validate':
        return 'Preparing local embedding model validation'
      default:
        return 'Task started'
    }
  }

  private formatTaskError(taskType: MemoryTask['taskType'], error: unknown): string {
    const baseMessage = error instanceof Error ? error.message : String(error)

    if (baseMessage === 'Selected local embedding model is not installed or is invalid.') {
      return [
        'Selected local embedding model is not installed or is invalid.',
        'Choose an installed local embedding model before starting the vector build.',
        'If you just changed the model in the UI, save settings first and then retry.'
      ].join('\n')
    }

    if (baseMessage === 'Local embeddings are only available in vector-local mode') {
      return [
        'Local embeddings are only available in vector-local mode.',
        'Switch retrieval mode to vector-local before running a local vector build.'
      ].join('\n')
    }

    if (
      taskType === 'world-vector-build' ||
      taskType === 'character-memory-build' ||
      taskType === 'all-memory-build'
    ) {
      return [
        baseMessage,
        'Check the active embedding configuration and local model selection, then retry the build.'
      ].join('\n')
    }

    return baseMessage
  }

  private async runTask(
    taskType: MemoryTask['taskType'],
    scope: MemoryTask['scope'],
    callback: (
      taskId: string,
      updateTask: (taskId: string, patch: Partial<MemoryTask>) => void
    ) => Promise<void>,
    characterId?: string
  ): Promise<MemoryTask> {
    const task: MemoryTask = {
      taskId: randomUUID(),
      taskType,
      status: 'queued',
      progress: 0,
      scope,
      characterId,
      createdAt: now(),
      updatedAt: now()
    }

    this.tasks.set(task.taskId, task)
    this.taskLogStates.delete(task.taskId)
    this.emitTask(task)

    void (async () => {
      try {
        await runMonitoredTask({
          scope: 'memory',
          action: 'task-failed',
          message: 'Memory task failed',
          code: 'MEMORY_INDEX_ERROR',
          context: {
            taskId: task.taskId,
            taskType,
            scope,
            characterId
          },
          run: async () => {
            this.updateTask(task.taskId, {
              status: 'running',
              progress: 5,
              message: this.getTaskStartMessage(taskType)
            })
            await callback(task.taskId, (id, patch) => this.updateTask(id, patch))
            const current = this.tasks.get(task.taskId)
            if (current?.status !== 'cancelled') {
              this.updateTask(task.taskId, {
                status: 'completed',
                progress: 100,
                message: current?.message || 'Task completed'
              })
            }
          }
        })
      } catch (error) {
        this.updateTask(task.taskId, {
          status: 'failed',
          message: this.formatTaskError(taskType, error)
        })
      }
    })()

    return task
  }

  private updateTask(taskId: string, patch: Partial<MemoryTask>): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    const nextTask = {
      ...task,
      ...patch,
      updatedAt: now()
    }

    this.tasks.set(taskId, nextTask)
    this.emitTask(nextTask)
  }

  private emitTask(task: MemoryTask): void {
    const previousStatus = this.taskLogStates.get(task.taskId)
    if (previousStatus !== task.status) {
      this.taskLogStates.set(task.taskId, task.status)
      const context = {
        taskId: task.taskId,
        taskType: task.taskType,
        scope: task.scope,
        characterId: task.characterId,
        status: task.status,
        progress: task.progress,
        message: task.message
      }
      if (task.status === 'failed') {
        void logger.error('memory', 'task-status-changed', 'Memory task status changed', context)
      } else if (task.status === 'cancelled') {
        void logger.warn('memory', 'task-status-changed', 'Memory task status changed', context)
      } else {
        void logger.info('memory', 'task-status-changed', 'Memory task status changed', context)
      }
    }

    const event: MemoryTaskEvent = {
      type: 'memory-task',
      task
    }

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('memory:task:event', event)
    }
  }
}
