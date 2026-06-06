import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import AdmZip from 'adm-zip'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { ConversationSession, MemoryEntry } from '@shared/chat'
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
} from '@shared/memory-settings'
import {
  createDefaultMemorySettingsStore,
  normalizeMemorySettingsStore
} from '@shared/memory-settings'
import {
  CloudEmbeddingProvider,
  createCloudEmbeddingFingerprint
} from '@main/embedding/cloud-provider'
import type { EmbeddingBatchProgress, EmbeddingProvider } from '@main/embedding/types'
import {
  createLocalEmbeddingFingerprint,
  isSameEmbeddingFingerprint
} from '@main/embedding/fingerprint'
import { readMemoryHardwareInfo } from './hardware'
import type { RetrievalExecution } from './internal-types'
import { MemoryIndexRepository } from './index-repository'
import { MemoryWorkerClient } from './worker-client'
import { RetrievalQueryService } from './retrieval-query-service'
import { loadWorldMarkdownEntries, walkMarkdownFiles } from './world'
import { MemoryWorkerRuntime } from './worker-runtime'
import { logger } from '@main/logging'
import { runMonitoredTask } from '@main/observability/monitored-task'
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
} from '@main/utils'

type LocalEmbeddingModule = typeof import('../embedding/local')

const WORLD_SCOPE = 'world'
const MEMORY_SCOPE = 'character-memory'
const WORLD_BUNDLE_ZIP_URL = 'https://codeload.github.com/KISGP/WuWaChatWorld/zip/refs/heads/main'
const WORLD_BUNDLE_REPO_URL = 'https://api.github.com/repos/KISGP/WuWaChatWorld'

type WorldBundleMetadata = {
  updatedAt: string
}

type TaskCancellationState = {
  controller: AbortController
  throwIfCancelled: () => void
}

class MemoryTaskCancelledError extends Error {
  constructor() {
    super('Task cancelled')
  }
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
  private repository: MemoryIndexRepository | null = null
  private taskLogStates = new Map<string, MemoryTaskStatus>()
  private taskCancellationStates = new Map<string, TaskCancellationState>()
  private localEmbeddingModulePromise: Promise<LocalEmbeddingModule> | null = null
  private hardwareInfoPromise: Promise<MemoryHardwareInfo> | null = null
  private readonly retrievalQueryService = new RetrievalQueryService()
  private readonly workerClient = new MemoryWorkerClient(
    new MemoryWorkerRuntime(this.retrievalQueryService)
  )

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.settings = await this.loadSettings()
    this.db = new DatabaseSync(getMemoryDatabasePath())
    this.repository = new MemoryIndexRepository(this.db)
    this.repository.prepareDatabase()

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

  syncSessions(sessions: ConversationSession[]): void {
    this.setSessions(sessions)
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
    return this.runTask(
      'world-bundle-download',
      'world',
      async (taskId, updateTask, taskControl) => {
        taskControl.throwIfCancelled()
        updateTask(taskId, {
          progress: 10,
          message: 'Checking local world update time'
        })
        const localUpdatedAt = await this.getLocalWorldUpdatedAt()
        taskControl.throwIfCancelled()

        updateTask(taskId, {
          progress: 25,
          message: 'Fetching remote world update time'
        })
        const remoteUpdatedAt = await this.fetchRemoteWorldUpdatedAt(taskControl.controller.signal)
        taskControl.throwIfCancelled()

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
        const installedVersion = await this.downloadAndInstallWorldBundle(
          remoteUpdatedAt,
          taskControl.controller.signal,
          taskControl.throwIfCancelled
        )
        taskControl.throwIfCancelled()

        updateTask(taskId, {
          progress: 90,
          message: 'Reloading local world bundle content'
        })
        this.worldEntries = await this.loadWorldEntries()
        taskControl.throwIfCancelled()
        this.worldBundleError = null
        updateTask(taskId, {
          progress: 100,
          message: `World bundle updated to ${installedVersion}. Rebuild world vectors if you use vector retrieval.`
        })
      }
    )
  }

  async startWorldVectorBuild(): Promise<MemoryTask> {
    return this.runTask('world-vector-build', 'world', async (taskId, updateTask, taskControl) => {
      const provider = await this.requireVectorEmbeddingProvider()
      taskControl.throwIfCancelled()
      updateTask(taskId, { progress: 10, message: 'Scanning world markdown files' })
      this.worldEntries = await this.loadWorldEntries()
      taskControl.throwIfCancelled()
      const runtimeMessage = await this.describeEmbeddingRuntime(provider)
      taskControl.throwIfCancelled()
      updateTask(taskId, {
        progress: 25,
        message: runtimeMessage
          ? `Generating world embeddings (${runtimeMessage})`
          : 'Generating world embeddings'
      })
      const buildResult = await this.workerClient.buildVectorIndex({
        type: 'build-world-vectors',
        entries: this.worldEntries,
        provider,
        createFingerprint: (dimensions) => this.createActiveEmbeddingFingerprint(dimensions),
        embedOptions: {
          abortSignal: taskControl.controller.signal,
          throwIfAborted: taskControl.throwIfCancelled,
          onProgress: (progress) => {
            updateTask(taskId, {
              progress: this.mapEmbeddingProgress(progress, 25, 70),
              message: runtimeMessage
                ? `Generating world embeddings (${runtimeMessage})`
                : 'Generating world embeddings'
            })
          }
        }
      })
      taskControl.throwIfCancelled()
      updateTask(taskId, { progress: 70, message: 'Writing vectors into local SQLite index' })
      taskControl.throwIfCancelled()
      this.saveWorldVectors(
        this.worldEntries,
        buildResult.data.vectors,
        buildResult.data.fingerprint
      )
      updateTask(taskId, { progress: 100, message: 'World vector index built successfully' })
    })
  }

  async startCharacterMemoryBuild(characterId: string): Promise<MemoryTask> {
    return this.runTask(
      'character-memory-build',
      'character-memory',
      async (taskId, updateTask, taskControl) => {
        const provider = await this.requireVectorEmbeddingProvider()
        taskControl.throwIfCancelled()
        updateTask(taskId, {
          progress: 15,
          message: 'Collecting current character memory',
          characterId
        })
        const entries = this.buildCharacterMemoryEntries(characterId)
        taskControl.throwIfCancelled()
        const runtimeMessage = await this.describeEmbeddingRuntime(provider)
        taskControl.throwIfCancelled()
        updateTask(taskId, {
          progress: 45,
          message: runtimeMessage
            ? `Generating character memory embeddings (${runtimeMessage})`
            : 'Generating character memory embeddings',
          characterId
        })
        const buildResult = await this.workerClient.buildVectorIndex({
          type: 'build-character-memory-vectors',
          entries,
          provider,
          createFingerprint: (dimensions) => this.createActiveEmbeddingFingerprint(dimensions),
          embedOptions: {
            abortSignal: taskControl.controller.signal,
            throwIfAborted: taskControl.throwIfCancelled,
            onProgress: (progress) => {
              updateTask(taskId, {
                progress: this.mapEmbeddingProgress(progress, 45, 80),
                message: runtimeMessage
                  ? `Generating character memory embeddings (${runtimeMessage})`
                  : 'Generating character memory embeddings',
                characterId
              })
            }
          }
        })
        taskControl.throwIfCancelled()
        updateTask(taskId, {
          progress: 80,
          message: 'Writing character memory index',
          characterId
        })
        taskControl.throwIfCancelled()
        this.saveCharacterMemoryVectors(
          characterId,
          entries,
          buildResult.data.vectors,
          buildResult.data.fingerprint
        )
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
    return this.runTask(
      'all-memory-build',
      'character-memory',
      async (taskId, updateTask, taskControl) => {
        const provider = await this.requireVectorEmbeddingProvider()
        const characterIds = [...new Set(this.sessions.map((session) => session.characterId))]
        const runtimeMessage = await this.describeEmbeddingRuntime(provider)

        for (let index = 0; index < characterIds.length; index += 1) {
          taskControl.throwIfCancelled()
          const characterId = characterIds[index]
          updateTask(taskId, {
            progress: Math.round((index / Math.max(characterIds.length, 1)) * 100),
            message: runtimeMessage
              ? `Rebuilding character memory (${index + 1}/${characterIds.length}, ${runtimeMessage})`
              : `Rebuilding character memory (${index + 1}/${characterIds.length})`,
            characterId
          })
          const entries = this.buildCharacterMemoryEntries(characterId)
          const stageStart = Math.round((index / Math.max(characterIds.length, 1)) * 100)
          const stageEnd = Math.round(((index + 1) / Math.max(characterIds.length, 1)) * 100)
          const buildResult = await this.workerClient.buildVectorIndex({
            type: 'build-character-memory-vectors',
            entries,
            provider,
            createFingerprint: (dimensions) => this.createActiveEmbeddingFingerprint(dimensions),
            embedOptions: {
              abortSignal: taskControl.controller.signal,
              throwIfAborted: taskControl.throwIfCancelled,
              onProgress: (progress) => {
                updateTask(taskId, {
                  progress: this.mapEmbeddingProgress(progress, stageStart, stageEnd),
                  message: runtimeMessage
                    ? `Rebuilding character memory (${index + 1}/${characterIds.length}, ${runtimeMessage})`
                    : `Rebuilding character memory (${index + 1}/${characterIds.length})`,
                  characterId
                })
              }
            }
          })
          taskControl.throwIfCancelled()
          const fingerprint = buildResult.data.fingerprint
          taskControl.throwIfCancelled()
          this.saveCharacterMemoryVectors(
            characterId,
            entries,
            buildResult.data.vectors,
            fingerprint
          )
        }

        updateTask(taskId, {
          progress: 100,
          message: 'All character memory indices rebuilt'
        })
      }
    )
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status === 'completed' || task.status === 'failed') {
      return false
    }

    this.taskCancellationStates.get(taskId)?.controller.abort()

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

  private mapEmbeddingProgress(
    progress: EmbeddingBatchProgress,
    stageStart: number,
    stageEnd: number
  ): number {
    if (progress.total <= 0) {
      return stageEnd
    }

    const ratio = Math.max(0, Math.min(progress.completed / progress.total, 1))
    return Math.max(
      stageStart,
      Math.min(stageEnd, Math.round(stageStart + (stageEnd - stageStart) * ratio))
    )
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

  private getRepository(): MemoryIndexRepository {
    if (!this.repository) {
      throw new Error('Memory index repository is not initialized')
    }

    return this.repository
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

  private async fetchRemoteWorldUpdatedAt(signal?: AbortSignal): Promise<string> {
    const response = await this.fetchWorldResource(
      WORLD_BUNDLE_REPO_URL,
      'fetch world repo metadata',
      signal
    )
    const payload = (await response.json()) as { pushed_at?: unknown }
    const updatedAt =
      typeof payload?.pushed_at === 'string' ? this.normalizeWorldVersion(payload.pushed_at) : null
    if (!updatedAt) {
      throw new Error(`World repo metadata from ${WORLD_BUNDLE_REPO_URL} is missing pushed_at.`)
    }

    return updatedAt
  }

  private async downloadAndInstallWorldBundle(
    updatedAt: string,
    signal?: AbortSignal,
    throwIfCancelled?: () => void
  ): Promise<string> {
    const tempRoot = join(getAppDataRoot(), 'tmp', `world-bundle-${randomUUID()}`)
    const archivePath = join(tempRoot, 'world.zip')
    const extractRoot = join(tempRoot, 'extracted')
    const stagedWorldRoot = join(tempRoot, 'world')
    const targetRoot = getWorldRoot()
    const backupRoot = join(getAppDataRoot(), `world-backup-${randomUUID()}`)

    await mkdir(extractRoot, { recursive: true })

    try {
      throwIfCancelled?.()
      const response = await this.fetchWorldResource(
        WORLD_BUNDLE_ZIP_URL,
        'download world bundle archive',
        signal
      )
      throwIfCancelled?.()
      const archiveBuffer = Buffer.from(await response.arrayBuffer())
      throwIfCancelled?.()
      await writeFile(archivePath, archiveBuffer)

      const zip = new AdmZip(archivePath)
      zip.extractAllTo(extractRoot, true)
      throwIfCancelled?.()

      const bundleRoot = await this.findWorldBundleRoot(extractRoot)
      if (!bundleRoot) {
        throw new Error('Downloaded world bundle does not contain recognizable world content.')
      }

      await rename(bundleRoot, stagedWorldRoot)
      throwIfCancelled?.()
      await this.replaceWorldDirectory(stagedWorldRoot, targetRoot, backupRoot)
      throwIfCancelled?.()
      await this.writeWorldBundleMetadata(updatedAt)

      this.worldUpdatedAt = updatedAt
      this.worldBundleError = null
      return updatedAt
    } catch (error) {
      if (!(error instanceof MemoryTaskCancelledError)) {
        this.worldBundleError = error instanceof Error ? error.message : String(error)
      }
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

  private async fetchWorldResource(
    url: string,
    action: string,
    signal?: AbortSignal
  ): Promise<Response> {
    try {
      const response = await fetch(url, { signal })
      if (!response.ok) {
        throw new Error(`${action} failed (${response.status} ${response.statusText})`)
      }

      return response
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MemoryTaskCancelledError()
      }
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
    return this.retrievalQueryService.buildWorldStringHits(
      query,
      this.worldEntries,
      this.settings.worldTopK,
      runtimeModeUsed
    )
  }

  private buildMemoryStringHits(
    query: string,
    session: ConversationSession,
    runtimeModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    return this.retrievalQueryService.buildMemoryStringHits(
      query,
      this.getMemoryEntriesForSession(session),
      this.settings.memoryTopK,
      runtimeModeUsed
    )
  }

  private async buildWorldVectorHits(query: string): Promise<MemoryDebugRetrievalHit[]> {
    const provider = await this.requireVectorEmbeddingProvider()
    const manifest = this.getManifest(WORLD_SCOPE)
    if (!manifest) {
      return []
    }

    const response = await this.workerClient.retrieveWorldVectorHits({
      type: 'retrieve-world-vectors',
      query,
      provider,
      rows: this.getRepository().getWorldVectorRows(manifest.fingerprintKey),
      topK: this.settings.worldTopK
    })

    return response.data
  }

  private async buildMemoryVectorHits(
    query: string,
    session: ConversationSession
  ): Promise<MemoryDebugRetrievalHit[]> {
    const provider = await this.requireVectorEmbeddingProvider()
    const targetId = this.settings.crossSessionCharacterMemory ? session.characterId : session.id
    const manifest = this.getManifest(MEMORY_SCOPE, targetId)
    if (!manifest) {
      return []
    }

    const response = await this.workerClient.retrieveMemoryVectorHits({
      type: 'retrieve-memory-vectors',
      query,
      provider,
      rows: this.getRepository().getMemoryVectorRows(
        manifest.fingerprintKey,
        targetId,
        this.settings.crossSessionCharacterMemory
      ),
      topK: this.settings.memoryTopK
    })

    return response.data
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
    this.getRepository().saveWorldVectors(entries, vectors, fingerprint)
  }

  private saveCharacterMemoryVectors(
    characterId: string,
    entries: MemoryEntry[],
    vectors: number[][],
    fingerprint: EmbeddingFingerprint
  ): void {
    this.getRepository().saveCharacterMemoryVectors(characterId, entries, vectors, fingerprint)
  }

  private getManifest(
    scope: 'world' | 'character-memory',
    targetId?: string | null
  ): IndexManifestRecord | null {
    return this.getRepository().getManifest(scope, targetId)
  }

  private fingerprintFromManifest(
    manifest: IndexManifestRecord & { targetId?: string | null }
  ): EmbeddingFingerprint | null {
    return this.getRepository().fingerprintFromManifest(manifest)
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
    return this.getRepository().countMemoryEntries(
      characterId,
      this.settings.crossSessionCharacterMemory
    )
  }

  private countIndexedCharacters(): number {
    return this.getRepository().countIndexedCharacters()
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
      updateTask: (taskId: string, patch: Partial<MemoryTask>) => void,
      taskControl: TaskCancellationState
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
    const controller = new AbortController()
    const taskControl: TaskCancellationState = {
      controller,
      throwIfCancelled: () => {
        const currentTask = this.tasks.get(task.taskId)
        if (controller.signal.aborted || currentTask?.status === 'cancelled') {
          throw new MemoryTaskCancelledError()
        }
      }
    }
    this.taskCancellationStates.set(task.taskId, taskControl)
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
          shouldCaptureError: (error) => !(error instanceof MemoryTaskCancelledError),
          run: async () => {
            this.updateTask(task.taskId, {
              status: 'running',
              progress: 5,
              message: this.getTaskStartMessage(taskType)
            })
            taskControl.throwIfCancelled()
            await callback(task.taskId, (id, patch) => this.updateTask(id, patch), taskControl)
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
        if (error instanceof MemoryTaskCancelledError) {
          const current = this.tasks.get(task.taskId)
          if (current?.status !== 'cancelled') {
            this.updateTask(task.taskId, {
              status: 'cancelled',
              message: current?.message || 'Task cancelled'
            })
          }
        } else {
          this.updateTask(task.taskId, {
            status: 'failed',
            message: this.formatTaskError(taskType, error)
          })
        }
      } finally {
        this.taskCancellationStates.delete(task.taskId)
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
