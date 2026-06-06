export function createStructuredError(
  title: string,
  stage: string,
  reason: string,
  suggestions: string[]
): Error {
  return new Error(
    [
      `标题：${title}`,
      `阶段：${stage}`,
      `原因：${reason}`,
      ...suggestions.map((item, index) => `建议${index + 1}：${item}`)
    ].join('\n')
  )
}

export function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
