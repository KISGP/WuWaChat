import { logger } from '@main/logging'
import type { AgentTool, AgentToolCall, AgentToolContext, AgentToolResult } from './agent-types'
import type { AgentToolTrace } from '@shared/agent'
import { AgentToolRegistry } from './tool-registry'

/**
 * @description 执行已注册的 Agent 工具，并将失败或策略拒绝转换为模型可读取的结果。
 */
export class AgentToolExecutor {
  /**
   * @description 创建基于能力工具注册表的执行器。
   * @param registry 当前 Agent 的工具注册表。
   */
  constructor(private readonly registry: AgentToolRegistry) {}

  /**
   * @description 返回供模型绑定的全部工具定义。
   * @returns 可绑定到模型的工具定义。
   */
  getDefinitions(): AgentTool['definition'][] {
    return this.registry.getDefinitions()
  }

  /**
   * @description 并行执行同一轮工具调用，并先应用能力包的批量策略校验。
   * @param calls 模型请求的工具调用。
   * @param context 当前聊天与 Agent 上下文。
   * @param round 当前工具调用轮次。
   * @param onTrace 工具轨迹回调。
   * @returns 按模型调用 ID 对应的结构化工具结果。
   */
  async executeParallel(
    calls: AgentToolCall[],
    context: AgentToolContext,
    round: number,
    onTrace?: (trace: AgentToolTrace) => void
  ): Promise<{ id: string; name: string; result: AgentToolResult }[]> {
    const rejections = this.registry.validateCalls(calls, context)
    return Promise.all(
      calls.map(async (call) => {
        context.abortSignal?.throwIfAborted()
        const rejection = rejections.get(call.id)
        if (rejection) {
          onTrace?.({
            round,
            toolCallId: call.id,
            toolName: call.name,
            input: call.args,
            outputSummary: rejection.message,
            output: { status: 'rejected', error: rejection.message },
            status: 'rejected'
          })
          return {
            id: call.id,
            name: call.name,
            result: { status: 'rejected', error: rejection.message }
          }
        }

        const tool = this.registry.get(call.name)
        if (!tool) {
          return {
            id: call.id,
            name: call.name,
            result: { status: 'rejected', error: `Tool ${call.name} is not available.` }
          }
        }

        try {
          const result = await tool.execute(call.args, context)
          onTrace?.({
            round,
            toolCallId: call.id,
            toolName: call.name,
            input: call.args,
            outputSummary: summarizeToolResult(result),
            output: result,
            status: result.status,
            sourceIds: result.sourceIds
          })
          context.abortSignal?.throwIfAborted()
          return { id: call.id, name: call.name, result }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          void logger.warn('ai', 'agent-tool-failed', 'Agent tool execution failed', {
            toolName: call.name,
            error: message
          })
          onTrace?.({
            round,
            toolCallId: call.id,
            toolName: call.name,
            input: call.args,
            outputSummary: message,
            output: { status: 'failed', error: message },
            status: 'failed'
          })
          context.abortSignal?.throwIfAborted()
          return {
            id: call.id,
            name: call.name,
            result: { status: 'failed', error: message }
          }
        }
      })
    )
  }
}

/**
 * @description 将结构化工具结果压缩为可写入 Agent 轨迹的摘要。
 * @param result 工具执行结果。
 * @returns 不超过 240 个字符的结果摘要。
 */
function summarizeToolResult(result: AgentToolResult): string {
  const serialized = JSON.stringify(result)
  return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized
}
