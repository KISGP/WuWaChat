import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import type { ConversationMessage } from '@shared/chat'
import { contentToText } from './message-content'

export function toLoggableMessages(messages: BaseMessage[]): Array<{
  role: 'system' | 'user' | 'assistant'
  content: string
}> {
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

export function toModelMessages(
  prompt: string,
  history: ConversationMessage[],
  retrievalContext: string[]
): BaseMessage[] {
  const systemSections = [prompt.trim()]

  if (retrievalContext.length > 0) {
    systemSections.push(`Relevant context:\n${retrievalContext.join('\n\n')}`)
  }

  const messages: BaseMessage[] = []
  const systemPrompt = systemSections.filter(Boolean).join('\n\n')
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
