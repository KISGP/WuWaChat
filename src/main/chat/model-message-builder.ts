import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatDiagnosticMessage, ChatImageInput, ConversationMessage } from '@shared/chat'
import { ASSISTANT_MESSAGE_FORMAT_INSTRUCTION } from './assistant-message-splitter'
import { contentToText } from './message-content'

const FINAL_RESPONSE_EVIDENCE_INSTRUCTION =
  'Use tool results as auxiliary evidence. When stating original-story facts, prefer verified Story tool results over model memory; if evidence is missing, say so instead of inventing canon.'

/**
 * @description 将 LangChain 消息数组转换为可跨进程序列化的消息结构。
 * @param messages LangChain 消息数组。
 * @returns 仅包含角色与文本内容的序列化消息数组。
 */
export function toLoggableMessages(messages: BaseMessage[]): ChatDiagnosticMessage[] {
  return messages.map((message) => ({
    role: getLoggableMessageRole(message),
    content: contentToText(message.content),
    ...getLoggableMessageMetadata(message)
  }))
}

/**
 * @description 将 LangChain 消息的运行时类型映射为跨进程展示角色。
 * @param message 待序列化的 LangChain 消息或消息增量。
 * @returns 前端预览使用的稳定角色名称。
 */
function getLoggableMessageRole(message: BaseMessage): ChatDiagnosticMessage['role'] {
  const messageType = message.getType()
  if (messageType === 'system') {
    return 'system'
  }
  if (messageType === 'ai') {
    return 'assistant'
  }
  if (messageType === 'tool') {
    return 'tool'
  }
  return 'user'
}

/**
 * @description 提取 AI 消息携带的原生工具调用，保留工具协议在后续请求中的完整上下文。
 * @param message 待序列化的 LangChain 消息或消息增量。
 * @returns 可跨进程展示的工具调用；不存在时返回 `undefined`。
 */
function getLoggableMessageMetadata(
  message: BaseMessage
): Pick<ChatDiagnosticMessage, 'tool_calls' | 'tool_call_id' | 'name'> {
  if (message.getType() !== 'ai') {
    const toolMessage = message as { tool_call_id?: unknown; name?: unknown }
    return {
      ...(typeof toolMessage.tool_call_id === 'string'
        ? { tool_call_id: toolMessage.tool_call_id }
        : {}),
      ...(typeof toolMessage.name === 'string' ? { name: toolMessage.name } : {})
    }
  }

  const toolCalls = (message as { tool_calls?: unknown }).tool_calls
  if (!Array.isArray(toolCalls)) {
    return {}
  }

  const normalized = toolCalls
    .filter(
      (call): call is { id: string; name: string; args?: unknown; type?: unknown } =>
        Boolean(call) &&
        typeof call === 'object' &&
        typeof (call as { id?: unknown }).id === 'string' &&
        typeof (call as { name?: unknown }).name === 'string'
    )
    .map((call) => ({
      id: call.id,
      name: call.name,
      ...(typeof call.type === 'string' ? { type: call.type } : {}),
      args: call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {}
    }))

  return normalized.length > 0 ? { tool_calls: normalized } : {}
}

/**
 * @description 按真实发送规则拼装系统提示词文本，包含角色 prompt 与回复格式约束。
 * @param prompt 角色 prompt 原文。
 * @returns 最终会发送给模型的 system prompt 文本。
 */
export function buildSystemPromptText(prompt: string): string {
  const systemSections = [prompt.trim()]
  systemSections.push(ASSISTANT_MESSAGE_FORMAT_INSTRUCTION)
  systemSections.push(FINAL_RESPONSE_EVIDENCE_INSTRUCTION)

  return systemSections.filter(Boolean).join('\n\n')
}

/**
 * @description 将会话历史转换为不包含 system 提示词的模型消息数组。
 * @param history 将发送给模型的历史消息与当前用户输入。
 * @param currentImages 当前请求携带的原始图片；仅匹配到本轮用户消息的图片会进入多模态内容。
 * @returns 仅包含用户与助手角色的消息数组。
 */
export function toConversationMessages(
  history: ConversationMessage[],
  currentMessage?: { id: string; images: ChatImageInput[] }
): BaseMessage[] {
  const messages: BaseMessage[] = []
  const currentImagesByResourceId = new Map(
    (currentMessage?.images || []).map((image) => [image.resourceId, image])
  )

  for (const message of history) {
    const attachments = message.attachments || []
    const liveImages =
      message.role === 'user' && message.id === currentMessage?.id
        ? attachments
            .map((attachment) => currentImagesByResourceId.get(attachment.resourceId))
            .filter((image): image is ChatImageInput => Boolean(image))
        : []
    const historicalImageNotes = attachments
      .filter(
        (attachment) =>
          message.id !== currentMessage?.id || !currentImagesByResourceId.has(attachment.resourceId)
      )
      .map((attachment) =>
        formatHistoricalImageNote(attachment.resourceId, attachment.fileName, attachment.analysis)
      )
    const text = [message.content.trim(), ...historicalImageNotes].filter(Boolean).join('\n\n')

    if (!text && liveImages.length === 0) {
      continue
    }

    if (message.role === 'assistant') {
      messages.push(new AIMessage(text))
      continue
    }

    if (liveImages.length === 0) {
      messages.push(new HumanMessage(text))
      continue
    }

    messages.push(
      new HumanMessage({
        content: [
          ...(text ? [{ type: 'text' as const, text }] : []),
          ...liveImages.map((image) => ({
            type: 'image_url' as const,
            image_url: { url: image.dataUrl }
          }))
        ]
      })
    )
  }

  return messages
}

/**
 * @description 将历史图片压缩为模型可引用的资源索引与综合摘要。
 * @param resourceId 图片资源索引 ID。
 * @param fileName 图片原始文件名。
 * @param analysis 已融合的图片分析摘要。
 * @returns 不携带图片二进制内容的历史图片说明。
 */
function formatHistoricalImageNote(resourceId: string, fileName: string, analysis: string): string {
  const summary =
    analysis.trim() || '暂无图片摘要。若当前问题需要核对图片细节，请根据资源索引重新读取。'
  return `[历史图片 resourceId=${resourceId} fileName=${fileName}]\n图片综合摘要：${summary}`
}
