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
  MemoryDebugRuntimeSummary,
  MemoryKnowledgeScope,
  EmbeddingCompatibilityStatus,
  EmbeddingConnectionTestResult,
  EmbeddingFingerprint,
  InstalledLocalEmbeddingModel,
  IndexManifestRecord,
  LocalEmbeddingCatalogItem,
  MemoryHardwareInfo,
  MemorySettingsStore,
  MemoryTargetSelection,
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
import { loadWorldKnowledgeEntries, walkMarkdownFiles } from './world'
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

const STORY_SCOPE = 'story'
const GLOSSARY_SCOPE = 'glossary'
const MEMORY_SCOPE = 'character-memory'
const WORLD_BUNDLE_ZIP_URL = 'https://codeload.github.com/KISGP/WuWaChatWorld/zip/refs/heads/main'
const WORLD_BUNDLE_REPO_URL = 'https://api.github.com/repos/KISGP/WuWaChatWorld'
const GLOSSARY_REFERENCE_LIMIT = 2

type WorldBundleMetadata = {
  updatedAt: string
}

type TaskCancellationState = {
  controller: AbortController
  throwIfCancelled: () => void
}

type PromptContextPreviewResult = {
  storyHits: MemoryDebugRetrievalHit[]
  glossaryHits: MemoryDebugRetrievalHit[]
  chatMemoryHits: MemoryDebugRetrievalHit[]
  runtimeSummary: MemoryDebugRuntimeSummary
}

type MemoryResolvedTarget = {
  targetId: string | null
  characterId: string | null
  sessionId: string | null
  session: ConversationSession | null
}

class MemoryTaskCancelledError extends Error {
  constructor() {
    super('Task cancelled')
  }
}

export class MemoryService {
  private settings = createDefaultMemorySettingsStore()
  private sessions: ConversationSession[] = []
  private storyEntries: MemoryEntry[] = []
  private glossaryEntries: MemoryEntry[] = []
  private worldUpdatedAt: string | null = null
  private worldBundleError: string | null = null
  private tasks = new Map<string, MemoryTask>()
  private settingsLoaded = false
  private initialized = false
  private settingsPromise: Promise<void> | null = null
  private initializationPromise: Promise<void> | null = null
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

  async initializeSettings(): Promise<void> {
    await this.ensureSettingsLoaded()
  }

  async initialize(): Promise<void> {
    await this.ensureInitialized('manual')
  }

  private async ensureSettingsLoaded(): Promise<void> {
    if (this.settingsLoaded) {
      return
    }

    if (!this.settingsPromise) {
      this.settingsPromise = this.loadSettings().then((settings) => {
        this.settings = settings
        this.settingsLoaded = true
      })
    }

    await this.settingsPromise
  }

  private async ensureInitialized(
    trigger:
      | 'manual'
      | 'memory-ipc'
      | 'memory-status'
      | 'memory-local-models'
      | 'chat-world-retrieval'
      | 'chat-memory-retrieval'
      | 'memory-hardware'
      | 'memory-build'
      | 'memory-debug'
      | 'memory-embedding'
  ): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.ensureSettingsLoaded()

    if (!this.initializationPromise) {
      const startedAt = Date.now()
      void logger.info('memory', 'lazy-init-started', 'Starting lazy memory initialization', {
        trigger,
        retrievalMode: this.settings.retrievalMode
      })

      this.initializationPromise = (async () => {
        this.db = new DatabaseSync(getMemoryDatabasePath())
        this.repository = new MemoryIndexRepository(this.db)
        this.repository.prepareDatabase()

        try {
          const worldBootstrapStartedAt = Date.now()
          await this.ensureWorldBundleReady()
          void logger.info(
            'memory',
            'world-bundle-ready',
            'World bundle prepared during lazy memory initialization',
            {
              durationMs: Date.now() - worldBootstrapStartedAt,
              worldUpdatedAt: this.worldUpdatedAt
            }
          )
        } catch (error) {
          this.worldBundleError = error instanceof Error ? error.message : String(error)
          void logger.error(
            'memory',
            'world-bundle-initialize-failed',
            'Failed to prepare world bundle during lazy memory initialization',
            {
              trigger,
              error: this.worldBundleError
            }
          )
        }

        await this.loadWorldEntries()
        this.initialized = true
        void logger.info('memory', 'lazy-init-completed', 'Lazy memory initialization completed', {
          trigger,
          retrievalMode: this.settings.retrievalMode,
          durationMs: Date.now() - startedAt,
          worldEntryCount: this.getWorldEntryCount(),
          worldUpdatedAt: this.worldUpdatedAt
        })
      })().catch((error) => {
        this.initializationPromise = null
        throw error
      })
    }

    await this.initializationPromise
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
    await this.ensureSettingsLoaded()
    const previousSettings = this.settings
    this.settings = normalizeMemorySettingsStore(store)
    await writeJsonFileAtomic(getMemorySettingsPath(), this.settings)

    this.settingsLoaded = true

    if (this.shouldClearLocalEmbeddingPipelines(previousSettings, this.settings)) {
      await this.clearLocalEmbeddingPipelines()
    }

    void logger.info('memory', 'settings-saved', 'Memory settings saved', {
      retrievalMode: this.settings.retrievalMode,
      worldSearchEnabled: this.settings.worldSearchEnabled,
      memorySearchEnabled: this.settings.memorySearchEnabled,
      crossSessionCharacterMemory: this.settings.crossSessionCharacterMemory
    })
    return this.settings
  }

  async listLocalModels(): Promise<LocalEmbeddingCatalogItem[]> {
    await this.ensureInitialized('memory-local-models')
    const { listLocalEmbeddingModels } = await this.getLocalEmbeddingModule()
    return listLocalEmbeddingModels(this.settings.localEmbedding.model)
  }

  async downloadLocalModel(modelId: string): Promise<MemoryTask> {
    await this.ensureInitialized('memory-build')
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
          this.settingsLoaded = true
        }
      },
      modelId
    )
  }

  async selectLocalModel(modelId: string): Promise<MemorySettingsStore> {
    await this.ensureInitialized('memory-local-models')
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
    this.settingsLoaded = true
    await this.clearLocalEmbeddingPipelines()
    return this.settings
  }

  async removeLocalModel(modelId: string): Promise<boolean> {
    await this.ensureInitialized('memory-local-models')
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
      this.settingsLoaded = true
    }

    await this.clearLocalEmbeddingPipelines()
    return true
  }

  async testEmbeddingConnection(): Promise<EmbeddingConnectionTestResult> {
    await this.ensureInitialized('memory-embedding')
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

  /**
   * @description 获取当前 world 与角色记忆索引和所选目标之间的 embedding 兼容性快照。
   * @param selection 当前查看的角色 / 会话目标；非跨会话模式下会优先按 `sessionId` 解析。
   * @returns world 与角色记忆两个 scope 的兼容性结果。
   */
  async getEmbeddingCompatibility(
    selection?: MemoryTargetSelection | null
  ): Promise<EmbeddingCompatibilityStatus[]> {
    await this.ensureInitialized('memory-ipc')
    return this.buildEmbeddingCompatibility(selection)
  }

  /**
   * @description 构造当前所选 memory 目标对应的兼容性列表。
   * @param selection 当前查看的角色 / 会话目标。
   * @returns world 与角色记忆的兼容性数组。
   */
  private buildEmbeddingCompatibility(
    selection?: MemoryTargetSelection | null
  ): EmbeddingCompatibilityStatus[] {
    const resolvedTarget = this.resolveMemoryTarget(selection)
    return [this.getWorldCompatibility(), this.getMemoryCompatibility(resolvedTarget)]
  }

  /**
   * @description 汇总剧情与名词解释两个知识索引，生成兼容旧设置页的 world 状态。
   * @returns world 索引状态快照。
   */
  private buildWorldIndexStatus(): WorldIndexStatus {
    const storyManifest = this.getManifest(STORY_SCOPE)
    const glossaryManifest = this.getManifest(GLOSSARY_SCOPE)
    const compatibility = this.getWorldCompatibility()
    const availability = this.getWorldAvailability(storyManifest, glossaryManifest, compatibility)
    const combinedEntryCount = this.getWorldEntryCount()
    return {
      scope: 'world',
      availability,
      runtimeMode: this.getRuntimeMode(availability),
      updatedAt: this.worldUpdatedAt,
      entryCount: compatibility.compatible
        ? (storyManifest?.entryCount || 0) + (glossaryManifest?.entryCount || 0)
        : combinedEntryCount,
      storyEntryCount: this.storyEntries.length,
      glossaryEntryCount: this.glossaryEntries.length,
      fingerprint: storyManifest ? this.fingerprintFromManifest(storyManifest) : null,
      builtAt: storyManifest?.builtAt || glossaryManifest?.builtAt || null
    }
  }

  async getWorldIndexStatus(): Promise<WorldIndexStatus> {
    await this.ensureInitialized('memory-ipc')
    return this.buildWorldIndexStatus()
  }

  /**
   * @description 基于当前 memory 选择目标构造角色记忆索引状态，用于设置页展示与调试。
   * @param selection 当前查看的角色 / 会话目标。
   * @returns 与解析后目标一致的角色记忆索引状态。
   */
  private buildMemoryIndexStatus(
    selection?: MemoryTargetSelection | null
  ): CharacterMemoryIndexStatus {
    const resolvedTarget = this.resolveMemoryTarget(selection)
    const manifest = this.getManifest(MEMORY_SCOPE, resolvedTarget.targetId)
    const compatibility = this.getMemoryCompatibility(resolvedTarget)
    const availability = this.getMemoryAvailability(manifest, compatibility)
    return {
      scope: MEMORY_SCOPE,
      characterId: resolvedTarget.characterId,
      targetCharacterId: resolvedTarget.characterId,
      targetSessionId: resolvedTarget.sessionId,
      availability,
      runtimeMode: this.getRuntimeMode(availability),
      entryCount: manifest?.entryCount || this.countMemoryEntries(resolvedTarget),
      indexedCharacterCount: this.countIndexedCharacters(),
      fingerprint: manifest ? this.fingerprintFromManifest(manifest) : null,
      builtAt: manifest?.builtAt || null
    }
  }

  /**
   * @description 读取当前 memory 选择目标对应的角色记忆索引状态。
   * @param selection 当前查看的角色 / 会话目标。
   * @returns 角色记忆索引状态。
   */
  async getMemoryIndexStatus(
    selection?: MemoryTargetSelection | null
  ): Promise<CharacterMemoryIndexStatus> {
    await this.ensureInitialized('memory-ipc')
    return this.buildMemoryIndexStatus(selection)
  }

  /**
   * @description 读取 Memory 设置页需要的状态快照，并按当前选择目标解析角色记忆索引状态。
   * @param selection 当前查看的角色 / 会话目标。
   * @returns 包含设置、索引、任务和硬件信息的完整快照。
   */
  async getStatus(selection?: MemoryTargetSelection | null): Promise<MemoryStatusSnapshot> {
    await this.ensureInitialized('memory-status')
    return {
      settings: this.settings,
      worldIndex: this.buildWorldIndexStatus(),
      memoryIndex: this.buildMemoryIndexStatus(selection),
      tasks: this.getTasks(),
      hardware: await this.getHardwareInfo()
    }
  }

  private async getHardwareInfo(): Promise<MemoryHardwareInfo> {
    await this.ensureInitialized('memory-hardware')
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
    await this.ensureInitialized('memory-build')
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
          await this.loadWorldEntries()
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
        await this.loadWorldEntries()
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
    await this.ensureInitialized('memory-build')
    return this.runTask('world-vector-build', 'world', async (taskId, updateTask, taskControl) => {
      const provider = await this.requireVectorEmbeddingProvider()
      taskControl.throwIfCancelled()
      updateTask(taskId, { progress: 10, message: 'Scanning world markdown files' })
      await this.loadWorldEntries()
      taskControl.throwIfCancelled()
      const runtimeMessage = await this.describeEmbeddingRuntime(provider)
      taskControl.throwIfCancelled()
      updateTask(taskId, {
        progress: 25,
        message: runtimeMessage
          ? `Generating world embeddings (${runtimeMessage})`
          : 'Generating world embeddings'
      })
      await this.buildKnowledgeScopeVectors(
        STORY_SCOPE,
        this.storyEntries,
        provider,
        taskId,
        updateTask,
        taskControl,
        runtimeMessage,
        25,
        55
      )
      taskControl.throwIfCancelled()
      await this.buildKnowledgeScopeVectors(
        GLOSSARY_SCOPE,
        this.glossaryEntries,
        provider,
        taskId,
        updateTask,
        taskControl,
        runtimeMessage,
        55,
        85
      )
      taskControl.throwIfCancelled()
      updateTask(taskId, { progress: 100, message: 'World vector index built successfully' })
    })
  }

  async startCharacterMemoryBuild(characterId: string): Promise<MemoryTask> {
    await this.ensureInitialized('memory-build')
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
    await this.ensureInitialized('memory-build')
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

  /**
   * @description 检索当前 world 剧情上下文。
   * @param query 用户输入或调试查询。
   * @returns 剧情检索命中列表。
   */
  async retrieveStoryContext(query: string): Promise<MemoryDebugRetrievalHit[]> {
    await this.ensureInitialized('chat-world-retrieval')
    const result = await this.retrieveStoryDebugHits(query)
    return result.hits
  }

  /**
   * @description 检索当前 world 名词解释上下文，并补充命中词条引用的少量嵌套词条。
   * @param query 用户输入或调试查询。
   * @returns 名词解释检索命中列表。
   */
  async retrieveGlossaryContext(query: string): Promise<MemoryDebugRetrievalHit[]> {
    await this.ensureInitialized('chat-world-retrieval')
    const result = await this.retrieveGlossaryDebugHits(query)
    return result.hits
  }

  /**
   * @description 检索指定会话所属目标的聊天记忆上下文。
   * @param query 用户输入或调试查询。
   * @param session 当前聊天会话。
   * @returns 聊天记忆检索命中列表。
   */
  async retrieveChatMemoryContext(
    query: string,
    session: ConversationSession
  ): Promise<MemoryDebugRetrievalHit[]> {
    await this.ensureInitialized('chat-memory-retrieval')
    const result = await this.retrieveChatMemoryDebugHits(query, session)
    return result.hits
  }

  /**
   * @description 预览聊天请求将携带的检索上下文，按剧情、名词解释与聊天记忆拆分返回。
   * @param query 当前模拟用户输入。
   * @param session 当前将用于记忆检索的会话；为空时仅返回剧情与名词命中。
   * @returns 拆分后的检索命中列表与对应运行时摘要。
   */
  async previewPromptContext(
    query: string,
    session: ConversationSession | null
  ): Promise<PromptContextPreviewResult> {
    await this.ensureInitialized('memory-debug')
    const normalizedQuery = query.trim()
    const [storyResult, glossaryResult, chatMemoryResult] = await Promise.all([
      this.retrieveStoryDebugHits(normalizedQuery),
      this.retrieveGlossaryDebugHits(normalizedQuery),
      this.retrieveChatMemoryDebugHits(normalizedQuery, session)
    ])

    return {
      storyHits: storyResult.hits,
      glossaryHits: glossaryResult.hits,
      chatMemoryHits: chatMemoryResult.hits,
      runtimeSummary: {
        requestedMode: this.settings.retrievalMode,
        story: this.buildRuntimeSummary(STORY_SCOPE, storyResult),
        glossary: this.buildRuntimeSummary(GLOSSARY_SCOPE, glossaryResult),
        chatMemory: this.buildChatMemoryRuntimeSummary(chatMemoryResult, session)
      }
    }
  }

  async debugRetrieve(request: MemoryDebugRetrieveRequest): Promise<MemoryDebugRetrieveResult> {
    await this.ensureInitialized('memory-debug')
    const query = request.query.trim()
    const scope = request.scope
    const session = this.resolveDebugSession(request.characterId || null, request.sessionId || null)
    const storyResult =
      scope === 'glossary' || scope === 'chat-memory'
        ? {
            hits: [],
            runtimeModeUsed: this.getRuntimeMode(this.buildWorldIndexStatus().availability),
            fallbackReason: 'Story retrieval was not requested.'
          }
        : await this.retrieveStoryDebugHits(query)
    const glossaryResult =
      scope === 'story' || scope === 'chat-memory'
        ? {
            hits: [],
            runtimeModeUsed: this.getRuntimeMode(this.buildWorldIndexStatus().availability),
            fallbackReason: 'Glossary retrieval was not requested.'
          }
        : await this.retrieveGlossaryDebugHits(query)
    const chatMemoryResult =
      scope === 'story' || scope === 'glossary'
        ? {
            hits: [],
            runtimeModeUsed: this.getRuntimeMode(
              this.buildMemoryIndexStatus(
                session
                  ? {
                      characterId: session.characterId,
                      sessionId: session.id
                    }
                  : null
              ).availability
            ),
            fallbackReason: 'Chat memory retrieval was not requested.'
          }
        : await this.retrieveChatMemoryDebugHits(query, session)

    return {
      query,
      scope,
      results: [...glossaryResult.hits, ...storyResult.hits, ...chatMemoryResult.hits],
      runtimeSummary: {
        requestedMode: this.settings.retrievalMode,
        story: this.buildRuntimeSummary(STORY_SCOPE, storyResult),
        glossary: this.buildRuntimeSummary(GLOSSARY_SCOPE, glossaryResult),
        chatMemory: this.buildChatMemoryRuntimeSummary(chatMemoryResult, session)
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

  /**
   * @description 从本地 world 目录加载剧情与名词解释条目到内存缓存。
   * @remarks 该方法只刷新内存条目，不会自动重建 SQLite 向量索引。
   */
  private async loadWorldEntries(): Promise<void> {
    const worldRoot = getWorldRoot()
    this.worldUpdatedAt = await this.getLocalWorldUpdatedAt()
    const entries = await loadWorldKnowledgeEntries(worldRoot)
    this.storyEntries = entries.storyEntries
    this.glossaryEntries = entries.glossaryEntries
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

  /**
   * @description 使用字符串匹配检索剧情条目。
   * @param query 查询文本。
   * @param runtimeModeUsed 本次检索实际采用的运行模式。
   * @returns 剧情命中列表。
   */
  private buildStoryStringHits(
    query: string,
    runtimeModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    return this.retrievalQueryService.buildStoryStringHits(
      query,
      this.storyEntries,
      this.settings.worldTopK,
      runtimeModeUsed
    )
  }

  /**
   * @description 使用字符串匹配检索名词解释条目，并执行嵌套词条扩展。
   * @param query 查询文本。
   * @param runtimeModeUsed 本次检索实际采用的运行模式。
   * @returns 名词解释命中列表。
   */
  private buildGlossaryStringHits(
    query: string,
    runtimeModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    return this.expandGlossaryHits(
      this.retrievalQueryService.buildGlossaryStringHits(
        query,
        this.glossaryEntries,
        this.settings.worldTopK,
        runtimeModeUsed
      ),
      runtimeModeUsed
    )
  }

  /**
   * @description 使用字符串匹配检索指定会话目标的聊天记忆。
   * @param query 查询文本。
   * @param session 当前聊天会话。
   * @param runtimeModeUsed 本次检索实际采用的运行模式。
   * @returns 聊天记忆命中列表。
   */
  private buildChatMemoryStringHits(
    query: string,
    session: ConversationSession,
    runtimeModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    return this.retrievalQueryService.buildChatMemoryStringHits(
      query,
      this.getMemoryEntriesForSession(session),
      this.settings.memoryTopK,
      runtimeModeUsed
    )
  }

  /**
   * @description 使用向量索引检索指定知识 scope 的命中。
   * @param scope 知识范围，区分剧情与名词解释。
   * @param query 查询文本。
   * @returns 对应知识 scope 的向量检索命中列表。
   */
  private async buildKnowledgeVectorHits(
    scope: MemoryKnowledgeScope,
    query: string
  ): Promise<MemoryDebugRetrievalHit[]> {
    const provider = await this.requireVectorEmbeddingProvider()
    const manifest = this.getManifest(scope)
    if (!manifest) {
      return []
    }

    const response = await this.workerClient.retrieveWorldVectorHits({
      type: 'retrieve-knowledge-vectors',
      scope,
      query,
      provider,
      rows: this.getRepository().getKnowledgeVectorRows(scope, manifest.fingerprintKey),
      topK: this.settings.worldTopK
    })

    return scope === GLOSSARY_SCOPE
      ? this.expandGlossaryHits(response.data, 'vector')
      : response.data
  }

  /**
   * @description 使用向量索引检索指定会话目标的聊天记忆命中。
   * @param query 查询文本。
   * @param session 当前聊天会话。
   * @returns 聊天记忆向量检索命中列表。
   */
  private async buildChatMemoryVectorHits(
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

  private saveCharacterMemoryVectors(
    characterId: string,
    entries: MemoryEntry[],
    vectors: number[][],
    fingerprint: EmbeddingFingerprint
  ): void {
    this.getRepository().saveCharacterMemoryVectors(characterId, entries, vectors, fingerprint)
  }

  /**
   * @description 构建单个知识 scope 的向量索引，并将结果写入本地 SQLite。
   * @param scope 当前构建的知识范围。
   * @param entries 待构建的条目列表。
   * @param provider 当前启用的 embedding provider。
   * @param taskId 当前任务 ID。
   * @param updateTask 任务进度更新回调。
   * @param taskControl 任务取消控制器。
   * @param runtimeMessage embedding 运行时说明。
   * @param stageStart 当前 scope 在总进度中的起始位置。
   * @param stageEnd 当前 scope 在总进度中的结束位置。
   * @returns 当前 scope 生成的 fingerprint。
   */
  private async buildKnowledgeScopeVectors(
    scope: MemoryKnowledgeScope,
    entries: MemoryEntry[],
    provider: EmbeddingProvider,
    taskId: string,
    updateTask: (taskId: string, patch: Partial<MemoryTask>) => void,
    taskControl: TaskCancellationState,
    runtimeMessage: string | null,
    stageStart: number,
    stageEnd: number
  ): Promise<EmbeddingFingerprint> {
    const scopeLabel = scope === STORY_SCOPE ? 'story' : 'glossary'
    if (entries.length === 0) {
      const fingerprint = await this.createActiveEmbeddingFingerprint()
      this.getRepository().saveKnowledgeVectors(scope, [], [], fingerprint)
      return fingerprint
    }

    updateTask(taskId, {
      progress: stageStart,
      message: runtimeMessage
        ? `Generating ${scopeLabel} embeddings (${runtimeMessage})`
        : `Generating ${scopeLabel} embeddings`
    })
    const buildResult = await this.workerClient.buildVectorIndex({
      type: 'build-world-vectors',
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
              ? `Generating ${scopeLabel} embeddings (${runtimeMessage})`
              : `Generating ${scopeLabel} embeddings`
          })
        }
      }
    })
    taskControl.throwIfCancelled()
    updateTask(taskId, {
      progress: stageEnd,
      message: `Writing ${scopeLabel} vectors into local SQLite index`
    })
    this.getRepository().saveKnowledgeVectors(
      scope,
      entries,
      buildResult.data.vectors,
      buildResult.data.fingerprint
    )
    return buildResult.data.fingerprint
  }

  /**
   * @description 返回指定知识 scope 当前加载到内存中的条目列表。
   * @param scope 知识范围。
   * @returns 对应 scope 的条目数组。
   */
  private getKnowledgeEntries(scope: MemoryKnowledgeScope): MemoryEntry[] {
    return scope === STORY_SCOPE ? this.storyEntries : this.glossaryEntries
  }

  /**
   * @description 统计当前 world 知识总条目数，包含剧情与名词解释。
   * @returns 当前内存中的 world 条目总量。
   */
  private getWorldEntryCount(): number {
    return this.storyEntries.length + this.glossaryEntries.length
  }

  private getManifest(
    scope: MemoryKnowledgeScope | 'character-memory',
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

  /**
   * @description 判断指定知识 scope 的向量索引是否与当前 embedding 配置兼容。
   * @param scope 知识范围。
   * @returns 兼容则返回 `true`。
   */
  private isKnowledgeScopeCompatible(scope: MemoryKnowledgeScope): boolean {
    if (this.settings.retrievalMode === 'string') {
      return true
    }

    const entries = this.getKnowledgeEntries(scope)
    if (entries.length === 0) {
      return true
    }

    const manifest = this.getManifest(scope)
    const expected = this.getExpectedFingerprint()
    const active = manifest ? this.fingerprintFromManifest(manifest) : null
    return isSameEmbeddingFingerprint(active, expected)
  }

  /**
   * @description 汇总剧情与名词解释索引的 embedding 兼容性。
   * @returns 兼容旧接口的 world 兼容性状态。
   */
  private getWorldCompatibility(): EmbeddingCompatibilityStatus {
    const storyManifest = this.getManifest(STORY_SCOPE)
    const glossaryManifest = this.getManifest(GLOSSARY_SCOPE)
    const expected = this.getExpectedFingerprint()
    const storyActive = storyManifest ? this.fingerprintFromManifest(storyManifest) : null
    const glossaryActive = glossaryManifest ? this.fingerprintFromManifest(glossaryManifest) : null
    const compatible =
      this.settings.retrievalMode === 'string' ||
      (this.isKnowledgeScopeCompatible(STORY_SCOPE) &&
        this.isKnowledgeScopeCompatible(GLOSSARY_SCOPE))

    return {
      scope: 'world',
      compatible,
      expectedFingerprint: expected,
      activeFingerprint: storyActive || glossaryActive,
      message:
        this.settings.retrievalMode !== 'string' && !compatible
          ? 'Current story/glossary indices do not match the active embedding model and need to be rebuilt.'
          : undefined
    }
  }

  /**
   * @description 计算当前解析出的角色记忆目标与激活 embedding 配置之间的兼容性。
   * @param resolvedTarget 已解析出的 memory 目标。
   * @returns 角色记忆索引兼容性结果。
   */
  private getMemoryCompatibility(
    resolvedTarget: MemoryResolvedTarget
  ): EmbeddingCompatibilityStatus {
    const manifest = this.getManifest(MEMORY_SCOPE, resolvedTarget.targetId)
    const expected = this.getExpectedFingerprint()
    const active = manifest ? this.fingerprintFromManifest(manifest) : null
    const compatible =
      this.settings.retrievalMode === 'string' || isSameEmbeddingFingerprint(active, expected)

    return {
      scope: MEMORY_SCOPE,
      targetId: resolvedTarget.targetId,
      compatible,
      expectedFingerprint: expected,
      activeFingerprint: active,
      message:
        this.settings.retrievalMode !== 'string' && !compatible
          ? 'Current memory index does not match the active embedding model and needs to be rebuilt.'
          : undefined
    }
  }

  /**
   * @description 计算单个知识 scope 的索引可用性。
   * @param scope 知识范围。
   * @param manifest 该 scope 对应的索引 manifest。
   * @returns 当前可用性状态。
   */
  private getKnowledgeScopeAvailability(
    scope: MemoryKnowledgeScope,
    manifest: IndexManifestRecord | null
  ): WorldIndexStatus['availability'] {
    const entries = this.getKnowledgeEntries(scope)
    if (this.worldBundleError && this.getWorldEntryCount() === 0) {
      return 'failed'
    }

    if (this.settings.retrievalMode === 'string') {
      return entries.length > 0 ? 'ready' : 'missing'
    }

    if (entries.length === 0) {
      return 'missing'
    }

    if (!manifest) {
      return 'missing'
    }

    if (manifest.status === 'failed') {
      return 'failed'
    }

    return this.isKnowledgeScopeCompatible(scope) ? 'ready' : 'incompatible'
  }

  /**
   * @description 根据剧情与名词解释的独立状态计算兼容旧 UI 的 world 可用性。
   * @param storyManifest 剧情索引 manifest。
   * @param glossaryManifest 名词解释索引 manifest。
   * @param compatibility world 兼容性聚合结果。
   * @returns world 级别可用性状态。
   */
  private getWorldAvailability(
    storyManifest: IndexManifestRecord | null,
    glossaryManifest: IndexManifestRecord | null,
    compatibility: EmbeddingCompatibilityStatus
  ): WorldIndexStatus['availability'] {
    const runningTask = this.getTasks().find(
      (task) => task.scope === 'world' && (task.status === 'queued' || task.status === 'running')
    )
    if (runningTask) {
      return 'building'
    }

    const storyAvailability = this.getKnowledgeScopeAvailability(STORY_SCOPE, storyManifest)
    const glossaryAvailability = this.getKnowledgeScopeAvailability(
      GLOSSARY_SCOPE,
      glossaryManifest
    )

    if (storyAvailability === 'failed' || glossaryAvailability === 'failed') {
      return 'failed'
    }

    if (this.settings.retrievalMode === 'string') {
      return this.getWorldEntryCount() > 0 ? 'ready' : 'missing'
    }

    const storyNeedsIndex = this.storyEntries.length > 0
    const glossaryNeedsIndex = this.glossaryEntries.length > 0
    const anyPopulatedScopeMissing =
      (storyNeedsIndex && storyAvailability === 'missing') ||
      (glossaryNeedsIndex && glossaryAvailability === 'missing')

    if (this.getWorldEntryCount() === 0 || anyPopulatedScopeMissing) {
      return 'missing'
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

  /**
   * @description 按知识 scope 执行调试检索，优先向量，失败时降级到字符串匹配。
   * @param scope 知识范围。
   * @param query 查询文本。
   * @returns 检索执行结果与降级原因。
   */
  private async retrieveKnowledgeDebugHits(
    scope: MemoryKnowledgeScope,
    query: string
  ): Promise<RetrievalExecution> {
    if (!this.settings.worldSearchEnabled) {
      return {
        hits: [],
        runtimeModeUsed: this.settings.retrievalMode === 'string' ? 'string' : 'degraded',
        fallbackReason: 'World retrieval is disabled in the current memory settings.'
      }
    }

    const manifest = this.getManifest(scope)
    const availability = this.getKnowledgeScopeAvailability(scope, manifest)
    if (this.settings.retrievalMode !== 'string' && availability === 'ready') {
      try {
        return {
          hits: await this.buildKnowledgeVectorHits(scope, query),
          runtimeModeUsed: 'vector'
        }
      } catch (error) {
        return {
          hits:
            scope === STORY_SCOPE
              ? this.buildStoryStringHits(query, 'degraded')
              : this.buildGlossaryStringHits(query, 'degraded'),
          runtimeModeUsed: 'degraded',
          fallbackReason: this.describeVectorFailure(error)
        }
      }
    }

    return {
      hits:
        scope === STORY_SCOPE
          ? this.buildStoryStringHits(
              query,
              this.settings.retrievalMode === 'string' ? 'string' : 'degraded'
            )
          : this.buildGlossaryStringHits(
              query,
              this.settings.retrievalMode === 'string' ? 'string' : 'degraded'
            ),
      runtimeModeUsed: this.settings.retrievalMode === 'string' ? 'string' : 'degraded',
      fallbackReason:
        this.settings.retrievalMode === 'string'
          ? undefined
          : this.getKnowledgeScopeCompatibilityReason(scope, availability)
    }
  }

  /**
   * @description 执行剧情调试检索。
   * @param query 查询文本。
   * @returns 剧情检索执行结果。
   */
  private async retrieveStoryDebugHits(query: string): Promise<RetrievalExecution> {
    return this.retrieveKnowledgeDebugHits(STORY_SCOPE, query)
  }

  /**
   * @description 执行名词解释调试检索。
   * @param query 查询文本。
   * @returns 名词解释检索执行结果。
   */
  private async retrieveGlossaryDebugHits(query: string): Promise<RetrievalExecution> {
    return this.retrieveKnowledgeDebugHits(GLOSSARY_SCOPE, query)
  }

  /**
   * @description 执行聊天记忆调试检索，缺少会话时返回可解释的空结果。
   * @param query 查询文本。
   * @param session 当前会话；为空时无法检索聊天记忆。
   * @returns 聊天记忆检索执行结果。
   */
  private async retrieveChatMemoryDebugHits(
    query: string,
    session: ConversationSession | null
  ): Promise<RetrievalExecution> {
    if (!this.settings.memorySearchEnabled) {
      return {
        hits: [],
        runtimeModeUsed: this.settings.retrievalMode === 'string' ? 'string' : 'degraded',
        fallbackReason: 'Chat memory retrieval is disabled in the current memory settings.'
      }
    }

    if (!session) {
      return {
        hits: [],
        runtimeModeUsed: this.settings.retrievalMode === 'string' ? 'string' : 'degraded',
        fallbackReason:
          'No matching session was found for the selected character, so chat memory cannot be inspected yet.'
      }
    }

    const compatibility = this.getMemoryCompatibility({
      targetId: this.settings.crossSessionCharacterMemory ? session.characterId : session.id,
      characterId: session.characterId,
      sessionId: session.id,
      session
    })
    if (this.settings.retrievalMode !== 'string' && compatibility.compatible) {
      try {
        return {
          hits: await this.buildChatMemoryVectorHits(query, session),
          runtimeModeUsed: 'vector'
        }
      } catch (error) {
        return {
          hits: this.buildChatMemoryStringHits(query, session, 'degraded'),
          runtimeModeUsed: 'degraded',
          fallbackReason: this.describeVectorFailure(error)
        }
      }
    }

    return {
      hits: this.buildChatMemoryStringHits(
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

  /**
   * @description 构建单个知识 scope 的调试运行摘要。
   * @param scope 知识范围。
   * @param result 检索执行结果。
   * @returns 调试页可展示的运行摘要。
   */
  private buildRuntimeSummary(
    scope: MemoryKnowledgeScope,
    result: RetrievalExecution
  ): MemoryDebugRuntimeDetail {
    const manifest = this.getManifest(scope)
    return {
      scope,
      enabled: this.settings.worldSearchEnabled,
      indexAvailability: this.getKnowledgeScopeAvailability(scope, manifest),
      retrievalModeUsed: result.runtimeModeUsed,
      resultCount: result.hits.length,
      fallbackReason: result.fallbackReason
    }
  }

  /**
   * @description 构建聊天记忆检索的调试运行摘要。
   * @param result 检索执行结果。
   * @param session 当前调试或预览使用的会话。
   * @returns 聊天记忆运行摘要。
   */
  private buildChatMemoryRuntimeSummary(
    result: RetrievalExecution,
    session: ConversationSession | null
  ): MemoryDebugRuntimeDetail {
    const memoryIndex = this.buildMemoryIndexStatus(
      session
        ? {
            characterId: session.characterId,
            sessionId: session.id
          }
        : null
    )
    return {
      scope: 'chat-memory',
      enabled: this.settings.memorySearchEnabled,
      indexAvailability: memoryIndex.availability,
      retrievalModeUsed: result.runtimeModeUsed,
      resultCount: result.hits.length,
      fallbackReason: result.fallbackReason,
      targetCharacterId: memoryIndex.targetCharacterId || null,
      targetSessionId: memoryIndex.targetSessionId || null
    }
  }

  /**
   * @description 生成知识 scope 从向量检索降级到字符串匹配的原因。
   * @param scope 知识范围。
   * @param availability 当前可用性状态。
   * @returns 面向调试界面的降级说明。
   */
  private getKnowledgeScopeCompatibilityReason(
    scope: MemoryKnowledgeScope,
    availability: WorldIndexStatus['availability']
  ): string {
    const scopeLabel = scope === STORY_SCOPE ? 'Story' : 'Glossary'
    if (availability === 'missing') {
      return `${scopeLabel} vector index is missing, so the query fell back to keyword matching.`
    }

    if (availability === 'failed') {
      return `${scopeLabel} vector index is marked as failed, so the query fell back to keyword matching.`
    }

    if (availability === 'building') {
      return `${scopeLabel} vector index is still building, so the query fell back to keyword matching.`
    }

    return `${scopeLabel} vector retrieval is unavailable, so the query fell back to keyword matching.`
  }

  private getMemoryCompatibilityReason(
    compatibility: EmbeddingCompatibilityStatus,
    session: ConversationSession
  ): string {
    const memoryIndex = this.buildMemoryIndexStatus({
      characterId: session.characterId,
      sessionId: session.id
    })
    if (memoryIndex.availability === 'missing') {
      return 'Chat memory index is missing, so the query fell back to keyword matching.'
    }

    if (memoryIndex.availability === 'failed') {
      return 'Chat memory index is marked as failed, so the query fell back to keyword matching.'
    }

    if (memoryIndex.availability === 'building') {
      return 'Chat memory index is still building, so the query fell back to keyword matching.'
    }

    return (
      compatibility.message ||
      'Chat memory vector retrieval is unavailable, so the query fell back to keyword matching.'
    )
  }

  /**
   * @description 为已命中的名词解释追加少量被其解释文本引用的嵌套词条。
   * @param hits 初始名词解释命中。
   * @param retrievalModeUsed 本次检索实际采用的运行模式。
   * @returns 已补充引用词条并重新编号的命中列表。
   */
  private expandGlossaryHits(
    hits: MemoryDebugRetrievalHit[],
    retrievalModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    if (hits.length === 0) {
      return hits
    }

    const glossaryEntriesByTerm = new Map(
      this.glossaryEntries
        .map((entry) => [entry.term?.trim(), entry] as const)
        .filter(([term]) => term)
    )
    const usedIds = new Set(hits.map((hit) => hit.id))
    const expanded = [...hits]

    for (const hit of hits) {
      if (expanded.length >= hits.length + GLOSSARY_REFERENCE_LIMIT) {
        break
      }

      const entry = this.glossaryEntries.find((item) => item.id === hit.id)
      for (const reference of entry?.references || []) {
        if (expanded.length >= hits.length + GLOSSARY_REFERENCE_LIMIT) {
          break
        }

        const linkedEntry = glossaryEntriesByTerm.get(reference)
        if (!linkedEntry || usedIds.has(linkedEntry.id)) {
          continue
        }

        usedIds.add(linkedEntry.id)
        expanded.push({
          id: linkedEntry.id,
          scope: 'glossary',
          text: linkedEntry.text,
          score: Math.max(hit.score - 0.001 * expanded.length, 0),
          rank: expanded.length + 1,
          retrievalModeUsed,
          sourceType: linkedEntry.sourceType,
          sourcePath: linkedEntry.sourcePath || null,
          term: linkedEntry.term || null
        })
      }
    }

    return expanded.map((item, index) => ({
      ...item,
      rank: index + 1
    }))
  }

  /**
   * @description 将运行时向量检索异常转换为可展示的降级说明。
   * @param error 捕获到的异常。
   * @returns 降级原因文本。
   */
  private describeVectorFailure(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return `Vector retrieval failed at runtime, so the query fell back to keyword matching. ${message}`
  }

  /**
   * @description 按当前 memory 设置解析界面选中的角色 / 会话目标，统一角色聚合与单会话模式下的 target 语义。
   * @param selection 设置页或调试页传入的角色 / 会话选择。
   * @returns 已补齐真实 targetId、角色、会话与可用 session 的解析结果。
   */
  private resolveMemoryTarget(selection?: MemoryTargetSelection | null): MemoryResolvedTarget {
    const requestedCharacterId = selection?.characterId || null
    const requestedSessionId = selection?.sessionId || null
    const selectedSession = requestedSessionId
      ? this.sessions.find((item) => item.id === requestedSessionId) || null
      : null
    const session =
      selectedSession &&
      (!requestedCharacterId || selectedSession.characterId === requestedCharacterId)
        ? selectedSession
        : null
    const characterId = requestedCharacterId || session?.characterId || null
    const resolvedSession =
      session ||
      (this.settings.crossSessionCharacterMemory
        ? this.resolveLatestSessionForCharacter(characterId)
        : null)
    const sessionId = session?.id || null

    return {
      targetId: this.settings.crossSessionCharacterMemory ? characterId : sessionId,
      characterId,
      sessionId,
      session: resolvedSession
    }
  }

  /**
   * @description 查找指定角色最近更新的一条会话，供跨会话角色记忆模式下补全上下文目标。
   * @param characterId 角色 ID。
   * @returns 最近会话；若不存在则返回 `null`。
   */
  private resolveLatestSessionForCharacter(characterId: string | null): ConversationSession | null {
    if (!characterId) {
      return null
    }

    return (
      this.sessions
        .filter((item) => item.characterId === characterId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] || null
    )
  }

  private resolveDebugSession(
    characterId: string | null,
    sessionId: string | null
  ): ConversationSession | null {
    return this.resolveMemoryTarget({ characterId, sessionId }).session
  }

  /**
   * @description 统计当前 memory 目标下可用于检索的记忆条目数。
   * @param resolvedTarget 已解析出的 memory 目标。
   * @returns 目标范围内的记忆条目数量。
   */
  private countMemoryEntries(resolvedTarget: MemoryResolvedTarget): number {
    if (!resolvedTarget.targetId) {
      return 0
    }

    return this.getRepository().countMemoryEntries(
      resolvedTarget.targetId,
      this.settings.crossSessionCharacterMemory
    )
  }

  private countIndexedCharacters(): number {
    return this.getRepository().countIndexedCharacters()
  }

  private shouldClearLocalEmbeddingPipelines(
    previousSettings: MemorySettingsStore,
    nextSettings: MemorySettingsStore
  ): boolean {
    const previousUsesLocal = previousSettings.retrievalMode === 'vector-local'
    const nextUsesLocal = nextSettings.retrievalMode === 'vector-local'

    if (!previousUsesLocal && !nextUsesLocal) {
      return false
    }

    return (
      previousSettings.retrievalMode !== nextSettings.retrievalMode ||
      previousSettings.localEmbedding.model !== nextSettings.localEmbedding.model ||
      previousSettings.localEmbedding.modelPath !== nextSettings.localEmbedding.modelPath ||
      previousSettings.localEmbedding.useGpu !== nextSettings.localEmbedding.useGpu ||
      previousSettings.localEmbedding.useHuggingFaceMirror !==
        nextSettings.localEmbedding.useHuggingFaceMirror ||
      previousSettings.localEmbedding.huggingFaceMirrorUrl !==
        nextSettings.localEmbedding.huggingFaceMirrorUrl
    )
  }

  private async clearLocalEmbeddingPipelines(): Promise<void> {
    const { clearAllPipelineCaches } = await this.getLocalEmbeddingModule()
    clearAllPipelineCaches()
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
