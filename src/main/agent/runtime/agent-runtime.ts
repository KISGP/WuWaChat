import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type AIMessageChunk,
  type BaseMessage
} from '@langchain/core/messages'
import { logger } from '@main/logging'
import type {
  AgentModelFactory,
  AgentRunRequest,
  AgentRunResult,
  AgentToolCall,
  AgentToolResult
} from './agent-types'
import { AgentToolExecutor } from './tool-executor'
import { AgentToolRegistry } from './tool-registry'

/**
 * @description 执行单一聊天 Agent 的原生工具调用循环。
 * @remarks 每轮允许并行工具调用；达到三轮后会使用禁用工具的模型调用完成最终回答。
 * @param request 当前角色、历史消息、工具上下文和流式回调。
 * @param modelFactory 根据当前模型配置创建模型的适配器。
 * @returns 最终助手文本、完整模型消息和工具轨迹。
 */
export async function runAgent(
  request: AgentRunRequest,
  modelFactory: AgentModelFactory
): Promise<AgentRunResult> {
  const model = modelFactory(request.profile)
  const executor = new AgentToolExecutor(new AgentToolRegistry(request.tools))
  const definitions = executor.getDefinitions()
  if (definitions.length > 0 && !model.bindTools) {
    throw new Error('The configured chat model does not support native tool calling.')
  }

  const messages = [
    new SystemMessage(
      'You are a read-only chat Agent. Use tool results as auxiliary evidence. When stating original-story facts, prefer verified Lore tool results over model memory; if evidence is missing, say so instead of inventing canon.'
    ),
    ...request.history
  ]
  const traces = [] as AgentRunResult['traces']
  const boundModel = definitions.length > 0 ? model.bindTools!(definitions) : model
  let toolRounds = 0

  while (toolRounds < request.context.policy.maxToolRounds) {
    const response = await streamAgentResponse(boundModel, messages, request.abortSignal)
    const toolCalls = normalizeToolCalls(response)
    if (toolCalls.length === 0) {
      const assistantDraft = contentToText(response.content)
      emitAssistantChunks(assistantDraft, request.onChunk)
      return {
        assistantDraft,
        messages: [...messages, response],
        traces,
        toolRounds,
        incomplete: false
      }
    }

    toolRounds += 1
    messages.push(response)
    const toolResults = await executor.executeParallel(
      toolCalls,
      request.context,
      toolRounds,
      (trace) => {
        traces.push(trace)
        request.onTrace?.(trace)
      }
    )
    messages.push(
      ...toolResults.map(
        (result) =>
          new ToolMessage({
            tool_call_id: result.id,
            name: result.name,
            content: serializeToolResult(result.result)
          })
      )
    )
  }

  messages.push(
    new HumanMessage(
      'The read-only tool budget is exhausted. Answer the user now without calling tools. If the requested lookup may be incomplete, explicitly state 查询未完成.'
    )
  )
  const finalResponse = await streamAgentResponse(model, messages, request.abortSignal)
  const assistantDraft = contentToText(finalResponse.content)
  emitAssistantChunks(assistantDraft, request.onChunk)
  void logger.info('ai', 'agent-tool-round-limit-reached', 'Agent tool round limit reached', {
    toolRounds,
    incomplete: true
  })
  return {
    assistantDraft,
    messages: [...messages, finalResponse],
    traces,
    toolRounds,
    incomplete: true
  }
}

/**
 * @description 创建绑定模型工厂的 Agent 运行函数。
 * @param modelFactory 当前应用提供的模型适配器工厂。
 * @returns 可执行一次 Agent 工具循环的函数。
 */
export function createAgentRuntime(modelFactory: AgentModelFactory) {
  return (request: AgentRunRequest): Promise<AgentRunResult> => runAgent(request, modelFactory)
}

/**
 * @description 流式获取一次模型响应并合并增量消息，期间不把工具规划文本展示给用户。
 * @param model 已绑定或未绑定工具的模型。
 * @param messages 当前模型消息。
 * @param abortSignal 当前运行取消信号。
 * @returns 合并后的 AI 消息增量。
 */
async function streamAgentResponse(
  model: {
    stream: (
      messages: BaseMessage[],
      options?: { signal?: AbortSignal }
    ) => AsyncIterable<AIMessageChunk> | Promise<AsyncIterable<AIMessageChunk>>
  },
  messages: BaseMessage[],
  abortSignal: AbortSignal
): Promise<AIMessageChunk> {
  const stream = await model.stream(messages, { signal: abortSignal })
  let combined: AIMessageChunk | null = null
  for await (const chunk of stream) {
    combined = combined ? combined.concat(chunk) : chunk
  }

  if (!combined) {
    throw new Error('Model returned no response.')
  }
  return combined
}

/**
 * @description 将 LangChain AI 消息中的工具调用转换为安全的执行参数。
 * @param message 模型返回的 AI 消息。
 * @returns 可并行执行的工具调用列表。
 */
function normalizeToolCalls(message: AIMessageChunk): AgentToolCall[] {
  return (message.tool_calls || [])
    .filter((call) => typeof call.id === 'string' && typeof call.name === 'string')
    .map((call) => ({
      id: call.id as string,
      name: call.name,
      args: call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {}
    }))
}

/**
 * @description 将最终助手文本按换行分块发送给现有聊天流式事件。
 * @param content 最终助手文本。
 * @param onChunk 文本块回调。
 */
function emitAssistantChunks(content: string, onChunk: (text: string) => void): void {
  if (content) {
    onChunk(content)
  }
}

/**
 * @description 将结构化工具结果编码为模型可读取的 ToolMessage 内容。
 * @param result 工具执行结果。
 * @returns 稳定的 JSON 内容；序列化失败时返回可读错误。
 */
function serializeToolResult(result: AgentToolResult): string {
  try {
    return JSON.stringify(result)
  } catch (error) {
    return JSON.stringify({
      status: 'failed',
      error: `Unable to serialize tool result: ${error instanceof Error ? error.message : String(error)}`
    })
  }
}

/**
 * @description 提取 LangChain 消息内容中的文本部分。
 * @param content 模型返回的消息内容。
 * @returns 合并后的文本内容。
 */
function contentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part
      }

      if (!part || typeof part !== 'object') {
        return ''
      }

      const data = part as { text?: unknown; content?: unknown }
      if (typeof data.text === 'string') {
        return data.text
      }

      return typeof data.content === 'string' ? data.content : ''
    })
    .join('')
}
