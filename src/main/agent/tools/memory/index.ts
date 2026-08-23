import type { MemoryService } from '@main/memory'
import type { AgentTool, AgentToolContext, AgentToolPackage } from '@main/agent/runtime/agent-types'

/**
 * @description 创建独立的长期记忆查询工具包。
 * @param memory 长期记忆服务。
 * @returns 记忆工具包。
 */
export function createMemoryToolPackage(memory: MemoryService): AgentToolPackage {
  return { id: 'memory', tools: [createMemoryQueryTool(memory)] }
}

/** @description 创建按当前会话范围查询记忆的工具。 
 * @param memory 长期记忆服务。 
 * @returns 记忆查询工具。 
 * */
function createMemoryQueryTool(memory: MemoryService): AgentTool {
  return {
    name: 'query_memory',
    description: 'Query independent long-term memory from the selected chat session.',
    definition: {
      type: 'function',
      function: {
        name: 'query_memory',
        description: 'Query long-term memory entries; unavailable without a selected session.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            conditions: { type: 'array', items: { type: 'object' } },
            limit: { type: 'integer', minimum: 1, maximum: 20 }
          }
        }
      }
    },
    execute: async (input: Record<string, unknown>, context: AgentToolContext) => {
      if (context.policy.memoryScope === 'none')
        return {
          status: 'completed' as const,
          data: { records: [], nextCursor: null, truncated: false },
          complete: true
        }
      const page = memory.queryAgentResource(input, context.session)
      return {
        status: 'completed' as const,
        data: page,
        sourceIds: page.records.map((record) => record.id),
        complete: !page.truncated
      }
    }
  }
}
