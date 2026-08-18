import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatPromptPreviewMessage, ConversationMessage } from '@shared/chat'
import { ASSISTANT_MESSAGE_FORMAT_INSTRUCTION } from './assistant-message-splitter'
import { contentToText } from './message-content'

/**
 * @description 将 LangChain 消息数组转换为可跨进程序列化的消息结构。
 * @param messages LangChain 消息数组。
 * @returns 仅包含角色与文本内容的序列化消息数组。
 */
export function toLoggableMessages(messages: BaseMessage[]): ChatPromptPreviewMessage[] {
  return messages.map((message) => ({
    role:
      message instanceof SystemMessage
        ? 'system'
        : message instanceof AIMessage
          ? 'assistant'
          : 'user',
    content: contentToText(message.content)
  }))
}

/**
 * @description 按真实发送规则拼装系统提示词文本，包含角色 prompt 与回复格式约束。
 * @param prompt 角色 prompt 原文。
 * @returns 最终会发送给模型的 system prompt 文本。
 */
export function buildSystemPromptText(prompt: string): string {
  const systemSections = [prompt.trim()]
  systemSections.push(ASSISTANT_MESSAGE_FORMAT_INSTRUCTION)

  return systemSections.filter(Boolean).join('\n\n')
}

/**
 * @description 将系统 prompt 与历史消息转换为模型调用所需的消息数组。
 * @param prompt 角色 prompt 原文。
 * @param history 将发送给模型的历史消息与当前用户输入。
 * @returns LangChain 模型消息数组。
 */
export function toModelMessages(prompt: string, history: ConversationMessage[]): BaseMessage[] {
  const messages: BaseMessage[] = []
  const systemPrompt = buildSystemPromptText(prompt)
  if (systemPrompt) {
    messages.push(new SystemMessage(systemPrompt))
  }

  for (const message of history) {
    if (!message.content.trim()) {
      continue
    }

    messages.push(
      message.role === 'assistant'
        ? new AIMessage(message.content)
        : new HumanMessage(message.content)
    )
  }

  return messages
}
