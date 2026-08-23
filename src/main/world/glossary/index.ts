import { readFile } from 'fs/promises'
import { join } from 'path'
import { logger } from '@main/logging'
import { getWorldGlossaryRoot } from '@main/world/paths'
import { pathExists } from '@main/utils'

const GLOSSARY_FILE_NAME = '名词解释.json'

export type GlossarySearchMode = 'term' | 'definition' | 'both'

export type GlossaryEntry = {
  term: string
  definition: string
}

export type GlossaryMatch = GlossaryEntry & {
  matchType: 'exact' | 'term' | 'definition'
}

export type GlossaryQueryResult = {
  query: string
  matches: GlossaryMatch[]
  truncated: boolean
}

/**
 * @description 读取并查询本地 world 名词解释文件，且在同一实例中缓存已校验的词条。
 */
export class GlossaryService {
  private entriesPromise: Promise<GlossaryEntry[]> | null = null

  /**
   * @description 批量查询本地世界观名词，并按输入词顺序返回结果。
   * @param queries 需要查询的原始词条列表。
   * @param mode 匹配词条名、释义正文或两者。
   * @param limit 每个查询词允许返回的最大结果数量。
   * @returns 每个查询词对应的命中结果。
   */
  async search(
    queries: string[],
    mode: GlossarySearchMode,
    limit: number
  ): Promise<GlossaryQueryResult[]> {
    const entries = await this.loadEntries()
    return queries.map((query) => searchEntries(entries, query, mode, limit))
  }

  /**
   * @description 丢弃当前词典缓存，使下一次读取反映下载后的 world 资料。
   */
  invalidate(): void {
    this.entriesPromise = null
  }

  /**
   * @description 返回已校验的词典快照；并发读取共享同一次文件解析。
   * @returns 本地名词解释条目。
   */
  private async loadEntries(): Promise<GlossaryEntry[]> {
    if (!this.entriesPromise) {
      this.entriesPromise = this.readEntries().catch(async (error) => {
        this.entriesPromise = null
        const filePath = getGlossaryFilePath()
        await logger.error('main', 'world-glossary-load-failed', 'Failed to load world glossary', {
          filePath,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      })
    }
    return this.entriesPromise
  }

  /**
   * @description 从固定的 world 资料路径读取并校验名词解释 JSON 文件。
   * @returns 通过结构校验的词典条目。
   */
  private async readEntries(): Promise<GlossaryEntry[]> {
    const filePath = getGlossaryFilePath()
    if (!(await pathExists(filePath))) {
      throw new Error(`World glossary file does not exist: ${filePath}`)
    }
    return parseGlossary(await readFile(filePath, 'utf8'), filePath)
  }
}

/**
 * @description 返回固定的本地 world 名词解释文件路径。
 * @returns 名词解释 JSON 的绝对路径。
 */
function getGlossaryFilePath(): string {
  return join(getWorldGlossaryRoot(), GLOSSARY_FILE_NAME)
}

/**
 * @description 校验并转换名词解释 JSON 文件内容，保留同名词条以保留源资料。
 * @param content 文件原始文本。
 * @param filePath 当前解析的文件路径，用于生成可诊断错误。
 * @returns 可供查询的词典条目。
 */
function parseGlossary(content: string, filePath: string): GlossaryEntry[] {
  const value: unknown = JSON.parse(content)
  if (!Array.isArray(value)) {
    throw new Error(`World glossary must be an array: ${filePath}`)
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`World glossary entry ${index} must be an object: ${filePath}`)
    }
    const raw = item as Record<string, unknown>
    if (typeof raw.key !== 'string' || !raw.key.trim()) {
      throw new Error(`World glossary entry ${index} has an invalid key: ${filePath}`)
    }
    if (typeof raw.value !== 'string' || !raw.value.trim()) {
      throw new Error(`World glossary entry ${index} has an invalid value: ${filePath}`)
    }
    return { term: raw.key, definition: raw.value }
  })
}

/**
 * @description 对单个查询词执行有限结果的相关性匹配。
 * @param entries 已校验的词典条目。
 * @param query 用户或模型请求的查询词。
 * @param mode 匹配范围。
 * @param limit 可返回的最大结果数量。
 * @returns 保持源文件稳定顺序的匹配结果。
 */
function searchEntries(
  entries: GlossaryEntry[],
  query: string,
  mode: GlossarySearchMode,
  limit: number
): GlossaryQueryResult {
  const comparableQuery = toComparableText(query)
  const ranked = entries
    .map((entry, index) => ({
      entry,
      index,
      matchType: getMatchType(entry, comparableQuery, mode)
    }))
    .filter(
      (
        candidate
      ): candidate is {
        entry: GlossaryEntry
        index: number
        matchType: GlossaryMatch['matchType']
      } => candidate.matchType !== null
    )
    .sort(
      (left, right) =>
        getMatchRank(left.matchType) - getMatchRank(right.matchType) || left.index - right.index
    )

  return {
    query,
    matches: ranked.slice(0, limit).map(({ entry, matchType }) => ({ ...entry, matchType })),
    truncated: ranked.length > limit
  }
}

/**
 * @description 判定词典条目在指定查询模式下的最佳匹配类型。
 * @param entry 待匹配的词典条目。
 * @param comparableQuery 已规范化的非空查询文本。
 * @param mode 匹配范围。
 * @returns 匹配类型；不匹配时为 `null`。
 */
function getMatchType(
  entry: GlossaryEntry,
  comparableQuery: string,
  mode: GlossarySearchMode
): GlossaryMatch['matchType'] | null {
  const comparableTerm = toComparableText(entry.term)
  if (mode !== 'definition') {
    if (comparableTerm === comparableQuery) return 'exact'
    if (comparableTerm.includes(comparableQuery)) return 'term'
  }
  if (mode !== 'term' && toComparableText(entry.definition).includes(comparableQuery)) {
    return 'definition'
  }
  return null
}

/**
 * @description 规范化用于中文词条比对的文本，忽略空白、常见引号和英文字母大小写。
 * @param value 待规范化的文本。
 * @returns 可稳定比较的文本。
 */
function toComparableText(value: string): string {
  return value.replace(/[\s「」『』“”‘’"']/gu, '').toLocaleLowerCase('en-US')
}

/**
 * @description 将匹配类型转换为从高到低的相关性排序值。
 * @param matchType 当前匹配类型。
 * @returns 越小代表相关性越高的排序值。
 */
function getMatchRank(matchType: GlossaryMatch['matchType']): number {
  if (matchType === 'exact') return 0
  if (matchType === 'term') return 1
  return 2
}
