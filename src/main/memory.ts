import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import { join, relative } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { ConversationSession, MemoryEntry } from '../shared/ai'
import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  EmbeddingConnectionTestResult,
  EmbeddingFingerprint,
  InstalledLocalEmbeddingModel,
  IndexManifestRecord,
  LocalEmbeddingCatalogItem,
  MemorySettingsStore,
  MemoryTask,
  MemoryTaskStatus,
  MemoryTaskEvent,
  WorldIndexStatus
} from '../shared/memory-settings'
import {
  createDefaultMemorySettingsStore,
  normalizeMemorySettingsStore
} from '../shared/memory-settings'
import { CloudEmbeddingProvider, createCloudEmbeddingFingerprint } from './embedding-provider'
import { logger } from './logger'
import {
  createLocalEmbeddingFingerprint,
  downloadLocalEmbeddingModel,
  getInstalledLocalEmbeddingModel,
  listLocalEmbeddingModels,
  LocalEmbeddingProvider,
  removeLocalEmbeddingModel
} from './local-embedding'
import { writeJsonFileAtomic, now, pathExists, getWorldRoot, getResourcesRoot, getMemorySettingsPath, getMemoryDatabasePath } from './utils'

type SearchRow = {
  id: string
  text: string
  sourcePath?: string | null
  sessionId?: string | null
  vectorJson: string
}

type EmbeddingProvider = {
  embedDocuments: (texts: string[]) => Promise<number[][]>
  embedQuery: (text: string) => Promise<number[]>
  testConnection: () => Promise<EmbeddingConnectionTestResult>
}

const WORLD_SCOPE = 'world'
const MEMORY_SCOPE = 'character-memory'





async function walkMarkdownFiles(rootPath: string): Promise<string[]> {
  if (!(await pathExists(rootPath))) {
    return []
  }

  const entries = await readdir(rootPath, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = join(rootPath, entry.name)
      if (entry.isDirectory()) {
        return walkMarkdownFiles(target)
      }

      return entry.isFile() && target.toLowerCase().endsWith('.md') ? [target] : []
    })
  )

  return files.flat()
}

function splitMarkdownIntoChunks(content: string): string[] {
  return content
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function scoreMatch(query: string, target: string): number {
  const normalizedQuery = normalizeText(query)
  const normalizedTarget = normalizeText(target)

  if (!normalizedQuery || !normalizedTarget) {
    return 0
  }

  if (normalizedTarget.includes(normalizedQuery)) {
    return normalizedQuery.length * 10
  }

  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .reduce((score, token) => score + (normalizedTarget.includes(token) ? token.length * 2 : 0), 0)
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0
  }

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function fingerprintKey(fingerprint: EmbeddingFingerprint | null | undefined): string {
  if (!fingerprint) {
    return ''
  }

  return [
    fingerprint.mode,
    fingerprint.provider,
    fingerprint.model,
    fingerprint.dimensions ?? 'auto',
    fingerprint.implementationVersion
  ].join('|')
}

function sameFingerprint(
  left: EmbeddingFingerprint | null | undefined,
  right: EmbeddingFingerprint | null | undefined
): boolean {
  if (!left || !right) {
    return false
  }

  if (
    left.mode !== right.mode ||
    left.provider !== right.provider ||
    left.model !== right.model ||
    left.implementationVersion !== right.implementationVersion
  ) {
    return false
  }

  if (left.dimensions == null || right.dimensions == null) {
    return true
  }

  return left.dimensions === right.dimensions
}

function parseVector(vectorJson: string): number[] {
  const parsed = JSON.parse(vectorJson) as number[]
  return Array.isArray(parsed) ? parsed.map((value) => Number(value)) : []
}

export class MemoryService {
  private settings = createDefaultMemorySettingsStore()
  private sessions: ConversationSession[] = []
  private worldEntries: MemoryEntry[] = []
  private tasks = new Map<string, MemoryTask>()
  private initialized = false
  private db: DatabaseSync | null = null
  private taskLogStates = new Map<string, MemoryTaskStatus>()

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.settings = await this.loadSettings()
    this.worldEntries = await this.loadWorldEntries()
    this.db = new DatabaseSync(getMemoryDatabasePath())
    this.prepareDatabase()
    this.initialized = true
    void logger.info('memory', 'initialized', 'Memory service initialized', {
      retrievalMode: this.settings.retrievalMode,
      worldEntryCount: this.worldEntries.length
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
    return listLocalEmbeddingModels(this.settings.localEmbedding.model)
  }

  async downloadLocalModel(modelId: string): Promise<MemoryTask> {
    return this.runTask('local-model-download', 'character-memory', async (taskId, updateTask) => {
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

      if (!this.settings.localEmbedding.modelPath || this.settings.localEmbedding.model === modelId) {
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
    }, modelId)
  }

  async selectLocalModel(modelId: string): Promise<MemorySettingsStore> {
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
      dataVersion: `${this.worldEntries.length}-chunks`,
      entryCount: manifest?.entryCount || this.worldEntries.length,
      fingerprint: manifest ? this.fingerprintFromManifest(manifest) : null,
      builtAt: manifest?.builtAt || null,
      message: compatibility.message || manifest?.message || this.defaultMessage(availability, 'world')
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
      builtAt: manifest?.builtAt || null,
      message: compatibility.message || manifest?.message || this.defaultMessage(availability, 'memory')
    }
  }

  getStatus(characterId?: string | null): {
    settings: MemorySettingsStore
    worldIndex: WorldIndexStatus
    memoryIndex: CharacterMemoryIndexStatus
    tasks: MemoryTask[]
  } {
    return {
      settings: this.settings,
      worldIndex: this.getWorldIndexStatus(),
      memoryIndex: this.getMemoryIndexStatus(characterId),
      tasks: this.getTasks()
    }
  }

  getTasks(): MemoryTask[] {
    return [...this.tasks.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async startWorldBundleDownload(): Promise<MemoryTask> {
    return this.runTask('world-bundle-download', 'world', async (taskId, updateTask) => {
      updateTask(taskId, {
        progress: 100,
        message: 'World bundle still uses local resources/world content.'
      })
    })
  }

  async startWorldVectorBuild(): Promise<MemoryTask> {
    return this.runTask('world-vector-build', 'world', async (taskId, updateTask) => {
      const provider = await this.requireVectorEmbeddingProvider()
      updateTask(taskId, { progress: 10, message: 'Scanning world markdown files' })
      this.worldEntries = await this.loadWorldEntries()
      updateTask(taskId, { progress: 25, message: 'Generating world embeddings' })
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
        updateTask(taskId, {
          progress: 45,
          message: 'Generating character memory embeddings',
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

      for (let index = 0; index < characterIds.length; index += 1) {
        const characterId = characterIds[index]
        updateTask(taskId, {
          progress: Math.round((index / Math.max(characterIds.length, 1)) * 100),
          message: `Rebuilding character memory (${index + 1}/${characterIds.length})`,
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
    if (!this.settings.worldSearchEnabled) {
      return []
    }

    if (this.settings.retrievalMode !== 'string' && this.getWorldCompatibility().compatible) {
      try {
        return await this.retrieveWorldVectorContext(query)
      } catch {
        return this.retrieveWorldStringContext(query)
      }
    }

    return this.retrieveWorldStringContext(query)
  }

  async retrieveMemoryContext(query: string, session: ConversationSession): Promise<string[]> {
    if (!this.settings.memorySearchEnabled) {
      return []
    }

    if (
      this.settings.retrievalMode !== 'string' &&
      this.getMemoryCompatibility(this.settings.crossSessionCharacterMemory ? session.characterId : session.id)
        .compatible
    ) {
      try {
        return await this.retrieveMemoryVectorContext(query, session)
      } catch {
        return this.retrieveMemoryStringContext(query, session)
      }
    }

    return this.retrieveMemoryStringContext(query, session)
  }

  getRecentMessageCount(): number {
    return this.settings.recentMessageCount
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
        built_at TEXT,
        message TEXT,
        PRIMARY KEY (scope, target_id)
      );
    `)
  }

  private async loadSettings(): Promise<MemorySettingsStore> {
    const filePath = getMemorySettingsPath()
    if (!(await pathExists(filePath))) {
      return createDefaultMemorySettingsStore()
    }

    try {
      return normalizeMemorySettingsStore(JSON.parse(await readFile(filePath, 'utf-8')))
    } catch (error) {
      void logger.error('memory', 'settings-read-failed', 'Failed to read memory settings, using defaults', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      })
      return createDefaultMemorySettingsStore()
    }
  }

  private async loadWorldEntries(): Promise<MemoryEntry[]> {
    const worldRoot = getWorldRoot()
    const markdownFiles = await walkMarkdownFiles(worldRoot)
    const entries = await Promise.all(
      markdownFiles.map(async (filePath) => {
        const content = await readFile(filePath, 'utf-8')
        return splitMarkdownIntoChunks(content).map((text, chunkIndex) => ({
          id: `world:${relative(worldRoot, filePath)}:${chunkIndex}`,
          text,
          sourceType: 'world' as const,
          sourcePath: relative(getResourcesRoot(), filePath).replace(/\\/g, '/'),
          chunkIndex,
          createdAt: now(),
          updatedAt: now(),
          visibility: 'shared' as const
        }))
      })
    )

    return entries.flat()
  }

  private retrieveWorldStringContext(query: string): string[] {
    return this.worldEntries
      .map((entry) => ({
        entry,
        score: scoreMatch(query, `${entry.sourcePath || ''}\n${entry.text}`)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, this.settings.worldTopK)
      .map((item) => item.entry.text)
  }

  private retrieveMemoryStringContext(query: string, session: ConversationSession): string[] {
    const entries = this.buildCharacterMemoryEntries(session.characterId).filter((entry) =>
      this.settings.crossSessionCharacterMemory ? true : entry.sessionId === session.id
    )

    return entries
      .map((entry) => ({
        entry,
        score: scoreMatch(query, entry.text)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, this.settings.memoryTopK)
      .map((item) => item.entry.text)
  }

  private async retrieveWorldVectorContext(query: string): Promise<string[]> {
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
        text: row.text,
        score: cosineSimilarity(queryVector, parseVector(row.vectorJson))
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, this.settings.worldTopK)
      .map((item) => item.text)
  }

  private async retrieveMemoryVectorContext(
    query: string,
    session: ConversationSession
  ): Promise<string[]> {
    const provider = await this.requireVectorEmbeddingProvider()
    const queryVector = await provider.embedQuery(query)
    const targetId = this.settings.crossSessionCharacterMemory ? session.characterId : session.id
    const manifest = this.getManifest(MEMORY_SCOPE, targetId)
    if (!manifest) {
      return []
    }

    const whereClause = this.settings.crossSessionCharacterMemory ? 'character_id = ?' : 'session_id = ?'
    const rows = this.getDatabase()
      .prepare(
        `
          SELECT memory_entries.id AS id, memory_entries.text AS text, memory_entries.session_id AS sessionId, memory_embeddings.vector_json AS vectorJson
          FROM memory_entries
          INNER JOIN memory_embeddings ON memory_embeddings.entry_id = memory_entries.id
          WHERE memory_embeddings.fingerprint_key = ? AND ${whereClause}
        `
      )
      .all(manifest.fingerprintKey, targetId) as SearchRow[]

    return rows
      .map((row) => ({
        text: row.text,
        score: cosineSimilarity(queryVector, parseVector(row.vectorJson))
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, this.settings.memoryTopK)
      .map((item) => item.text)
  }

  private buildCharacterMemoryEntries(characterId: string): MemoryEntry[] {
    const characterSessions = this.sessions.filter((session) => session.characterId === characterId)

    return characterSessions.flatMap((session) => {
      const completedMessages = session.messages.filter((message) => Boolean(message.content.trim()))
      const recentMessages = completedMessages.slice(-Math.max(this.settings.summaryTriggerTurns, 4))
      if (recentMessages.length === 0) {
        return []
      }

      return [
        {
          id: `memory:${characterId}:${session.id}`,
          text: recentMessages
            .map((message) => `${message.role === 'user' ? 'User' : 'Character'}: ${message.content}`)
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

  private saveWorldVectors(
    entries: MemoryEntry[],
    vectors: number[][],
    fingerprint: EmbeddingFingerprint
  ): void {
    const db = this.getDatabase()
    const key = fingerprintKey(fingerprint)
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
    const key = fingerprintKey(fingerprint)
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
    this.getDatabase()
      .prepare(
        `
          INSERT OR REPLACE INTO index_manifests
          (scope, target_id, fingerprint_key, fingerprint_json, status, entry_count, built_at, message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        input.scope,
        input.targetId || null,
        input.fingerprintKey,
        JSON.stringify(input.fingerprint),
        input.status,
        input.entryCount,
        input.builtAt || null,
        input.message || null
      )
  }

  private getManifest(scope: 'world' | 'character-memory', targetId?: string | null): IndexManifestRecord | null {
    const row = this.getDatabase()
      .prepare(
        'SELECT scope, target_id AS targetId, fingerprint_key AS fingerprintKey, status, entry_count AS entryCount, built_at AS builtAt, message FROM index_manifests WHERE scope = ? AND target_id IS ?'
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
        'SELECT fingerprint_json AS fingerprintJson FROM index_manifests WHERE scope = ? AND target_id IS ?'
      )
      .get(manifest.scope, manifest.targetId || null) as { fingerprintJson: string } | undefined

    return row ? (JSON.parse(row.fingerprintJson) as EmbeddingFingerprint) : null
  }

  private getExpectedFingerprint(): EmbeddingFingerprint | null {
    if (this.settings.retrievalMode === 'vector-cloud') {
      return createCloudEmbeddingFingerprint(this.settings.cloudEmbedding)
    }

    if (this.settings.retrievalMode === 'vector-local' && this.settings.localEmbedding.modelPath) {
      return createLocalEmbeddingFingerprint({
        id: this.settings.localEmbedding.model,
        repoId: this.settings.localEmbedding.model,
        label: this.settings.localEmbedding.model,
        source: 'builtin',
        installedAt: now(),
        dimensions: this.settings.localEmbedding.dimensions || 0,
        runtime: 'transformers-js',
        modelPath: this.settings.localEmbedding.modelPath
      })
    }

    return null
  }

  private getWorldCompatibility(): EmbeddingCompatibilityStatus {
    const manifest = this.getManifest(WORLD_SCOPE)
    const expected = this.getExpectedFingerprint()
    const active = manifest ? this.fingerprintFromManifest(manifest) : null
    const compatible = this.settings.retrievalMode === 'string' || sameFingerprint(active, expected)

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
    const compatible = this.settings.retrievalMode === 'string' || sameFingerprint(active, expected)

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

  private defaultMessage(
    availability: WorldIndexStatus['availability'] | CharacterMemoryIndexStatus['availability'],
    type: 'world' | 'memory'
  ): string {
    if (availability === 'building') {
      return type === 'world'
        ? 'World vector index is currently building.'
        : 'Character memory vector index is currently building.'
    }

    if (availability === 'failed') {
      return type === 'world'
        ? 'World vector index build failed.'
        : 'Character memory vector index build failed.'
    }

    if (availability === 'missing') {
      return type === 'world'
        ? 'World vector index has not been built yet.'
        : 'Character memory vector index has not been built yet.'
    }

    if (availability === 'incompatible') {
      return type === 'world'
        ? 'World vector index is incompatible with the current embedding configuration. Falling back to string retrieval.'
        : 'Character memory vector index is incompatible with the current embedding configuration. Falling back to string retrieval.'
    }

    if (this.settings.retrievalMode === 'string') {
      return type === 'world'
        ? 'String retrieval is active for world knowledge.'
        : 'String retrieval is active for character memory.'
    }

    return type === 'world'
      ? 'Vector retrieval is active for world knowledge.'
      : 'Vector retrieval is active for character memory.'
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

  private async requireInstalledLocalModel(): Promise<InstalledLocalEmbeddingModel> {
    if (this.settings.retrievalMode !== 'vector-local') {
      throw new Error('Local embeddings are only available in vector-local mode')
    }

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

  private async createActiveEmbeddingFingerprint(dimensions?: number): Promise<EmbeddingFingerprint> {
    if (this.settings.retrievalMode === 'vector-cloud') {
      return createCloudEmbeddingFingerprint(this.settings.cloudEmbedding, dimensions)
    }

    const installedModel = await this.requireInstalledLocalModel()
    return createLocalEmbeddingFingerprint({
      ...installedModel,
      dimensions: dimensions || installedModel.dimensions
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
