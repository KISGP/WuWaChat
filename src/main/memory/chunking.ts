export type TextChunker = {
  split: (content: string) => string[]
}

export const markdownParagraphChunker: TextChunker = {
  split: (content) =>
    content
      .split(/\n\s*\n/g)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
}
