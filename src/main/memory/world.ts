import { readdir, readFile } from 'fs/promises'
import { join, relative } from 'path'
import type { MemoryEntry } from '../../shared/ai'
import { now, pathExists } from '../utils'

export function splitMarkdownIntoChunks(content: string): string[] {
  return content
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
}

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

/** Converts markdown files under the world root into retrieval-ready memory entries. */
export async function loadWorldMarkdownEntries(worldRoot: string): Promise<MemoryEntry[]> {
  const markdownFiles = await walkMarkdownFiles(worldRoot)
  const entries = await Promise.all(
    markdownFiles.map(async (filePath) => {
      const content = await readFile(filePath, 'utf-8')
      const sourcePath = relative(worldRoot, filePath).replace(/\\/g, '/')

      return splitMarkdownIntoChunks(content).map((text, chunkIndex) => ({
        id: `world:${relative(worldRoot, filePath)}:${chunkIndex}`,
        text,
        sourceType: 'world' as const,
        sourcePath,
        chunkIndex,
        createdAt: now(),
        updatedAt: now(),
        visibility: 'shared' as const
      }))
    })
  )

  return entries.flat()
}
