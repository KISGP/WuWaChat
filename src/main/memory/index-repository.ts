import { DatabaseSync } from 'node:sqlite'
import type { MemoryEntry } from '@shared/chat'
import type { EmbeddingFingerprint, IndexManifestRecord } from '@shared/memory-settings'
import { getEmbeddingFingerprintKey } from '@main/embedding/fingerprint'
import { now } from '@main/utils'
import type { MemorySearchRow } from './internal-types'

export class MemoryIndexRepository {
  constructor(private readonly db: DatabaseSync) {}

  prepareDatabase(): void {
    this.db.exec(`
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

    const manifestColumns = this.db.prepare('PRAGMA table_info(index_manifests)').all() as {
      name: string
    }[]
    if (!manifestColumns.some((column) => column.name === 'data_version')) {
      this.db.exec('ALTER TABLE index_manifests ADD COLUMN data_version TEXT')
    }

    this.normalizeLegacyManifestRows()
  }

  getWorldVectorRows(fingerprintKey: string): MemorySearchRow[] {
    return this.db
      .prepare(
        `
          SELECT world_chunks.id AS id, world_chunks.text AS text, world_chunks.source_path AS sourcePath, world_embeddings.vector_json AS vectorJson
          FROM world_chunks
          INNER JOIN world_embeddings ON world_embeddings.chunk_id = world_chunks.id
          WHERE world_embeddings.fingerprint_key = ?
        `
      )
      .all(fingerprintKey) as MemorySearchRow[]
  }

  getMemoryVectorRows(
    fingerprintKey: string,
    targetId: string,
    crossSession: boolean
  ): MemorySearchRow[] {
    const whereClause = crossSession ? 'character_id = ?' : 'session_id = ?'

    return this.db
      .prepare(
        `
          SELECT memory_entries.id AS id, memory_entries.text AS text, memory_entries.session_id AS sessionId, memory_entries.character_id AS characterId, memory_embeddings.vector_json AS vectorJson
          FROM memory_entries
          INNER JOIN memory_embeddings ON memory_embeddings.entry_id = memory_entries.id
          WHERE memory_embeddings.fingerprint_key = ? AND ${whereClause}
        `
      )
      .all(fingerprintKey, targetId) as MemorySearchRow[]
  }

  saveWorldVectors(
    entries: MemoryEntry[],
    vectors: number[][],
    fingerprint: EmbeddingFingerprint
  ): void {
    const key = getEmbeddingFingerprintKey(fingerprint)
    const insertChunk = this.db.prepare(
      'INSERT OR REPLACE INTO world_chunks (id, source_path, chunk_index, text, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    const insertEmbedding = this.db.prepare(
      'INSERT OR REPLACE INTO world_embeddings (chunk_id, vector_json, fingerprint_key, built_at) VALUES (?, ?, ?, ?)'
    )

    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM world_embeddings').run()
      this.db.prepare('DELETE FROM world_chunks').run()

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
        scope: 'world',
        targetId: null,
        fingerprintKey: key,
        status: 'ready',
        entryCount: entries.length,
        builtAt: now(),
        message: 'World vector index is ready',
        fingerprint
      })

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      this.saveManifest({
        scope: 'world',
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

  saveCharacterMemoryVectors(
    characterId: string,
    entries: MemoryEntry[],
    vectors: number[][],
    fingerprint: EmbeddingFingerprint
  ): void {
    const key = getEmbeddingFingerprintKey(fingerprint)
    const insertEntry = this.db.prepare(
      'INSERT OR REPLACE INTO memory_entries (id, character_id, session_id, source_type, text, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const insertEmbedding = this.db.prepare(
      'INSERT OR REPLACE INTO memory_embeddings (entry_id, vector_json, fingerprint_key, built_at) VALUES (?, ?, ?, ?)'
    )

    this.db.exec('BEGIN')
    try {
      this.db
        .prepare(
          `
          DELETE FROM memory_embeddings
          WHERE entry_id IN (
            SELECT id FROM memory_entries WHERE character_id = ?
          )
        `
        )
        .run(characterId)
      this.db.prepare('DELETE FROM memory_entries WHERE character_id = ?').run(characterId)

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
        scope: 'character-memory',
        targetId: characterId,
        fingerprintKey: key,
        status: 'ready',
        entryCount: entries.length,
        builtAt: now(),
        message: 'Character memory vector index is ready',
        fingerprint
      })

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      this.saveManifest({
        scope: 'character-memory',
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

  getManifest(
    scope: 'world' | 'character-memory',
    targetId?: string | null
  ): IndexManifestRecord | null {
    const row = this.db
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

  fingerprintFromManifest(
    manifest: IndexManifestRecord & { targetId?: string | null }
  ): EmbeddingFingerprint | null {
    const row = this.db
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

  countMemoryEntries(characterId: string | null, crossSession: boolean): number {
    if (characterId) {
      const field = crossSession ? 'character_id' : 'session_id'
      const result = this.db
        .prepare(`SELECT COUNT(*) AS count FROM memory_entries WHERE ${field} = ?`)
        .get(characterId) as { count: number }
      return result.count
    }

    const result = this.db.prepare('SELECT COUNT(*) AS count FROM memory_entries').get() as {
      count: number
    }
    return result.count
  }

  countIndexedCharacters(): number {
    const result = this.db
      .prepare('SELECT COUNT(DISTINCT character_id) AS count FROM memory_entries')
      .get() as { count: number }
    return result.count
  }

  private saveManifest(input: IndexManifestRecord & { fingerprint: EmbeddingFingerprint }): void {
    this.db
      .prepare('DELETE FROM index_manifests WHERE scope = ? AND target_id IS ?')
      .run(input.scope, input.targetId || null)
    this.db
      .prepare(
        `
        INSERT INTO index_manifests
        (scope, target_id, fingerprint_key, fingerprint_json, status, entry_count, data_version, built_at, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
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

  private normalizeLegacyManifestRows(): void {
    this.db.exec(`
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
}
