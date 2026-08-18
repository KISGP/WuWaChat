import type { AgentPolicy } from '@shared/agent'

const MAX_TOOL_ROUNDS = 3 as const

/**
 * @description 创建 Agent 循环共享的最大工具调用轮次策略。
 * @returns 当前产品固定的三轮工具调用限制。
 */
export function createAgentLoopPolicy(): Pick<AgentPolicy, 'maxToolRounds'> {
  return { maxToolRounds: MAX_TOOL_ROUNDS }
}
