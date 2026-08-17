import { DatabaseSync } from 'node:sqlite'
import type { MemoryEntry } from '@shared/chat'
import type { EmbeddingFingerprint, IndexManifestRecord } from '@shared/memory-settings'
import { getEmbeddingFingerprintKey } from '@main/embedding/fingerprint'
import { now } from '@main/utils'
import type { MemorySearchRow } from './internal-types'

/**
 * @description 管理角色长期记忆的 SQLite 向量缓存和索引元数据。
 */
export class MemoryIndexRepository {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * @description 创建角色长期记忆所需的表，并移除已废弃的原作索引缓存表。
   * @remarks `world_chunks` 与 `world_embeddings` 仅存放可再生缓存，删除不会影响原始 Markdown。
   */
  prepareDatabase(): void {
    this.db.exec(`
      DROP TABLE IF EXISTS world_embeddings;
      DROP TABLE IF EXISTS world_chunks;
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
      DELETE FROM index_manifests WHERE scope IN ('story', 'glossary');
    `)
  }

  /**
   * @description 读取指定角色或会话可用的角色记忆向量。
   * @param fingerprintKey 当前 embedding 指纹键。
   * @param targetId 角色 ID 或会话 ID。
   * @param crossSession 是否按角色聚合。
   * @returns 可用于向量检索的缓存行。
   */
  getMemoryVectorRows(
    fingerprintKey: string,
    targetId: string,
    crossSession: boolean
  ): MemorySearchRow[] {
    const whereClause = crossSession ? 'character_id = ?' : 'session_id = ?'
    return this.db
      .prepare(
        `
          SELECT memory_entries.id AS id, memory_entries.text AS text,
            memory_entries.source_type AS sourceType,
            memory_entries.session_id AS sessionId,
            memory_entries.character_id AS characterId,
            memory_embeddings.vector_json AS vectorJson
          FROM memory_entries
          INNER JOIN memory_embeddings ON memory_embeddings.entry_id = memory_entries.id
          WHERE memory_embeddings.fingerprint_key = ? AND ${whereClause}
        `
      )
      .all(fingerprintKey, targetId) as MemorySearchRow[]
  }

  /**
   * @description 原子替换某角色的长期记忆向量与对应 manifest。
   * @param characterId 目标角色 ID。
   * @param entries 最新记忆条目。
   * @param vectors 与条目顺序对应的向量。
   * @param fingerprint 本次构建的 embedding 指纹。
   */
  saveCharacterMemoryVectors(
    characterId: string,
    entries: MemoryEntry[],
    vectors: number[][],
    fingerprint: EmbeddingFingerprint
  ): void {
    const fingerprintKey = getEmbeddingFingerprintKey(fingerprint)
    const insertEntry = this.db.prepare(
      'INSERT OR REPLACE INTO memory_entries (id, character_id, session_id, source_type, text, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const insertVector = this.db.prepare(
      'INSERT OR REPLACE INTO memory_embeddings (entry_id, vector_json, fingerprint_key, built_at) VALUES (?, ?, ?, ?)'
    )

    this.db.exec('BEGIN')
    try {
      this.db
        .prepare(
          'DELETE FROM memory_embeddings WHERE entry_id IN (SELECT id FROM memory_entries WHERE character_id = ?)'
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
        insertVector.run(entry.id, JSON.stringify(vectors[index] || []), fingerprintKey, now())
      })

      this.saveManifest({
        scope: 'character-memory',
        targetId: characterId,
        fingerprintKey,
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
        fingerprintKey,
        status: 'failed',
        entryCount: 0,
        builtAt: now(),
        message: error instanceof Error ? error.message : String(error),
        fingerprint
      })
      throw error
    }
  }

  /**
   * @description 读取角色长期记忆索引的最近 manifest。
   * @param targetId 角色 ID 或会话 ID。
   * @returns 索引 manifest；不存在时返回 `null`。
   */
  getManifest(targetId?: string | null): IndexManifestRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT scope, target_id AS targetId, fingerprint_key AS fingerprintKey,
            status, entry_count AS entryCount, data_version AS dataVersion,
            built_at AS builtAt, message
          FROM index_manifests
          WHERE scope = 'character-memory' AND target_id IS ?
          ORDER BY built_at DESC, rowid DESC LIMIT 1
        `
      )
      .get(targetId || null) as (IndexManifestRecord & { targetId?: string | null }) | undefined
    return row || null
  }

  /**
   * @description 读取 manifest 对应的 embedding 指纹。
   * @param manifest 当前角色记忆 manifest。
   * @returns 指纹；不存在时返回 `null`。
   */
  fingerprintFromManifest(
    manifest: IndexManifestRecord & { targetId?: string | null }
  ): EmbeddingFingerprint | null {
    const row = this.db
      .prepare(
        `
          SELECT fingerprint_json AS fingerprintJson FROM index_manifests
          WHERE scope = 'character-memory' AND target_id IS ?
          ORDER BY built_at DESC, rowid DESC LIMIT 1
        `
      )
      .get(manifest.targetId || null) as { fingerprintJson: string } | undefined
    if (!row) {
      return null
    }

    try {
      return JSON.parse(row.fingerprintJson) as EmbeddingFingerprint
    } catch {
      return null
    }
  }

  /**
   * @description 统计已建立角色记忆索引的角色数量。
   * @returns 已索引角色数量。
   */
  countIndexedCharacters(): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(DISTINCT target_id) AS count FROM index_manifests WHERE scope = 'character-memory' AND status = 'ready'"
      )
      .get() as { count: number }
    return row.count
  }

  /**
   * @description 统计指定角色或会话当前持久化的记忆条目数量。
   * @param targetId 角色 ID 或会话 ID。
   * @param crossSession 是否按角色聚合。
   * @returns 记忆条目数量。
   */
  countMemoryEntries(targetId: string, crossSession: boolean): number {
    const field = crossSession ? 'character_id' : 'session_id'
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM memory_entries WHERE ${field} = ?`)
      .get(targetId) as { count: number }
    return row.count
  }

  /**
   * @description 写入角色长期记忆 manifest。
   * @param manifest 需要持久化的 manifest 字段。
   */
  private saveManifest(
    manifest: IndexManifestRecord & {
      fingerprint: EmbeddingFingerprint
      targetId?: string | null
    }
  ): void {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO index_manifests
          (scope, target_id, fingerprint_key, fingerprint_json, status, entry_count, data_version, built_at, message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        'character-memory',
        manifest.targetId || null,
        manifest.fingerprintKey,
        JSON.stringify(manifest.fingerprint),
        manifest.status,
        manifest.entryCount,
        manifest.dataVersion || null,
        manifest.builtAt || null,
        manifest.message || null
      )
  }
}
