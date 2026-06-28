import type { MemoryEntry } from '@shared/chat'
import type {
  MemoryDebugRetrievalHit,
  MemoryKnowledgeScope,
  MemoryRuntimeScope,
  WorldIndexStatus
} from '@shared/memory-settings'
import { normalizeSearchText, scoreTextMatch } from './retrieval'
import { selectTopK } from './top-k-selector'
import { scoreVectorSimilarity } from './vector-scorer'
import type { MemorySearchRow } from './internal-types'

const KNOWLEDGE_SCOPE_TO_RUNTIME_SCOPE: Record<MemoryKnowledgeScope, MemoryRuntimeScope> = {
  story: 'story',
  glossary: 'glossary'
}

/**
 * @description 根据 scope 生成统一的调试命中对象，避免 story / glossary / chat-memory 三路重复映射。
 * @param scope 当前命中的运行时范围。
 * @param item 原始命中项与排序信息。
 * @param retrievalModeUsed 本次查询实际采用的检索模式。
 * @returns 可直接用于调试与 prompt 预览的命中对象。
 */
function toRetrievalHit(
  scope: MemoryRuntimeScope,
  item: {
    id: string
    text: string
    score: number
    sourceType?: MemoryEntry['sourceType']
    sourcePath?: string | null
    sessionId?: string | null
    characterId?: string | null
    term?: string | null
  },
  rank: number,
  retrievalModeUsed: WorldIndexStatus['runtimeMode']
): MemoryDebugRetrievalHit {
  return {
    id: item.id,
    scope,
    text: item.text,
    score: item.score,
    rank,
    retrievalModeUsed,
    sourceType: item.sourceType,
    sourcePath: item.sourcePath || null,
    sessionId: item.sessionId || null,
    characterId: item.characterId || null,
    term: item.term || null
  }
}

/**
 * @description 计算 glossary 词条的关键词匹配分数，优先考虑术语命中，再兼顾定义文本召回。
 * @param query 用户查询。
 * @param entry glossary 条目。
 * @returns 综合后的匹配分数。
 */
function scoreGlossaryTextMatch(query: string, entry: MemoryEntry): number {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedTerm = normalizeSearchText(entry.term || '')

  if (!normalizedQuery || !normalizedTerm) {
    return scoreTextMatch(query, entry.text)
  }

  let score = scoreTextMatch(query, entry.text)

  if (normalizedQuery === normalizedTerm) {
    score += normalizedTerm.length * 40
  } else if (normalizedQuery.includes(normalizedTerm)) {
    score += normalizedTerm.length * 28
  } else if (normalizedTerm.includes(normalizedQuery)) {
    score += normalizedQuery.length * 18
  }

  return score
}

export class RetrievalQueryService {
  buildStoryStringHits(
    query: string,
    entries: MemoryEntry[],
    topK: number,
    runtimeModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    return selectTopK(
      entries
        .map((entry) => ({
          entry,
          score: scoreTextMatch(query, `${entry.sourcePath || ''}\n${entry.text}`)
        }))
        .filter((item) => item.score > 0),
      topK
    ).map((item, index) =>
      toRetrievalHit(
        'story',
        {
          id: item.entry.id,
          text: item.entry.text,
          score: item.score,
          sourceType: item.entry.sourceType,
          sourcePath: item.entry.sourcePath || null
        },
        index + 1,
        runtimeModeUsed
      )
    )
  }

  buildGlossaryStringHits(
    query: string,
    entries: MemoryEntry[],
    topK: number,
    runtimeModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    return selectTopK(
      entries
        .map((entry) => ({
          entry,
          score: scoreGlossaryTextMatch(query, entry)
        }))
        .filter((item) => item.score > 0),
      topK
    ).map((item, index) =>
      toRetrievalHit(
        'glossary',
        {
          id: item.entry.id,
          text: item.entry.text,
          score: item.score,
          sourceType: item.entry.sourceType,
          sourcePath: item.entry.sourcePath || null,
          term: item.entry.term || null
        },
        index + 1,
        runtimeModeUsed
      )
    )
  }

  buildChatMemoryStringHits(
    query: string,
    entries: MemoryEntry[],
    topK: number,
    runtimeModeUsed: WorldIndexStatus['runtimeMode']
  ): MemoryDebugRetrievalHit[] {
    return selectTopK(
      entries
        .map((entry) => ({
          entry,
          score: scoreTextMatch(query, entry.text)
        }))
        .filter((item) => item.score > 0),
      topK
    ).map((item, index) =>
      toRetrievalHit(
        'chat-memory',
        {
          id: item.entry.id,
          text: item.entry.text,
          score: item.score,
          sourceType: item.entry.sourceType,
          sessionId: item.entry.sessionId || null,
          characterId: item.entry.characterId || null
        },
        index + 1,
        runtimeModeUsed
      )
    )
  }

  buildKnowledgeVectorHits(
    scope: MemoryKnowledgeScope,
    queryVector: number[],
    rows: MemorySearchRow[],
    topK: number
  ): MemoryDebugRetrievalHit[] {
    return selectTopK(
      rows.map((row) => ({
        id: row.id,
        text: row.text,
        sourceType: row.sourceType || undefined,
        sourcePath: row.sourcePath || null,
        term: row.term || null,
        score: scoreVectorSimilarity(queryVector, row.vectorJson)
      })),
      topK
    ).map((item, index) =>
      toRetrievalHit(KNOWLEDGE_SCOPE_TO_RUNTIME_SCOPE[scope], item, index + 1, 'vector')
    )
  }

  buildChatMemoryVectorHits(
    queryVector: number[],
    rows: MemorySearchRow[],
    topK: number
  ): MemoryDebugRetrievalHit[] {
    return selectTopK(
      rows.map((row) => ({
        id: row.id,
        text: row.text,
        sourceType: row.sourceType || undefined,
        sessionId: row.sessionId || null,
        characterId: row.characterId || null,
        score: scoreVectorSimilarity(queryVector, row.vectorJson)
      })),
      topK
    ).map((item, index) => toRetrievalHit('chat-memory', item, index + 1, 'vector'))
  }
}
