import { cosineSimilarity } from './retrieval'
import { parseStoredVector } from './vector-parser'

export function scoreVectorSimilarity(queryVector: number[], vectorJson: string): number {
  return cosineSimilarity(queryVector, parseStoredVector(vectorJson))
}
