import type { LoreService } from '@main/knowledge/lore'
import type { MemoryService } from '@main/memory'
import type { AgentToolPackage } from '@main/agent/runtime/agent-types'
import { validateResourceQueryCalls } from './policy'
import { createResourceQueryRegistry } from './resources'
import { createResourceQueryTools } from './tools'

/**
 * @description 创建包含 Lore 与当前角色记忆的声明式资源查询工具包。
 * @param lore 原作资料服务。
 * @param memory 当前角色长期记忆服务。
 * @returns 资源查询工具包。
 */
export function createResourceQueryToolPackage(
  lore: LoreService,
  memory: MemoryService
): AgentToolPackage {
  const resources = createResourceQueryRegistry(lore, memory)
  return {
    id: 'resource-query',
    tools: createResourceQueryTools(resources),
    validateCalls: validateResourceQueryCalls
  }
}
