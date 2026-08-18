import {
  createAgentRuntime,
  type AgentRunRequest,
  type AgentRunResult,
  type AgentToolPackage
} from '@main/agent'
import { createDatetimeToolPackage } from '@main/agent/tools/datetime'
import { createResourceQueryToolPackage } from '@main/agent/tools/resource-query'
import type { LoreService } from '@main/knowledge/lore'
import type { MemoryService } from '@main/memory'
import type { AgentToolPackageId } from '@shared/agent'
import { createChatModel } from './model-factory'

export type ChatAgent = (request: Omit<AgentRunRequest, 'tools'>) => Promise<AgentRunResult>

/**
 * @description 创建当前聊天入口使用的 Agent，并在每次运行前按设置选择模型可见工具。
 * @param lore 原作资料服务。
 * @param memory 当前角色长期记忆服务。
 * @returns 当前聊天流程调用的 Agent 函数。
 */
export function createChatAgent(lore: LoreService, memory: MemoryService): ChatAgent {
  const runAgent = createAgentRuntime(createChatModel)

  return (request) =>
    runAgent({
      ...request,
      tools: createEnabledToolPackages(lore, memory, request.context.policy.enabledToolPackageIds)
    })
}

/**
 * @description 返回当前设置会暴露给模型的聊天工具名称。
 * @param lore 原作资料服务。
 * @param memory 当前角色长期记忆服务。
 * @param enabledToolPackageIds 已启用的工具包标识。
 * @returns 模型本次运行可见的工具名称。
 */
export function getEnabledChatAgentToolNames(
  lore: LoreService,
  memory: MemoryService,
  enabledToolPackageIds: AgentToolPackageId[]
): string[] {
  return createEnabledToolPackages(lore, memory, enabledToolPackageIds).flatMap((toolPackage) =>
    toolPackage.tools.map((tool) => tool.name)
  )
}

/**
 * @description 根据当前设置创建本次 Agent 运行可见的工具包。
 * @param lore 原作资料服务。
 * @param memory 当前角色长期记忆服务。
 * @param enabledToolPackageIds 已启用的工具包标识。
 * @returns 本次运行可绑定到模型的工具包。
 */
function createEnabledToolPackages(
  lore: LoreService,
  memory: MemoryService,
  enabledToolPackageIds: AgentToolPackageId[]
): AgentToolPackage[] {
  const enabled = new Set(enabledToolPackageIds)
  const toolPackages = [createResourceQueryToolPackage(lore, memory), createDatetimeToolPackage()]
  return toolPackages.filter((toolPackage) => enabled.has(toolPackage.id as AgentToolPackageId))
}
