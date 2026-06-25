import type { MemoryEntry } from '@shared/chat'
import type { MemoryDebugRetrievalHit, WorldIndexStatus } from '@shared/memory-settings'
import { scoreTextMatch } from './retrieval'
import { selectTopK } from './top-k-selector'
import { scoreVectorSimilarity } from './vector-scorer'
import type { MemorySearchRow } from './internal-types'

const WORLD_SCOPE = 'world'
const MEMORY_SCOPE = 'character-memory'

export class RetrievalQueryService {
  buildWorldStringHits(
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
    ).map((item, index) => ({
      id: item.entry.id,
      scope: WORLD_SCOPE,
      text: item.entry.text,
      score: item.score,
      rank: index + 1,
      retrievalModeUsed: runtimeModeUsed,
      sourcePath: item.entry.sourcePath || null
    }))
  }

  buildMemoryStringHits(
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
    ).map((item, index) => ({
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

  buildWorldVectorHits(
    queryVector: number[],
    rows: MemorySearchRow[],
    topK: number
  ): MemoryDebugRetrievalHit[] {
    return selectTopK(
      rows.map((row) => ({
        id: row.id,
        text: row.text,
        sourcePath: row.sourcePath || null,
        score: scoreVectorSimilarity(queryVector, row.vectorJson)
      })),
      topK
    ).map((item, index) => ({
      id: item.id,
      scope: WORLD_SCOPE,
      text: item.text,
      score: item.score,
      rank: index + 1,
      retrievalModeUsed: 'vector',
      sourcePath: item.sourcePath
    }))
  }

  buildMemoryVectorHits(
    queryVector: number[],
    rows: MemorySearchRow[],
    topK: number
  ): MemoryDebugRetrievalHit[] {
    return selectTopK(
      rows.map((row) => ({
        id: row.id,
        text: row.text,
        sessionId: row.sessionId || null,
        characterId: row.characterId || null,
        score: scoreVectorSimilarity(queryVector, row.vectorJson)
      })),
      topK
    ).map((item, index) => ({
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
}
