import type { LoreService } from '@main/knowledge/lore'
import type { MemoryService } from '@main/memory'
import type { AgentResource } from '@main/agent/runtime/agent-types'
import type { AgentResourceId } from '@shared/agent'

/**
 * @description 管理资源查询能力可读取的只读资源适配器。
 */
export class ResourceQueryRegistry {
  private readonly resources = new Map<AgentResourceId, AgentResource>()

  /**
   * @description 创建资源查询注册表。
   * @param resources 当前能力包公开的资源适配器。
   */
  constructor(resources: AgentResource[]) {
    resources.forEach((resource) => this.resources.set(resource.id, resource))
  }

  /**
   * @description 按资源标识查找资源适配器。
   * @param id 资源标识。
   * @returns 匹配的资源；不存在时返回 `null`。
   */
  get(id: AgentResourceId): AgentResource | null {
    return this.resources.get(id) || null
  }

  /**
   * @description 返回已注册资源的文字说明，供模型发现 DSL 可用来源。
   * @returns 每个资源一行的标识与说明。
   */
  describe(): string {
    return [...this.resources.values()]
      .map((resource) => `${resource.id}: ${resource.description}`)
      .join('\n')
  }
}

/**
 * @description 创建当前聊天资源查询能力需要的 Lore 与记忆资源适配器。
 * @param lore 原作资料服务。
 * @param memory 当前角色长期记忆服务。
 * @returns 可供资源查询工具访问的资源注册表。
 */
export function createResourceQueryRegistry(
  lore: LoreService,
  memory: MemoryService
): ResourceQueryRegistry {
  return new ResourceQueryRegistry([
    {
      id: 'lore.scenes',
      description: 'Original story scenes with titles, task metadata, participants, and full text.',
      query: (input) => lore.queryAgentResource({ ...input, source: 'lore.scenes' }),
      read: (input) => lore.readAgentResource({ ...input, source: 'lore.scenes' })
    },
    {
      id: 'lore.glossary',
      description: 'Original glossary terms and definitions.',
      query: (input) => lore.queryAgentResource({ ...input, source: 'lore.glossary' }),
      read: (input) => lore.readAgentResource({ ...input, source: 'lore.glossary' })
    },
    {
      id: 'memory.entries',
      description: 'Long-term memory entries from the current character sessions.',
      query: (input, context) => Promise.resolve(memory.queryAgentResource(input, context.session)),
      read: async (input, context) => {
        const ids = Array.isArray(input.ids)
          ? input.ids.filter((id): id is string => typeof id === 'string')
          : []
        return memory.queryAgentResource(
          {
            source: 'memory.entries',
            conditions: [{ field: 'id', operator: 'in', value: ids }],
            limit: ids.length || 8
          },
          context.session
        )
      }
    }
  ])
}
