export function contentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part
      }

      if (!part || typeof part !== 'object') {
        return ''
      }

      const data = part as { text?: unknown; content?: unknown }
      if (typeof data.text === 'string') {
        return data.text
      }

      return typeof data.content === 'string' ? data.content : ''
    })
    .join('')
}
