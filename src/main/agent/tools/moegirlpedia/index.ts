import type { AgentTool, AgentToolPackage } from '@main/agent/runtime/agent-types'
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_PAGE_CHARS,
  MAX_SEARCH_LIMIT,
  MoeGirlpediaApiClient
} from './api'
import type { MoeGirlpediaSettings } from '@shared/agent-settings'

/**
 * @description 创建只读萌娘百科搜索和页面读取工具包。
 * @param settings 萌娘百科 Bot Password 配置。
 * @param client 可选的可复用萌娘百科 API 客户端。
 * @returns 萌娘百科 Agent 工具包。
 */
export function createMoeGirlpediaToolPackage(
  settings: MoeGirlpediaSettings,
  client = new MoeGirlpediaApiClient(settings)
): AgentToolPackage {
  return { id: 'moegirlpedia', tools: [createSearchTool(client), createReadPageTool(client)] }
}

/**
 * @description 创建搜索萌娘百科页面的 Agent 工具。
 * @param client 萌娘百科 API 客户端。
 * @returns 搜索工具定义。
 */
function createSearchTool(client: MoeGirlpediaApiClient): AgentTool {
  return {
    name: 'search_moegirlpedia',
    description: 'Search Moegirlpedia for page titles and short source snippets.',
    definition: {
      type: 'function',
      function: {
        name: 'search_moegirlpedia',
        description:
          'Search Moegirlpedia. Use this before reading a page when the exact title is unknown.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 1, maxLength: 120 },
            limit: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_LIMIT }
          }
        }
      }
    },
    execute: async (input, context) => {
      const query = parseText(input.query, 'query', 120)
      const limit = parseLimit(input.limit)
      const items = await client.search(query, limit, context.abortSignal)
      return {
        status: 'completed' as const,
        data: { query, items },
        sourceIds: items.map((item) => item.title),
        complete: true
      }
    }
  }
}

/**
 * @description 创建读取萌娘百科页面正文的 Agent 工具。
 * @param client 萌娘百科 API 客户端。
 * @returns 页面读取工具定义。
 */
function createReadPageTool(client: MoeGirlpediaApiClient): AgentTool {
  return {
    name: 'read_moegirlpedia_page',
    description: 'Read the current wikitext of one Moegirlpedia page.',
    definition: {
      type: 'function',
      function: {
        name: 'read_moegirlpedia_page',
        description:
          'Read one Moegirlpedia page by its exact title. Search first if the title is uncertain.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 160 },
            maxChars: { type: 'integer', minimum: 500, maximum: MAX_PAGE_CHARS }
          }
        }
      }
    },
    execute: async (input, context) => {
      const title = parseText(input.title, 'title', 160)
      const maxChars = parsePageLimit(input.maxChars)
      const page = await client.readPage(title, context.abortSignal)
      const content = page.content.slice(0, maxChars)
      return {
        status: 'completed' as const,
        data: { ...page, content, truncated: content.length < page.content.length },
        sourceIds: [page.title],
        complete: content.length === page.content.length
      }
    }
  }
}

/**
 * @description 校验工具输入中的文本字段。
 * @param value 未受信任的输入值。
 * @param field 字段名称。
 * @param maxLength 允许的最大字符数。
 * @returns 去除首尾空白后的文本。
 */
function parseText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(field + ' must be a non-empty string.')
  const normalized = value.trim()
  if (normalized.length > maxLength)
    throw new Error(field + ' must be at most ' + maxLength + ' characters.')
  return normalized
}

/**
 * @description 校验搜索结果数量。
 * @param value 模型提供的数量参数。
 * @returns 规范化后的结果数量。
 */
function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_SEARCH_LIMIT
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_SEARCH_LIMIT
  )
    throw new Error('limit must be an integer between 1 and ' + MAX_SEARCH_LIMIT + '.')
  return value
}

/**
 * @description 校验页面正文截断长度。
 * @param value 模型提供的截断长度。
 * @returns 规范化后的截断长度。
 */
function parsePageLimit(value: unknown): number {
  if (value === undefined) return MAX_PAGE_CHARS
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 500 ||
    value > MAX_PAGE_CHARS
  )
    throw new Error('maxChars must be an integer between 500 and ' + MAX_PAGE_CHARS + '.')
  return value
}
