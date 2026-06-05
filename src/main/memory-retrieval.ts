export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function scoreTextMatch(query: string, target: string): number {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedTarget = normalizeSearchText(target)

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

export function cosineSimilarity(left: number[], right: number[]): number {
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

export function parseVectorJson(vectorJson: string): number[] {
  const parsed = JSON.parse(vectorJson) as number[]
  return Array.isArray(parsed) ? parsed.map((value) => Number(value)) : []
}
