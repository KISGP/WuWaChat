import type { AgentTool, AgentToolPackage } from '@main/agent/runtime/agent-types'
import { type GlossaryService, type GlossarySearchMode } from '@main/world/glossary'

const MAX_QUERY_COUNT = 8
const MAX_RESULTS_PER_QUERY = 8
const DEFAULT_RESULTS_PER_QUERY = 5

/**
 * @description 创建用于批量查询 world 名词解释的只读工具包。
 * @param glossary 本地 world 名词解释服务。
 * @returns 独立的名词解释工具包。
 */
export function createGlossaryToolPackage(glossary: GlossaryService): AgentToolPackage {
  return { id: 'glossary', tools: [createGlossarySearchTool(glossary)] }
}

/**
 * @description 创建按词条名或释义内容搜索本地 world 名词解释的工具。
 * @param glossary 本地 world 名词解释服务。
 * @returns 词典搜索工具。
 */
function createGlossarySearchTool(glossary: GlossaryService): AgentTool {
  return {
    name: 'search_world_glossary',
    description: 'Search local world glossary definitions for one or more requested terms.',
    definition: {
      type: 'function',
      function: {
        name: 'search_world_glossary',
        description:
          'Search the local world glossary. query is a batch of one to eight terms; default mode matches entry names only.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: {
            query: {
              type: 'array',
              minItems: 1,
              maxItems: MAX_QUERY_COUNT,
              items: { type: 'string', minLength: 1 }
            },
            mode: {
              type: 'string',
              enum: ['term', 'definition', 'both'],
              description:
                'term searches entry names; definition searches text; both searches both.'
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: MAX_RESULTS_PER_QUERY,
              description: 'Maximum matches returned for each input query.'
            }
          }
        }
      }
    },
    execute: async (input: Record<string, unknown>) => {
      const request = parseSearchRequest(input)
      const results = await glossary.search(request.query, request.mode, request.limit)
      return {
        status: 'completed' as const,
        data: { results },
        sourceIds: results.flatMap((result) => result.matches.map((match) => match.term)),
        complete: !results.some((result) => result.truncated)
      }
    }
  }
}

/**
 * @description 校验工具调用参数并补全可选查询配置。
 * @param input 模型提供的未受信任参数。
 * @returns 可安全传递给名词解释服务的查询请求。
 */
function parseSearchRequest(input: Record<string, unknown>): {
  query: string[]
  mode: GlossarySearchMode
  limit: number
} {
  if (
    !Array.isArray(input.query) ||
    input.query.length === 0 ||
    input.query.length > MAX_QUERY_COUNT
  ) {
    throw new Error(`query must contain between 1 and ${MAX_QUERY_COUNT} terms.`)
  }
  const query = input.query.map((value, index) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`query[${index}] must be a non-empty string.`)
    }
    const normalized = value.trim()
    if (!hasSearchableContent(normalized)) {
      throw new Error(`query[${index}] must contain searchable text.`)
    }
    return normalized
  })
  const mode = parseSearchMode(input.mode)
  const limit = parseLimit(input.limit)
  return { query, mode, limit }
}

/**
 * @description 判断查询词在忽略空白和常见引号后是否仍包含可检索文本。
 * @param value 已去除首尾空白的查询词。
 * @returns 存在可用于匹配的文本时返回 `true`。
 */
function hasSearchableContent(value: string): boolean {
  return Boolean(value.replace(/[\s「」『』“”‘’"']/gu, ''))
}

/**
 * @description 校验可选的词典匹配模式。
 * @param value 模型提供的模式参数。
 * @returns 已验证的模式，未传入时默认按词条名查询。
 */
function parseSearchMode(value: unknown): GlossarySearchMode {
  if (value === undefined) return 'term'
  if (value === 'term' || value === 'definition' || value === 'both') return value
  throw new Error('mode must be term, definition, or both.')
}

/**
 * @description 校验每个查询词允许返回的最大结果数量。
 * @param value 模型提供的结果数量。
 * @returns 已验证的限制，未传入时使用默认值。
 */
function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_RESULTS_PER_QUERY
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('limit must be an integer.')
  }
  if (value < 1 || value > MAX_RESULTS_PER_QUERY) {
    throw new Error(`limit must be between 1 and ${MAX_RESULTS_PER_QUERY}.`)
  }
  return value
}
