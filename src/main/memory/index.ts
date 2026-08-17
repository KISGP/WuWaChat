import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { DatabaseSync } from 'node:sqlite'
import type { ConversationSession, MemoryEntry } from '@shared/chat'
import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  EmbeddingConnectionTestResult,
  EmbeddingFingerprint,
  InstalledLocalEmbeddingModel,
  LocalEmbeddingCatalogItem,
  MemoryDebugRetrievalHit,
  MemoryDebugRuntimeDetail,
  MemoryHardwareInfo,
  MemorySettingsStore,
  MemoryStatusSnapshot,
  MemoryTargetSelection,
  MemoryTask,
  MemoryTaskEvent
} from '@shared/memory-settings'
import {
  createDefaultMemorySettingsStore,
  normalizeMemorySettingsStore
} from '@shared/memory-settings'
import {
  createLocalEmbeddingFingerprint,
  isSameEmbeddingFingerprint
} from '@main/embedding/fingerprint'
import type { EmbeddingBatchProgress, EmbeddingProvider } from '@main/embedding/types'
import { logger } from '@main/logging'
import { runMonitoredTask } from '@main/observability/monitored-task'
import { getUnifiedSettingsStore } from '@main/settings/store'
import { getIndexRuntimeMode, getMemoryDatabasePath, now } from '@main/utils'
import { readMemoryHardwareInfo } from './hardware'
import type { RetrievalExecution } from './internal-types'
import { MemoryIndexRepository } from './index-repository'
import { RetrievalQueryService } from './retrieval-query-service'
import { MemoryWorkerClient } from './worker-client'
import { MemoryWorkerRuntime } from './worker-runtime'

type LocalEmbeddingModule = typeof import('../embedding/local')

const MEMORY_SCOPE = 'character-memory'

type TaskCancellationState = {
  controller: AbortController
  throwIfCancelled: () => void
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

/**
 * @description 管理角色长期记忆、其向量索引及本地 embedding 模型。
 * @remarks 原作 Lore 检索不属于本服务；原作资料和向量由 `LoreService` 独立管理。
 */
export class MemoryService {
  private settings = createDefaultMemorySettingsStore()
  private sessions: ConversationSession[] = []
  private tasks = new Map<string, MemoryTask>()
  private initialized = false
  private settingsPromise: Promise<void> | null = null
  private initializationPromise: Promise<void> | null = null
  private db: DatabaseSync | null = null
  private repository: MemoryIndexRepository | null = null
  private taskCancellationStates = new Map<string, TaskCancellationState>()
  private localEmbeddingModulePromise: Promise<LocalEmbeddingModule> | null = null
  private hardwareInfoPromise: Promise<MemoryHardwareInfo> | null = null
  private readonly retrievalQueryService = new RetrievalQueryService()
  private readonly workerClient = new MemoryWorkerClient(
    new MemoryWorkerRuntime(this.retrievalQueryService)
  )

  /**
   * @description 加载记忆设置，不初始化数据库或 embedding 运行时。
   */
  async initializeSettings(): Promise<void> {
    await this.ensureSettingsLoaded()
  }

  /**
   * @description 初始化角色长期记忆的本地 SQLite 缓存。
   */
  async initialize(): Promise<void> {
    await this.ensureInitialized('manual')
  }

  /**
   * @description 替换当前会话快照，供角色记忆构建和检索使用。
   * @param sessions 当前所有会话。
   */
  setSessions(sessions: ConversationSession[]): void {
    this.sessions = sessions
  }

  /**
   * @description 同步最新会话快照。
   * @param sessions 当前所有会话。
   */
  syncSessions(sessions: ConversationSession[]): void {
    this.setSessions(sessions)
  }

  /**
   * @description 返回当前生效的记忆设置。
   * @returns 内存中的设置快照。
   */
  getSettings(): MemorySettingsStore {
    return this.settings
  }

  /**
   * @description 保存角色记忆与 Lore 共用的检索设置。
   * @param store 待保存设置。
   * @returns 已规范化并持久化的设置。
   */
  async saveSettings(store: MemorySettingsStore): Promise<MemorySettingsStore> {
    await this.ensureSettingsLoaded()
    const previous = this.settings
    this.settings = normalizeMemorySettingsStore(store)
    await this.persistSettings()
    if (this.shouldClearLocalEmbeddingPipelines(previous, this.settings)) {
      await this.clearLocalEmbeddingPipelines()
    }
    return this.settings
  }

  /**
   * @description 获取本地 embedding 模型目录及安装状态。
   * @returns 可供选择的本地模型。
   */
  async listLocalModels(): Promise<LocalEmbeddingCatalogItem[]> {
    await this.ensureInitialized('memory-local-models')
    const { listLocalEmbeddingModels } = await this.getLocalEmbeddingModule()
    return listLocalEmbeddingModels(this.settings.localEmbedding.model)
  }

  /**
   * @description 在后台下载指定本地 embedding 模型。
   * @param modelId 模型标识。
   * @returns 已创建的下载任务。
   */
  async downloadLocalModel(modelId: string): Promise<MemoryTask> {
    await this.ensureInitialized('memory-build')
    return this.runTask(
      'local-model-download',
      'character-memory',
      async (taskId, updateTask) => {
        const { downloadLocalEmbeddingModel } = await this.getLocalEmbeddingModule()
        const installed = await downloadLocalEmbeddingModel(
          modelId,
          this.settings.localEmbedding,
          (progress, message) =>
            updateTask(taskId, { progress: Math.max(5, progress), message, characterId: modelId })
        )
        if (
          !this.settings.localEmbedding.modelPath ||
          this.settings.localEmbedding.model === modelId
        ) {
          this.settings = normalizeMemorySettingsStore({
            ...this.settings,
            localEmbedding: {
              ...this.settings.localEmbedding,
              model: installed.id,
              modelPath: installed.modelPath,
              dimensions: installed.dimensions
            }
          })
          await this.persistSettings()
        }
      },
      modelId
    )
  }

  /**
   * @description 选择已安装的本地 embedding 模型。
   * @param modelId 模型标识。
   * @returns 更新后的设置。
   */
  async selectLocalModel(modelId: string): Promise<MemorySettingsStore> {
    await this.ensureInitialized('memory-local-models')
    const { getInstalledLocalEmbeddingModel } = await this.getLocalEmbeddingModule()
    const installed = await getInstalledLocalEmbeddingModel(modelId)
    if (!installed) {
      throw new Error('Selected local embedding model is not installed or is invalid.')
    }
    this.settings = normalizeMemorySettingsStore({
      ...this.settings,
      localEmbedding: {
        ...this.settings.localEmbedding,
        model: installed.id,
        modelPath: installed.modelPath,
        dimensions: installed.dimensions
      }
    })
    await this.persistSettings()
    await this.clearLocalEmbeddingPipelines()
    return this.settings
  }

  /**
   * @description 删除指定本地 embedding 模型并清理运行时缓存。
   * @param modelId 模型标识。
   * @returns 删除成功时返回 `true`。
   */
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
        localEmbedding: { ...this.settings.localEmbedding, modelPath: '' }
      })
      await this.persistSettings()
    }
    await this.clearLocalEmbeddingPipelines()
    return true
  }

  /**
   * @description 测试当前 embedding 配置能否正常工作。
   * @returns 连通性和延迟结果。
   */
  async testEmbeddingConnection(): Promise<EmbeddingConnectionTestResult> {
    await this.ensureInitialized('memory-embedding')
    return (await this.requireActiveEmbeddingProvider()).testConnection()
  }

  /**
   * @description 获取当前角色记忆索引与 embedding 配置的兼容性。
   * @param selection 当前设置页选择的角色或会话。
   * @returns 角色记忆兼容性列表。
   */
  async getEmbeddingCompatibility(
    selection?: MemoryTargetSelection | null
  ): Promise<EmbeddingCompatibilityStatus[]> {
    await this.ensureInitialized('memory-ipc')
    return [this.getMemoryCompatibility(this.resolveMemoryTarget(selection))]
  }

  /**
   * @description 获取指定角色或会话的角色记忆索引状态。
   * @param selection 当前设置页选择的角色或会话。
   * @returns 对应的索引状态。
   */
  async getMemoryIndexStatus(
    selection?: MemoryTargetSelection | null
  ): Promise<CharacterMemoryIndexStatus> {
    await this.ensureInitialized('memory-ipc')
    return this.buildMemoryIndexStatus(selection)
  }

  /**
   * @description 获取角色记忆设置页所需状态快照。
   * @param selection 当前设置页选择的角色或会话。
   * @returns 设置、角色记忆索引、任务和硬件状态。
   */
  async getStatus(selection?: MemoryTargetSelection | null): Promise<MemoryStatusSnapshot> {
    await this.ensureInitialized('memory-status')
    return {
      settings: this.settings,
      memoryIndex: this.buildMemoryIndexStatus(selection),
      tasks: this.getTasks(),
      hardware: await this.getHardwareInfo()
    }
  }

  /**
   * @description 为一个角色构建长期记忆向量索引。
   * @param characterId 角色标识。
   * @returns 已创建的构建任务。
   */
  async startCharacterMemoryBuild(characterId: string): Promise<MemoryTask> {
    await this.ensureInitialized('memory-build')
    return this.runTask(
      'character-memory-build',
      'character-memory',
      (taskId, updateTask, control) =>
        this.buildCharacterMemoryIndex(characterId, taskId, updateTask, control),
      characterId
    )
  }

  /**
   * @description 为所有已聊天角色依次构建长期记忆向量索引。
   * @returns 已创建的批量构建任务。
   */
  async startAllMemoryBuild(): Promise<MemoryTask> {
    await this.ensureInitialized('memory-build')
    return this.runTask(
      'all-memory-build',
      'character-memory',
      async (taskId, updateTask, control) => {
        const characterIds = [...new Set(this.sessions.map((session) => session.characterId))]
        for (let index = 0; index < characterIds.length; index += 1) {
          control.throwIfCancelled()
          const start = Math.round((index / Math.max(characterIds.length, 1)) * 100)
          const end = Math.round(((index + 1) / Math.max(characterIds.length, 1)) * 100)
          await this.buildCharacterMemoryIndex(
            characterIds[index],
            taskId,
            updateTask,
            control,
            start,
            end
          )
        }
        updateTask(taskId, { progress: 100, message: 'All character memory indices rebuilt' })
      }
    )
  }

  /**
   * @description 请求取消仍在执行中的角色记忆任务。
   * @param taskId 任务标识。
   * @returns 成功取消时返回 `true`。
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) {
      return false
    }
    this.taskCancellationStates.get(taskId)?.controller.abort()
    this.updateTask(taskId, { status: 'cancelled', message: 'Task cancelled' })
    return true
  }

  /**
   * @description 检索当前会话可访问的角色长期记忆上下文。
   * @param query 用户输入。
   * @param session 当前聊天会话。
   * @returns 记忆命中。
   */
  async retrieveChatMemoryContext(
    query: string,
    session: ConversationSession
  ): Promise<MemoryDebugRetrievalHit[]> {
    await this.ensureInitialized('chat-memory-retrieval')
    return (await this.retrieveChatMemoryDebugHits(query, session)).hits
  }

  /**
   * @description 预览角色长期记忆检索，不触发模型调用或会话写入。
   * @param query 当前模拟输入。
   * @param session 当前会话；为空时返回可解释的空结果。
   * @returns 命中与运行时状态。
   */
  async previewChatMemoryContext(
    query: string,
    session: ConversationSession | null
  ): Promise<{ hits: MemoryDebugRetrievalHit[]; runtimeDetail: MemoryDebugRuntimeDetail }> {
    await this.ensureInitialized('memory-debug')
    const result = await this.retrieveChatMemoryDebugHits(query.trim(), session)
    return { hits: result.hits, runtimeDetail: this.buildChatMemoryRuntimeSummary(result, session) }
  }

  /**
   * @description 为 Lore 原作向量提供当前 embedding provider。
   * @returns 当前可用的向量 provider。
   */
  async getLoreEmbeddingProvider(): Promise<EmbeddingProvider> {
    await this.ensureInitialized('memory-embedding')
    return this.requireLoreEmbeddingProvider()
  }

  /**
   * @description 为 Lore 原作向量提供当前 embedding 指纹。
   * @param dimensions 实际生成的向量维度。
   * @returns 当前 provider 的指纹。
   */
  async getLoreEmbeddingFingerprint(dimensions?: number): Promise<EmbeddingFingerprint> {
    await this.ensureInitialized('memory-embedding')
    return this.createLoreEmbeddingFingerprint(dimensions)
  }

  /**
   * @description 获取聊天上下文中保留的近期消息数量。
   * @returns 近期消息数量。
   */
  getRecentMessageCount(): number {
    return this.settings.recentMessageCount
  }

  /** @description 确保记忆设置已加载。 */
  private async ensureSettingsLoaded(): Promise<void> {
    if (!this.settingsPromise) {
      this.settingsPromise = getUnifiedSettingsStore()
        .get()
        .then((store) => {
          this.settings = store.memory
        })
    }
    await this.settingsPromise
  }

  /**
   * @description 初始化角色记忆数据库。
   * @param trigger 触发初始化的调用路径，用于日志。
   */
  private async ensureInitialized(trigger: string): Promise<void> {
    if (this.initialized) {
      return
    }
    await this.ensureSettingsLoaded()
    if (!this.initializationPromise) {
      this.initializationPromise = Promise.resolve().then(() => {
        this.db = new DatabaseSync(getMemoryDatabasePath())
        this.repository = new MemoryIndexRepository(this.db)
        this.repository.prepareDatabase()
        this.initialized = true
        void logger.info('memory', 'initialized', 'Character memory service initialized', {
          trigger
        })
      })
    }
    await this.initializationPromise
  }

  /**
   * @description 生成单个角色的记忆向量并写入本地索引。
   * @param characterId 角色标识。
   * @param taskId 当前任务标识。
   * @param updateTask 任务状态更新回调。
   * @param control 任务取消控制器。
   * @param start 进度起点。
   * @param end 进度终点。
   */
  private async buildCharacterMemoryIndex(
    characterId: string,
    taskId: string,
    updateTask: (taskId: string, patch: Partial<MemoryTask>) => void,
    control: TaskCancellationState,
    start = 15,
    end = 100
  ): Promise<void> {
    control.throwIfCancelled()
    const entries = this.buildCharacterMemoryEntries(characterId)
    const provider = await this.requireVectorEmbeddingProvider()
    const result = await this.workerClient.buildVectorIndex({
      type: 'build-character-memory-vectors',
      entries,
      provider,
      createFingerprint: (dimensions) => this.createActiveEmbeddingFingerprint(dimensions),
      embedOptions: {
        abortSignal: control.controller.signal,
        throwIfAborted: control.throwIfCancelled,
        onProgress: (progress) =>
          updateTask(taskId, {
            progress: this.mapEmbeddingProgress(progress, start, Math.max(start, end - 15)),
            message: 'Generating character memory embeddings',
            characterId
          })
      }
    })
    control.throwIfCancelled()
    this.getRepository().saveCharacterMemoryVectors(
      characterId,
      entries,
      result.data.vectors,
      result.data.fingerprint
    )
    updateTask(taskId, { progress: end, message: 'Character memory rebuilt', characterId })
  }

  /**
   * @description 构建角色现有会话的长期记忆条目。
   * @param characterId 角色标识。
   * @returns 可用于检索和向量化的记忆条目。
   */
  private buildCharacterMemoryEntries(characterId: string): MemoryEntry[] {
    return this.sessions
      .filter((session) => session.characterId === characterId)
      .flatMap((session) => {
        const messages = session.messages.filter((message) => Boolean(message.content.trim()))
        const recent = messages.slice(-Math.max(this.settings.summaryTriggerTurns, 4))
        return recent.length === 0
          ? []
          : [
              {
                id: `memory:${characterId}:${session.id}`,
                text: recent
                  .map(
                    (message) =>
                      `${message.role === 'user' ? 'User' : 'Character'}: ${message.content}`
                  )
                  .join('\n'),
                sourceType: 'summary' as const,
                characterId,
                sessionId: session.id,
                createdAt: session.updatedAt,
                updatedAt: session.updatedAt,
                visibility: 'private' as const
              }
            ]
      })
  }

  /**
   * @description 按会话范围筛选当前可访问的角色记忆条目。
   * @param session 当前聊天会话。
   * @returns 当前检索范围内的记忆条目。
   */
  private getMemoryEntriesForSession(session: ConversationSession): MemoryEntry[] {
    return this.buildCharacterMemoryEntries(session.characterId).filter(
      (entry) => this.settings.crossSessionCharacterMemory || entry.sessionId === session.id
    )
  }

  /**
   * @description 执行角色长期记忆检索，向量不可用时回退字符串匹配。
   * @param query 用户查询。
   * @param session 当前会话；为空时无法检索。
   * @returns 检索结果和运行状态。
   */
  private async retrieveChatMemoryDebugHits(
    query: string,
    session: ConversationSession | null
  ): Promise<RetrievalExecution> {
    if (!this.settings.memorySearchEnabled) {
      return {
        hits: [],
        runtimeModeUsed: 'string',
        fallbackReason: 'Chat memory retrieval is disabled.'
      }
    }
    if (!session) {
      return {
        hits: [],
        runtimeModeUsed: 'string',
        fallbackReason: 'No matching chat session is available.'
      }
    }
    const compatibility = this.getMemoryCompatibility(
      this.resolveMemoryTarget({
        characterId: session.characterId,
        sessionId: session.id
      })
    )
    if (this.settings.retrievalMode === 'vector-local' && compatibility.compatible) {
      try {
        return {
          hits: await this.buildChatMemoryVectorHits(session, query),
          runtimeModeUsed: 'vector'
        }
      } catch (error) {
        return {
          hits: this.buildChatMemoryStringHits(session, query, 'degraded'),
          runtimeModeUsed: 'degraded',
          fallbackReason: error instanceof Error ? error.message : String(error)
        }
      }
    }
    const availability = this.buildMemoryIndexStatus({
      characterId: session.characterId,
      sessionId: session.id
    }).availability
    return {
      hits: this.buildChatMemoryStringHits(
        session,
        query,
        getIndexRuntimeMode(this.settings.retrievalMode, availability)
      ),
      runtimeModeUsed: getIndexRuntimeMode(this.settings.retrievalMode, availability),
      fallbackReason: this.settings.retrievalMode === 'string' ? undefined : compatibility.message
    }
  }

  /**
   * @description 使用本地向量缓存检索角色长期记忆。
   * @param session 当前聊天会话。
   * @param query 用户查询。
   * @returns 向量检索命中。
   */
  private async buildChatMemoryVectorHits(
    session: ConversationSession,
    query: string
  ): Promise<MemoryDebugRetrievalHit[]> {
    const targetId = this.settings.crossSessionCharacterMemory ? session.characterId : session.id
    const manifest = this.getRepository().getManifest(targetId)
    if (!manifest) {
      return []
    }
    const provider = await this.requireVectorEmbeddingProvider()
    return (
      await this.workerClient.retrieveMemoryVectorHits({
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
    ).data
  }

  /**
   * @description 使用字符串匹配检索角色长期记忆。
   * @param session 当前聊天会话。
   * @param query 用户查询。
   * @param mode 实际检索模式。
   * @returns 字符串检索命中。
   */
  private buildChatMemoryStringHits(
    session: ConversationSession,
    query: string,
    mode: RetrievalExecution['runtimeModeUsed']
  ): MemoryDebugRetrievalHit[] {
    return this.retrievalQueryService.buildChatMemoryStringHits(
      query,
      this.getMemoryEntriesForSession(session),
      this.settings.memoryTopK,
      mode
    )
  }

  /**
   * @description 生成聊天记忆调试状态。
   * @param result 检索执行结果。
   * @param session 当前会话。
   * @returns 可供提示词预览展示的状态。
   */
  private buildChatMemoryRuntimeSummary(
    result: RetrievalExecution,
    session: ConversationSession | null
  ): MemoryDebugRuntimeDetail {
    const index = this.buildMemoryIndexStatus(
      session ? { characterId: session.characterId, sessionId: session.id } : null
    )
    return {
      scope: 'chat-memory',
      enabled: this.settings.memorySearchEnabled,
      indexAvailability: index.availability,
      retrievalModeUsed: result.runtimeModeUsed,
      resultCount: result.hits.length,
      fallbackReason: result.fallbackReason,
      targetCharacterId: index.targetCharacterId || null,
      targetSessionId: index.targetSessionId || null
    }
  }

  /**
   * @description 构建设置页展示的角色记忆索引状态。
   * @param selection 当前查看的角色或会话。
   * @returns 角色记忆索引状态。
   */
  private buildMemoryIndexStatus(
    selection?: MemoryTargetSelection | null
  ): CharacterMemoryIndexStatus {
    const target = this.resolveMemoryTarget(selection)
    const manifest = target.targetId ? this.getRepository().getManifest(target.targetId) : null
    const compatibility = this.getMemoryCompatibility(target)
    const availability = this.getMemoryAvailability(manifest, compatibility)
    return {
      scope: MEMORY_SCOPE,
      characterId: target.characterId,
      targetCharacterId: target.characterId,
      targetSessionId: target.sessionId,
      availability,
      runtimeMode: getIndexRuntimeMode(this.settings.retrievalMode, availability),
      entryCount: manifest?.entryCount || this.countMemoryEntries(target),
      indexedCharacterCount: this.getRepository().countIndexedCharacters(),
      fingerprint: manifest ? this.getRepository().fingerprintFromManifest(manifest) : null,
      builtAt: manifest?.builtAt || null
    }
  }

  /**
   * @description 获取角色记忆索引与当前 embedding 设置的兼容性。
   * @param target 已解析的角色或会话目标。
   * @returns embedding 兼容性说明。
   */
  private getMemoryCompatibility(target: MemoryResolvedTarget): EmbeddingCompatibilityStatus {
    const manifest = target.targetId ? this.getRepository().getManifest(target.targetId) : null
    const active = manifest ? this.getRepository().fingerprintFromManifest(manifest) : null
    const expected = this.getExpectedFingerprint()
    const compatible =
      this.settings.retrievalMode === 'string' || isSameEmbeddingFingerprint(active, expected)
    return {
      scope: MEMORY_SCOPE,
      targetId: target.targetId,
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
   * @description 判断角色记忆索引的当前可用性。
   * @param manifest 当前索引 manifest。
   * @param compatibility embedding 兼容性。
   * @returns 索引可用性。
   */
  private getMemoryAvailability(
    manifest: import('@shared/memory-settings').IndexManifestRecord | null,
    compatibility: EmbeddingCompatibilityStatus
  ): CharacterMemoryIndexStatus['availability'] {
    if (this.getTasks().some((task) => task.status === 'queued' || task.status === 'running')) {
      return 'building'
    }
    if (this.settings.retrievalMode === 'string') {
      return manifest ? 'ready' : 'missing'
    }
    if (!manifest) {
      return 'missing'
    }
    return manifest.status === 'failed'
      ? 'failed'
      : compatibility.compatible
        ? 'ready'
        : 'incompatible'
  }

  /**
   * @description 解析角色聚合或会话级的记忆检索目标。
   * @param selection 请求中的角色或会话选择。
   * @returns 补齐后的检索目标。
   */
  private resolveMemoryTarget(selection?: MemoryTargetSelection | null): MemoryResolvedTarget {
    const selected = selection?.sessionId
      ? this.sessions.find((session) => session.id === selection.sessionId) || null
      : null
    const characterId = selection?.characterId || selected?.characterId || null
    const session =
      selected ||
      (this.settings.crossSessionCharacterMemory ? this.findLatestSession(characterId) : null)
    return {
      targetId: this.settings.crossSessionCharacterMemory ? characterId : selected?.id || null,
      characterId,
      sessionId: selected?.id || null,
      session
    }
  }

  /**
   * @description 查找一个角色最近更新的会话。
   * @param characterId 角色标识。
   * @returns 最近会话；不存在时返回 `null`。
   */
  private findLatestSession(characterId: string | null): ConversationSession | null {
    if (!characterId) {
      return null
    }
    return (
      this.sessions
        .filter((session) => session.characterId === characterId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] || null
    )
  }

  /**
   * @description 统计当前目标可访问的角色记忆条目。
   * @param target 已解析目标。
   * @returns 条目数量。
   */
  private countMemoryEntries(target: MemoryResolvedTarget): number {
    return target.targetId
      ? this.getRepository().countMemoryEntries(
          target.targetId,
          this.settings.crossSessionCharacterMemory
        )
      : 0
  }

  /**
   * @description 读取并缓存本机硬件信息。
   * @returns GPU 信息。
   */
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

  /** @description 返回当前任务列表并按更新时间降序排列。 */
  private getTasks(): MemoryTask[] {
    return [...this.tasks.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    )
  }

  /** @description 返回已初始化的角色记忆仓库。 */
  private getRepository(): MemoryIndexRepository {
    if (!this.repository) {
      throw new Error('Memory index repository is not initialized.')
    }
    return this.repository
  }

  /** @description 将当前设置持久化到统一设置存储。 */
  private async persistSettings(): Promise<void> {
    this.settings = await getUnifiedSettingsStore().update(
      'memory',
      normalizeMemorySettingsStore(this.settings)
    )
  }

  /**
   * @description 判断 local embedding 运行时缓存是否需因设置变更而清除。
   * @param previous 旧设置。
   * @param next 新设置。
   * @returns 需要清理时返回 `true`。
   */
  private shouldClearLocalEmbeddingPipelines(
    previous: MemorySettingsStore,
    next: MemorySettingsStore
  ): boolean {
    return (
      previous.retrievalMode !== next.retrievalMode ||
      previous.localEmbedding.model !== next.localEmbedding.model ||
      previous.localEmbedding.modelPath !== next.localEmbedding.modelPath ||
      previous.localEmbedding.useGpu !== next.localEmbedding.useGpu
    )
  }

  /** @description 清空本地 embedding pipeline 缓存。 */
  private async clearLocalEmbeddingPipelines(): Promise<void> {
    const { clearAllPipelineCaches } = await this.getLocalEmbeddingModule()
    clearAllPipelineCaches()
  }

  /** @description 延迟加载本地 embedding 模块。 */
  private async getLocalEmbeddingModule(): Promise<LocalEmbeddingModule> {
    if (!this.localEmbeddingModulePromise) {
      this.localEmbeddingModulePromise = import('../embedding/local')
    }
    return this.localEmbeddingModulePromise
  }

  /**
   * @description 获取当前选择且已安装的本地 embedding 模型。
   * @returns 已安装模型。
   */
  private async requireInstalledLocalModel(
    requireMemoryVectorMode = true
  ): Promise<InstalledLocalEmbeddingModel> {
    if (requireMemoryVectorMode && this.settings.retrievalMode !== 'vector-local') {
      throw new Error('Local embeddings are only available in vector-local mode.')
    }
    const { getInstalledLocalEmbeddingModel } = await this.getLocalEmbeddingModule()
    const model = await getInstalledLocalEmbeddingModel(this.settings.localEmbedding.model)
    if (!model) {
      throw new Error('Selected local embedding model is not installed or is invalid.')
    }
    return model
  }

  /** @description 创建当前本地 embedding provider。 */
  private async requireVectorEmbeddingProvider(): Promise<EmbeddingProvider> {
    const model = await this.requireInstalledLocalModel()
    const { LocalEmbeddingProvider } = await this.getLocalEmbeddingModule()
    return new LocalEmbeddingProvider(model, this.settings.localEmbedding)
  }

  /**
   * @description 创建 Lore 任务语义候选索引使用的 embedding provider，不受角色记忆检索模式限制。
   * @returns 已安装本地 embedding 模型对应的 provider。
   */
  private async requireLoreEmbeddingProvider(): Promise<EmbeddingProvider> {
    const model = await this.requireInstalledLocalModel(false)
    const { LocalEmbeddingProvider } = await this.getLocalEmbeddingModule()
    return new LocalEmbeddingProvider(model, this.settings.localEmbedding)
  }

  /** @description 获取当前可用于连接测试的 embedding provider。 */
  private async requireActiveEmbeddingProvider(): Promise<EmbeddingProvider> {
    if (this.settings.retrievalMode === 'string') {
      throw new Error('Embedding connection test is only available in vector modes.')
    }
    return this.requireVectorEmbeddingProvider()
  }

  /**
   * @description 依据当前本地 embedding 模型生成指纹。
   * @param dimensions 实际向量维度。
   * @returns 当前 embedding 指纹。
   */
  private async createActiveEmbeddingFingerprint(
    dimensions?: number
  ): Promise<EmbeddingFingerprint> {
    const model = await this.requireInstalledLocalModel()
    return createLocalEmbeddingFingerprint({
      id: model.id,
      repoId: model.repoId,
      installedAt: now(),
      dimensions: dimensions || model.dimensions,
      runtime: model.runtime
    })
  }

  /**
   * @description 依据已安装本地模型创建 Lore 任务语义索引使用的指纹。
   * @param dimensions 实际生成的向量维度。
   * @returns 当前 Lore embedding 指纹。
   */
  private async createLoreEmbeddingFingerprint(
    dimensions?: number
  ): Promise<EmbeddingFingerprint> {
    const model = await this.requireInstalledLocalModel(false)
    return createLocalEmbeddingFingerprint({
      id: model.id,
      repoId: model.repoId,
      installedAt: now(),
      dimensions: dimensions || model.dimensions,
      runtime: model.runtime
    })
  }

  /** @description 依据当前设置预测激活 embedding 指纹。 */
  private getExpectedFingerprint(): EmbeddingFingerprint | null {
    return this.settings.retrievalMode === 'vector-local' && this.settings.localEmbedding.modelPath
      ? createLocalEmbeddingFingerprint({
          id: this.settings.localEmbedding.model,
          repoId: this.settings.localEmbedding.model,
          installedAt: now(),
          dimensions: this.settings.localEmbedding.dimensions || 0,
          runtime: 'transformers-js'
        })
      : null
  }

  /**
   * @description 将 embedding 批处理进度映射到任务进度区间。
   * @param progress embedding 批处理进度。
   * @param start 任务进度起点。
   * @param end 任务进度终点。
   * @returns 映射后的百分比。
   */
  private mapEmbeddingProgress(
    progress: EmbeddingBatchProgress,
    start: number,
    end: number
  ): number {
    const ratio =
      progress.total > 0 ? Math.max(0, Math.min(progress.completed / progress.total, 1)) : 1
    return Math.round(start + (end - start) * ratio)
  }

  /**
   * @description 创建并异步执行角色记忆后台任务。
   * @param taskType 任务类型。
   * @param scope 任务范围。
   * @param callback 具体任务逻辑。
   * @param characterId 可选角色标识。
   * @returns 已创建任务。
   */
  private runTask(
    taskType: MemoryTask['taskType'],
    scope: MemoryTask['scope'],
    callback: (
      taskId: string,
      updateTask: (taskId: string, patch: Partial<MemoryTask>) => void,
      control: TaskCancellationState
    ) => Promise<void>,
    characterId?: string
  ): MemoryTask {
    const task: MemoryTask = {
      taskId: randomUUID(),
      taskType,
      scope,
      characterId,
      status: 'queued',
      progress: 0,
      createdAt: now(),
      updatedAt: now()
    }
    this.tasks.set(task.taskId, task)
    const controller = new AbortController()
    const control: TaskCancellationState = {
      controller,
      throwIfCancelled: () => {
        if (controller.signal.aborted || this.tasks.get(task.taskId)?.status === 'cancelled') {
          throw new MemoryTaskCancelledError()
        }
      }
    }
    this.taskCancellationStates.set(task.taskId, control)
    this.emitTask(task)
    void runMonitoredTask({
      scope: 'memory',
      action: 'task-failed',
      message: 'Memory task failed',
      code: 'MEMORY_INDEX_ERROR',
      context: { taskId: task.taskId, taskType, characterId },
      shouldCaptureError: (error) => !(error instanceof MemoryTaskCancelledError),
      run: async () => {
        try {
          this.updateTask(task.taskId, { status: 'running', progress: 5, message: 'Task started' })
          await callback(task.taskId, (id, patch) => this.updateTask(id, patch), control)
          if (this.tasks.get(task.taskId)?.status !== 'cancelled') {
            this.updateTask(task.taskId, {
              status: 'completed',
              progress: 100,
              message: 'Task completed'
            })
          }
        } catch (error) {
          this.updateTask(task.taskId, {
            status: error instanceof MemoryTaskCancelledError ? 'cancelled' : 'failed',
            message: error instanceof Error ? error.message : String(error)
          })
          throw error
        } finally {
          this.taskCancellationStates.delete(task.taskId)
        }
      }
    }).catch((error) => {
      void logger.error('memory', 'task-run-failed', 'Memory task failed', {
        taskId: task.taskId,
        error: error instanceof Error ? error.message : String(error)
      })
    })
    return task
  }

  /**
   * @description 更新任务状态并发布事件。
   * @param taskId 任务标识。
   * @param patch 需合并的字段。
   */
  private updateTask(taskId: string, patch: Partial<MemoryTask>): void {
    const current = this.tasks.get(taskId)
    if (!current) {
      return
    }
    const next = { ...current, ...patch, updatedAt: now() }
    this.tasks.set(taskId, next)
    this.emitTask(next)
  }

  /**
   * @description 向所有渲染窗口广播角色记忆任务更新。
   * @param task 最新任务快照。
   */
  private emitTask(task: MemoryTask): void {
    const event: MemoryTaskEvent = { type: 'memory-task', task }
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('memory:taskEvent', event)
    }
  }
}
