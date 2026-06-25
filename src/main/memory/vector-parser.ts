import { parseVectorJson } from './retrieval'

export function parseStoredVector(vectorJson: string): number[] {
  return parseVectorJson(vectorJson)
}
