import { readdir, readFile } from 'fs/promises'
import { basename, join, relative } from 'path'
import type { MemoryEntry } from '@shared/chat'
import { now, pathExists } from '@main/utils'
import { markdownParagraphChunker } from './chunking'
import { normalizeSearchText } from './retrieval'

export type WorldKnowledgeEntries = {
  storyEntries: MemoryEntry[]
  glossaryEntries: MemoryEntry[]
}

const GLOSSARY_FILE_PATTERN = /名词解释/i

/**
 * @description 递归遍历指定目录下的 Markdown 文件路径。
 * @param rootPath 待扫描的根目录。
 * @returns 所有 Markdown 文件的绝对路径列表。
 */
export async function walkMarkdownFiles(rootPath: string): Promise<string[]> {
  if (!(await pathExists(rootPath))) {
    return []
  }

  const entries = await readdir(rootPath, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = join(rootPath, entry.name)
      if (entry.isDirectory()) {
        return walkMarkdownFiles(target)
      }

      return entry.isFile() && target.toLowerCase().endsWith('.md') ? [target] : []
    })
  )

  return files.flat()
}

/**
 * @description 读取 world 目录并拆分出剧情与名词解释两类可检索条目。
 * @param worldRoot world 根目录。
 * @returns 按剧情与名词解释划分后的检索条目集合。
 */
export async function loadWorldKnowledgeEntries(worldRoot: string): Promise<WorldKnowledgeEntries> {
  const markdownFiles = await walkMarkdownFiles(worldRoot)
  const fileEntries = await Promise.all(
    markdownFiles.map(async (filePath) => {
      const content = await readFile(filePath, 'utf-8')
      const sourcePath = relative(worldRoot, filePath).replace(/\\/g, '/')
      return isGlossaryFile(filePath)
        ? {
            storyEntries: [] as MemoryEntry[],
            glossaryEntries: buildGlossaryEntries(content, sourcePath)
          }
        : {
            storyEntries: buildStoryEntries(content, sourcePath),
            glossaryEntries: [] as MemoryEntry[]
          }
    })
  )

  const storyEntries = fileEntries.flatMap((item) => item.storyEntries)
  const glossaryEntries = enrichGlossaryReferences(
    fileEntries.flatMap((item) => item.glossaryEntries)
  )

  return {
    storyEntries,
    glossaryEntries
  }
}

/**
 * @description 判断给定 Markdown 文件是否应按名词解释处理。
 * @param filePath Markdown 文件路径。
 * @returns 若为 glossary 文件则返回 `true`。
 */
function isGlossaryFile(filePath: string): boolean {
  return GLOSSARY_FILE_PATTERN.test(basename(filePath, '.md'))
}

/**
 * @description 将剧情 Markdown 文本按段落切分为 story 检索条目。
 * @param content Markdown 原文。
 * @param sourcePath 相对 world 根目录的来源路径。
 * @returns 剧情检索条目列表。
 */
function buildStoryEntries(content: string, sourcePath: string): MemoryEntry[] {
  return markdownParagraphChunker.split(content).map((text, chunkIndex) => ({
    id: `story:${sourcePath}:${chunkIndex}`,
    text,
    sourceType: 'story',
    sourcePath,
    chunkIndex,
    createdAt: now(),
    updatedAt: now(),
    visibility: 'shared'
  }))
}

/**
 * @description 将 glossary Markdown 文本按词条切分为可独立检索的术语条目。
 * @param content Markdown 原文。
 * @param sourcePath 相对 world 根目录的来源路径。
 * @returns 名词解释检索条目列表。
 */
function buildGlossaryEntries(content: string, sourcePath: string): MemoryEntry[] {
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, chunkIndex) => {
      const [termPart, definitionPart] = splitGlossaryLine(line)
      const term = termPart.trim()
      const definition = definitionPart.trim() || line.trim()

      return {
        id: `glossary:${sourcePath}:${chunkIndex}`,
        text: definition,
        term,
        sourceType: 'glossary',
        sourcePath,
        chunkIndex,
        createdAt: now(),
        updatedAt: now(),
        visibility: 'shared'
      } satisfies MemoryEntry
    })
}

/**
 * @description 按术语分隔符拆分 glossary 的单行文本。
 * @param line glossary 单行文本。
 * @returns 词条名称与定义文本。
 */
function splitGlossaryLine(line: string): [string, string] {
  const separatorIndex = line.search(/[:：]/)
  if (separatorIndex < 0) {
    return [line, line]
  }

  return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]
}

/**
 * @description 基于 glossary 词条全集，为每条解释补齐显式依赖的其他术语。
 * @param entries 未补充引用关系的 glossary 条目列表。
 * @returns 带有 `references` 字段的 glossary 条目列表。
 */
function enrichGlossaryReferences(entries: MemoryEntry[]): MemoryEntry[] {
  const uniqueTerms = [
    ...new Set(entries.map((entry) => entry.term?.trim()).filter(Boolean) as string[])
  ]
  const sortedTerms = uniqueTerms.sort((left, right) => right.length - left.length)

  return entries.map((entry) => {
    const normalizedText = normalizeSearchText(entry.text)
    const normalizedTerm = normalizeSearchText(entry.term || '')
    const references = sortedTerms
      .filter((candidate) => normalizeSearchText(candidate) !== normalizedTerm)
      .filter((candidate) => normalizedText.includes(normalizeSearchText(candidate)))
      .slice(0, 12)

    return references.length > 0 ? { ...entry, references } : entry
  })
}
