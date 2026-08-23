import type { AgentPolicy } from '@shared/agent'
import { DEFAULT_MAX_TOOL_ROUNDS } from '@shared/agent-settings'

/**
 * @description 创建 Agent 循环共享的最大工具调用轮次策略。
 * @param maxToolRounds 用户配置的最大工具调用轮次。
 * @returns 经过数值规范化的工具调用轮次策略。
 */
export function createAgentLoopPolicy(
  maxToolRounds: number = DEFAULT_MAX_TOOL_ROUNDS
): Pick<AgentPolicy, 'maxToolRounds'> {
  const numericRounds = Number.isFinite(maxToolRounds)
    ? Math.round(maxToolRounds)
    : DEFAULT_MAX_TOOL_ROUNDS
  return { maxToolRounds: numericRounds }
}
