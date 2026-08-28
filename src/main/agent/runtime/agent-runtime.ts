import {
  SystemMessage,
  ToolMessage,
  AIMessageChunk,
  type MessageContent,
  type BaseMessage
} from '@langchain/core/messages'
import { logger } from '@main/logging'
import type {
  AgentModelFactory,
  AgentModel,
  AgentRunPhase,
  AgentRunRequest,
  AgentRunResult,
  AgentTool,
  AgentToolContext,
  AgentToolCall,
  AgentToolResult
} from './agent-types'
import { AgentToolExecutor } from './tool-executor'
import { AgentToolRegistry } from './tool-registry'
import { formatChatEmoticonMarker } from '@shared/chat-emoticons'

const TOOL_ROUTING_SYSTEM_PROMPT = `
You are currently in the tool-routing phase, not the final-answer phase.

Your job is to decide whether the user's request requires any available tool.

Rules:

1. If no tool is needed, provide one concise internal decision reason in the content field.
2. The reason must be no more than 50 words.
3. If a tool is needed, use native tool_calls in the same response and put one concise natural-language decision reason in content.
4. Never encode tool arguments as JSON in content, never list parameter values in the reason, and never answer the user during this phase.
5. The decision reason is for internal diagnostics only. It is not the final answer and must never be presented to the user as the final response.
6. Do not answer the user or role-play during this phase.
7. After the necessary tool calls are completed, stop this routing phase. A separate model call will generate the final user-facing answer.

Story rules:

1. For any question about the character's original story, biography, childhood, past events, or life history, you must use Story.
2. You must call get_story_scope first.
3. Wait for the result of get_story_scope before selecting any scenes.
4. Select scene keys only from the sceneKeys returned by get_story_scope.
5. Call read_story_scenes only for relevant scene keys from that result.
6. Never invent, modify, or request a sceneKey outside the returned Story scope.
7. Do not answer questions about the character's original story using your own model knowledge.
8. If the Story scope contains no relevant scene, do not fabricate an answer. Let the final-answer phase explain that no relevant Story evidence was found.

Memory rules:

1. Story, long-term memory, and current time are completely independent information sources.
2. Do not use long-term memory to answer original-story questions.
3. Call the long-term memory tool only when the user asks about information that may have been remembered from past conversations or previous interactions.
4. Use long-term memory only when a chat session is selected.
5. Do not use long-term memory when no chat session is selected.

Time rules:

1. Call the current-time tool only when the user asks for the current date, current time, or another time-sensitive datetime.
2. Do not use the current-time tool for Story or memory questions.

Glossary rules:

1. Use the world glossary for questions asking what an in-world term, organization, place, phenomenon, or item means.
2. Put every independently needed term in the query array so they can be looked up in one call.
3. Use the default term mode when the requested term is known; use definition or both only to find terms by their explanation.
4. Do not present an unsupported world fact as a glossary result when the search has no matching evidence.

Moegirlpedia rules:

1. Use Moegirlpedia for public encyclopedia questions, external factual lookups, game or media introductions, and page information that is not covered by Story, Glossary, memory, or time tools.
2. For a general question such as what a game, work, character, organization, place, or term is, call search_moegirlpedia when the answer may benefit from wiki evidence.
3. Call search_moegirlpedia before read_moegirlpedia_page when the exact page title is unknown.
4. Read a page only after search results provide a relevant exact title, or when the user already supplied an exact title.
5. If the user requests detailed factual information, do not stop after search snippets; read the most relevant exact page before ending the routing phase.
6. Do not use Moegirlpedia to answer the current character's original-story questions when Story is required, and do not use it as a substitute for the local Glossary or long-term memory tools.
7. If the user asks for an opinion, rewriting, translation, calculation, or other task that does not require external facts, do not call Moegirlpedia.
8. Treat Moegirlpedia results as the source of truth for Moegirlpedia factual answers. If the results do not support a detail, do not fill it in from model memory; let the final-answer phase state that the evidence is insufficient.
`

/**
 * @description 执行将工具路由与最终角色回复分离的聊天 Agent 流程。
 * @remarks 工具开启时，工具路由阶段不接收角色提示词；最终回复始终使用未绑定工具的模型。
 * @param request 当前角色的最终 system prompt、历史消息、工具上下文和流式回调。
 * @param modelFactory 根据当前模型配置创建模型的适配器。
 * @returns 最终助手文本、完整模型消息和工具轨迹。
 */
export async function runAgent(
  request: AgentRunRequest,
  modelFactory: AgentModelFactory
): Promise<AgentRunResult> {
  let phase: AgentRunPhase = 'tool-routing'
  const model = modelFactory(request.profile, {
    onProviderRequest: (body) => request.onProviderRequest?.(body, phase)
  })
  const executor = new AgentToolExecutor(new AgentToolRegistry(request.tools))
  const definitions = executor.getDefinitions()
  if (definitions.length > 0 && !model.bindTools) {
    throw new Error('The configured chat model does not support native tool calling.')
  }

  const traces = [] as AgentRunResult['traces']
  let toolRounds = 0

  const toolTranscript =
    definitions.length > 0
      ? await runToolRoutingLoop({
          request,
          model: model.bindTools!(definitions, {
            parallel_tool_calls: true,
            tool_choice: 'auto'
          }),
          executor,
          traces
        })
      : { messages: [], toolRounds: 0, incomplete: false }
  toolRounds = toolTranscript.toolRounds
  phase = 'final-response'
  const finalMessages = [
    new SystemMessage(
      getFinalSystemPrompt(
        request.systemPromptText,
        toolTranscript.incomplete,
        toolTranscript.messages.length > 0
      )
    ),
    ...request.history,
    ...toolTranscript.messages
  ]
  let emittedFinalChunkCount = 0
  const finalResponse = await streamAgentResponse(
    model,
    finalMessages,
    request.abortSignal,
    (text) => {
      emittedFinalChunkCount += 1
      request.onChunk(text)
    }
  )
  request.onModelResponse?.(finalResponse, 'final-response')
  const assistantDraft = contentToText(finalResponse.content)
  if (assistantDraft && emittedFinalChunkCount === 0) {
    request.onChunk(assistantDraft)
  }

  if (toolTranscript.incomplete) {
    void logger.info('ai', 'agent-tool-round-limit-reached', 'Agent tool round limit reached', {
      toolRounds,
      incomplete: true
    })
  }

  return {
    assistantDraft,
    messages: [...finalMessages, finalResponse],
    traces,
    toolRounds,
    incomplete: toolTranscript.incomplete
  }
}

/**
 * @description 执行不带角色提示词的工具路由循环，并返回供最终回复使用的工具消息。
 * @param params 当前运行所需的请求、绑定工具的模型、执行器和轨迹集合。
 * @returns 工具调用产生的 AI 与 ToolMessage 消息及其完成状态。
 */
async function runToolRoutingLoop({
  request,
  model,
  executor,
  traces
}: {
  request: AgentRunRequest
  model: NonNullable<ReturnType<NonNullable<AgentModel['bindTools']>>>
  executor: AgentToolExecutor
  traces: AgentRunResult['traces']
}): Promise<{ messages: BaseMessage[]; toolRounds: number; incomplete: boolean }> {
  const messages: BaseMessage[] = [
    new SystemMessage(
      `${TOOL_ROUTING_SYSTEM_PROMPT}\n\n${getEmoticonRoutingInstruction(request.context)}\n\nCurrent character: ${request.context.character.name}. Chat session selected: ${request.context.policy.memoryScope !== 'none' ? 'yes' : 'no'}.`
    ),
    ...request.history
  ]
  let toolRounds = 0

  while (toolRounds < request.context.policy.maxToolRounds) {
    const response = await streamAgentResponse(model, messages, request.abortSignal)
    const toolCalls = normalizeToolCalls(response, executor.getDefinitions())
    request.onModelResponse?.(
      toolCalls.length > 0 ? createToolCallMessage(response, toolCalls) : response,
      'tool-routing'
    )
    if (toolCalls.length === 0) {
      return {
        messages: messages.slice(1 + request.history.length),
        toolRounds,
        incomplete: false
      }
    }

    toolRounds += 1
    messages.push(createToolCallMessage(response, toolCalls))
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
            content: toToolMessageContent(result.result)
          })
      )
    )
  }

  return { messages: messages.slice(1 + request.history.length), toolRounds, incomplete: true }
}

/**
 * @description 构造工具路由阶段使用的表情清单说明。
 * @param context 当前 Agent 工具上下文。
 * @returns 表情读取规则文本；没有表情上下文时返回空文本。
 */
function getEmoticonRoutingInstruction(context: AgentToolContext): string {
  const catalog = context.emoticonCatalog || []
  if (catalog.length === 0) return ''
  return [
    'Emoticon rules:',
    '- Read a chat emoticon only when its description is insufficient to determine the emotion.',
    '- Use read_chat_emoticon with the exact global id from the list below.',
    catalog.map((item) => `- ${formatChatEmoticonMarker(item.id)}: ${item.description}`).join('\n')
  ].join('\n')
}

/**
 * @description 构造最终角色回复唯一使用的 system 提示词。
 * @param systemPromptText 角色提示词、格式约束和事实规则。
 * @param incomplete 工具路由是否达到全局调用上限。
 * @param hasToolEvidence 本轮是否已经产生工具证据。
 * @returns 最终模型请求的唯一 system 文本。
 */
function getFinalSystemPrompt(
  systemPromptText: string,
  incomplete: boolean,
  hasToolEvidence: boolean
): string {
  const evidenceRules = hasToolEvidence
    ? '\n\n工具证据规则：\n- 工具结果是其覆盖事实的唯一依据。\n- 不要用模型记忆补充工具结果中没有支持的具体事实。\n- 证据不足时，明确说明资料不足，不要编造或猜测。'
    : ''
  const incompleteRule = incomplete
    ? '\n\n工具调用预算已耗尽。请基于已有工具结果回答；若证据不足，请明确说明查询未完成。'
    : ''
  return systemPromptText + evidenceRules + incompleteRule
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
 * @description 流式获取一次模型响应、合并增量消息，并可将文本增量转发给调用方。
 * @param model 已绑定或未绑定工具的模型。
 * @param messages 当前模型消息。
 * @param abortSignal 当前运行取消信号。
 * @param onTextChunk 可选的文本增量回调；工具路由阶段不提供该回调。
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
  abortSignal: AbortSignal,
  onTextChunk?: (text: string) => void
): Promise<AIMessageChunk> {
  const stream = await model.stream(messages, { signal: abortSignal })
  let combined: AIMessageChunk | null = null
  for await (const chunk of stream) {
    combined = combined ? combined.concat(chunk) : chunk
    const text = contentToText(chunk.content)
    if (text) {
      onTextChunk?.(text)
    }
  }

  if (!combined) {
    throw new Error('Model returned no response.')
  }
  return combined
}

/**
 * @description 将 LangChain AI 消息中的工具调用转换为安全的执行参数。
 * @param message 模型返回的 AI 消息。
 * @param definitions 当前已注册的工具定义。
 * @returns 可并行执行的工具调用列表。
 */
function normalizeToolCalls(
  message: AIMessageChunk,
  definitions: AgentTool['definition'][]
): AgentToolCall[] {
  const nativeCalls = (message.tool_calls || [])
    .filter((call) => typeof call.id === 'string' && typeof call.name === 'string')
    .map((call) => ({
      id: call.id as string,
      name: call.name,
      args: call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {}
    }))

  if (nativeCalls.length > 0) return nativeCalls
  const fallback = inferToolCallFromContent(message, definitions)
  if (fallback) {
    void logger.warn(
      'ai',
      'agent-tool-call-content-fallback',
      'Converted JSON content to a native tool call',
      {
        toolName: fallback.name
      }
    )
    return [fallback]
  }
  return []
}

/**
 * @description 为不支持原生 tool_calls 的兼容接口，从严格匹配的 JSON 内容中推断一个工具调用。
 * @param message 模型返回的 AI 消息。
 * @param definitions 当前已注册的工具定义。
 * @returns 唯一匹配的工具调用，否则返回 null。
 * @remarks 只有参数对象、必填字段和字段类型均匹配且候选工具唯一时才会回退，普通文本不会触发工具。
 */
function inferToolCallFromContent(
  message: AIMessageChunk,
  definitions: AgentTool['definition'][]
): AgentToolCall | null {
  const args = parseJsonObject(contentToText(message.content))
  if (!args) return null
  const candidates = definitions.filter((definition) => matchesToolArguments(definition, args))
  if (candidates.length !== 1) return null
  return { id: 'content-fallback-' + Date.now(), name: candidates[0].function.name, args }
}

/**
 * @description 将模型文本解析为 JSON 对象。
 * @param content 模型返回的文本内容。
 * @returns JSON 对象，否则返回 null。
 */
function parseJsonObject(content: string): Record<string, unknown> | null {
  const normalized = content.trim()
  if (!normalized.startsWith('{') || !normalized.endsWith('}')) return null
  try {
    const value: unknown = JSON.parse(normalized)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * @description 判断 JSON 参数是否严格符合一个工具定义的必要字段和基础类型。
 * @param definition 工具定义。
 * @param args 待匹配的 JSON 参数。
 * @returns 参数匹配时返回 true。
 */
function matchesToolArguments(
  definition: AgentTool['definition'],
  args: Record<string, unknown>
): boolean {
  const schema = definition.function.parameters
  const required = Array.isArray(schema.required) ? schema.required : []
  if (!required.every((key) => typeof key === 'string' && key in args)) return false
  const properties = schema.properties
  if (!properties || typeof properties !== 'object') return false
  if (
    schema.additionalProperties === false &&
    Object.keys(args).some((key) => !(key in properties))
  )
    return false
  return Object.entries(args).every(([key, value]) => {
    const property = properties[key]
    if (!property || typeof property !== 'object') return false
    const type = (property as { type?: unknown }).type
    return type === undefined || typeMatches(value, type)
  })
}

/**
 * @description 检查 JSON 值是否符合工具 schema 的基础类型。
 * @param value 待检查的值。
 * @param type schema 类型。
 * @returns 类型匹配时返回 true。
 */
function typeMatches(value: unknown, type: unknown): boolean {
  if (type === 'string') return typeof value === 'string'
  if (type === 'array') return Array.isArray(value)
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value))
  return false
}

/**
 * @description 为兼容回退调用构造带有原生 tool_calls 元数据的 AI 消息。
 * @param response 原始 AI 消息。
 * @param calls 已推断的工具调用。
 * @returns 可与 ToolMessage 配对的 AI 消息。
 */
function createToolCallMessage(response: AIMessageChunk, calls: AgentToolCall[]): AIMessageChunk {
  if (response.tool_calls && response.tool_calls.length > 0) return response
  return new AIMessageChunk({
    content: '',
    tool_calls: calls.map((call) => ({
      id: call.id,
      name: call.name,
      args: call.args,
      type: 'tool_call' as const
    }))
  })
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
 * @description 将工具结果转换为模型可读取的文本或多模态内容块。
 * @param result 工具执行结果。
 * @returns ToolMessage 的兼容内容值。
 * @remarks 图片读取工具通过多模态内容块把原图交给支持视觉的模型，同时保留结构化文本结果。
 */
function toToolMessageContent(result: AgentToolResult): MessageContent {
  if (Array.isArray(result.modelContent)) {
    return result.modelContent
  }
  return serializeToolResult(result)
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
