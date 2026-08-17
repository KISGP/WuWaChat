import type { MemoryEntry } from '@shared/chat'
import type { MemoryDebugRetrievalHit } from '@shared/memory-settings'
import { normalizeSearchText, scoreTextMatch } from './retrieval'
import { selectTopK } from './top-k-selector'
import { scoreVectorSimilarity } from './vector-scorer'
import type { MemorySearchRow } from './internal-types'

/**
 * @description 处理角色长期记忆的字符串与向量检索结果映射。
 */
export class RetrievalQueryService {
  /**
   * @description 使用关键词匹配检索角色长期记忆条目。
   * @param query 用户查询。
   * @param entries 当前角色可访问的记忆条目。
   * @param topK 最大返回数量。
   * @param retrievalModeUsed 本次实际使用的检索模式。
   * @returns 排序后的记忆命中。
   */
  buildChatMemoryStringHits(
    query: string,
    entries: MemoryEntry[],
    topK: number,
    retrievalModeUsed: 'string' | 'vector' | 'degraded'
  ): MemoryDebugRetrievalHit[] {
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery) {
      return []
    }

    return selectTopK(
      entries
        .map((entry) => ({ entry, score: scoreTextMatch(query, entry.text) }))
        .filter((item) => item.score > 0),
      topK
    ).map((item, index) => ({
      id: item.entry.id,
      scope: 'chat-memory',
      text: item.entry.text,
      score: item.score,
      rank: index + 1,
      retrievalModeUsed,
      sourceType: item.entry.sourceType,
      sessionId: item.entry.sessionId || null,
      characterId: item.entry.characterId || null
    }))
  }

  /**
   * @description 依据查询向量与缓存向量的相似度检索角色长期记忆。
   * @param queryVector 当前查询的 embedding 向量。
   * @param rows 本地向量缓存行。
   * @param topK 最大返回数量。
   * @returns 排序后的记忆命中。
   */
  buildChatMemoryVectorHits(
    queryVector: number[],
    rows: MemorySearchRow[],
    topK: number
  ): MemoryDebugRetrievalHit[] {
    return selectTopK(
      rows.map((row) => ({
        row,
        score: scoreVectorSimilarity(queryVector, row.vectorJson)
      })),
      topK
    ).map((item, index) => ({
      id: item.row.id,
      scope: 'chat-memory',
      text: item.row.text,
      score: item.score,
      rank: index + 1,
      retrievalModeUsed: 'vector',
      sourceType: item.row.sourceType || undefined,
      sessionId: item.row.sessionId || null,
      characterId: item.row.characterId || null
    }))
  }
}
