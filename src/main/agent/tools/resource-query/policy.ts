import type { AgentResourceId, AgentPolicy } from '@shared/agent'
import type {
  AgentToolCall,
  AgentToolCallRejection,
  AgentToolContext
} from '@main/agent/runtime/agent-types'

const RESOURCE_IDS: AgentResourceId[] = ['lore.scenes', 'lore.glossary', 'memory.entries']

/**
 * @description 创建资源查询能力的跨资源与长期记忆访问策略。
 * @param allowCrossResourceContext 是否允许单次回答综合多个资源来源。
 * @param crossSessionCharacterMemory 是否允许读取当前角色的全部会话。
 * @returns 资源查询能力需要的策略字段。
 */
export function createResourceQueryPolicy(
  allowCrossResourceContext: boolean,
  crossSessionCharacterMemory: boolean
): Pick<AgentPolicy, 'allowCrossResourceContext' | 'memoryScope'> {
  return {
    allowCrossResourceContext,
    memoryScope: crossSessionCharacterMemory ? 'character-all-sessions' : 'current-session'
  }
}

/**
 * @description 判断单个资源调用是否符合本轮已建立的资源范围。
 * @param context 当前聊天与 Agent 上下文。
 * @param resourceId 待访问的资源标识。
 * @returns 允许访问时返回 `true`。
 */
export function canAccessResource(context: AgentToolContext, resourceId: AgentResourceId): boolean {
  if (resourceId === 'memory.entries' && context.session.characterId !== context.character.id) {
    return false
  }

  return (
    context.policy.allowCrossResourceContext ||
    context.accessedResourceIds.size === 0 ||
    context.accessedResourceIds.has(resourceId)
  )
}

/**
 * @description 在并行执行前拒绝违反跨资源策略的同轮资源调用。
 * @param calls 模型在当前轮提出的全部工具调用。
 * @param context 当前聊天与 Agent 上下文。
 * @returns 需要拒绝的调用及其模型可读原因。
 */
export function validateResourceQueryCalls(
  calls: AgentToolCall[],
  context: AgentToolContext
): AgentToolCallRejection[] {
  if (context.policy.allowCrossResourceContext) {
    return []
  }

  const priorResource = context.accessedResourceIds.values().next().value as
    | AgentResourceId
    | undefined
  const firstRequestedResource = calls
    .map(getRequestedResource)
    .find((resource): resource is AgentResourceId => resource !== null)
  const permittedResource = priorResource || firstRequestedResource

  if (!permittedResource) {
    return []
  }

  return calls.flatMap((call) => {
    const requestedResource = getRequestedResource(call)
    return requestedResource && requestedResource !== permittedResource
      ? [
          {
            callId: call.id,
            message: 'Cross-resource context is disabled for this response.'
          }
        ]
      : []
  })
}

/**
 * @description 从资源查询或读取调用中提取受支持的资源标识。
 * @param call 模型请求的工具调用。
 * @returns 资源标识；非资源调用或无效来源返回 `null`。
 */
export function getRequestedResource(call: AgentToolCall): AgentResourceId | null {
  if (call.name !== 'query_resource' && call.name !== 'read_resource') {
    return null
  }
  const source = call.args.source
  return typeof source === 'string' && RESOURCE_IDS.includes(source as AgentResourceId)
    ? (source as AgentResourceId)
    : null
}

/**
 * @description 返回资源查询 DSL 支持的全部资源标识。
 * @returns 模型参数 schema 使用的资源标识数组。
 */
export function getResourceIds(): AgentResourceId[] {
  return RESOURCE_IDS
}
