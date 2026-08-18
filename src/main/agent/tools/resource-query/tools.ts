import type { AgentResourceId } from '@shared/agent'
import type { AgentTool, AgentToolContext } from '@main/agent/runtime/agent-types'
import { canAccessResource, getResourceIds } from './policy'
import { ResourceQueryRegistry } from './resources'

/**
 * @description 创建资源说明、查询与读取三项统一 DSL 工具。
 * @param resources 当前能力包公开的资源注册表。
 * @returns 可供模型绑定的资源查询工具。
 */
export function createResourceQueryTools(resources: ResourceQueryRegistry): AgentTool[] {
  return [
    createDescribeResourceTool(resources),
    createQueryResourceTool(resources),
    createReadResourceTool(resources)
  ]
}

/**
 * @description 创建列出可查询资源和字段说明的工具。
 * @param resources 当前能力包公开的资源注册表。
 * @returns 资源说明工具。
 */
function createDescribeResourceTool(resources: ResourceQueryRegistry): AgentTool {
  return {
    name: 'describe_resource',
    description: 'Describe the available read-only resource views and query fields.',
    definition: {
      type: 'function',
      function: {
        name: 'describe_resource',
        description: 'Describe the available read-only resource views and query fields.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {}
        }
      }
    },
    execute: async () => ({
      status: 'completed',
      data: resources.describe(),
      complete: true
    })
  }
}

/**
 * @description 创建按声明式条件查询资源页面的工具。
 * @param resources 当前能力包公开的资源注册表。
 * @returns 资源查询工具。
 */
function createQueryResourceTool(resources: ResourceQueryRegistry): AgentTool {
  const resourceIds = getResourceIds()
  return {
    name: 'query_resource',
    description:
      'Query a permitted read-only resource. Use conditions to filter fields and return a small page of evidence.',
    definition: {
      type: 'function',
      function: {
        name: 'query_resource',
        description: `Query a permitted read-only resource. Available sources: ${resourceIds.join(', ')}.`,
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['source'],
          properties: {
            source: { type: 'string', enum: resourceIds },
            conditions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['field', 'operator', 'value'],
                properties: {
                  field: { type: 'string' },
                  operator: { type: 'string', enum: ['equals', 'contains', 'in'] },
                  value: { type: ['string', 'array'], items: { type: 'string' } }
                }
              }
            },
            limit: { type: 'integer', minimum: 1, maximum: 20 },
            cursor: { type: ['string', 'null'] }
          }
        }
      }
    },
    execute: async (input: Record<string, unknown>, context: AgentToolContext) => {
      const source = getValidResourceId(input.source, resourceIds)
      if (!source) {
        throw new Error('Unknown resource source.')
      }
      if (!canAccessResource(context, source)) {
        throw new Error(
          'This Agent response cannot combine the requested resource with prior resources.'
        )
      }

      const resource = resources.get(source)
      if (!resource) {
        throw new Error(`Resource ${source} is unavailable.`)
      }

      context.accessedResourceIds.add(source)
      const page = await resource.query(input, context)
      return {
        status: 'completed',
        data: page,
        sourceIds: page.records.map((record) => record.id),
        complete: !page.truncated
      }
    }
  }
}

/**
 * @description 创建读取已查询资源完整记录的工具。
 * @param resources 当前能力包公开的资源注册表。
 * @returns 资源读取工具。
 */
function createReadResourceTool(resources: ResourceQueryRegistry): AgentTool {
  const resourceIds = getResourceIds()
  return {
    name: 'read_resource',
    description: 'Read full context for records previously returned by query_resource.',
    definition: {
      type: 'function',
      function: {
        name: 'read_resource',
        description: 'Read full context for records previously returned by query_resource.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['source', 'ids'],
          properties: {
            source: { type: 'string', enum: resourceIds },
            ids: { type: 'array', items: { type: 'string' }, maxItems: 8 }
          }
        }
      }
    },
    execute: async (input: Record<string, unknown>, context: AgentToolContext) => {
      const source = getValidResourceId(input.source, resourceIds)
      const ids = input.ids
      if (!source || !Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
        throw new Error('Invalid resource read arguments.')
      }
      if (!canAccessResource(context, source)) {
        throw new Error(
          'This Agent response cannot combine the requested resource with prior resources.'
        )
      }

      const resource = resources.get(source)
      if (!resource?.read) {
        throw new Error(`Resource ${source} does not support record reads.`)
      }

      context.accessedResourceIds.add(source)
      const page = await resource.read({ ...input, ids }, context)
      return {
        status: 'completed',
        data: page,
        sourceIds: page.records.map((record) => record.id),
        complete: !page.truncated
      }
    }
  }
}

/**
 * @description 验证工具参数中的资源标识是否属于当前能力公开的资源。
 * @param value 未受信任的工具参数值。
 * @param resourceIds 当前能力公开的资源标识。
 * @returns 有效资源标识；无效时返回 `null`。
 */
function getValidResourceId(
  value: unknown,
  resourceIds: AgentResourceId[]
): AgentResourceId | null {
  return typeof value === 'string' && resourceIds.includes(value as AgentResourceId)
    ? (value as AgentResourceId)
    : null
}
