export function selectTopK<T extends { score: number }>(items: T[], limit: number): T[] {
  return [...items].sort((left, right) => right.score - left.score).slice(0, limit)
}
