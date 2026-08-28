import { logger } from '@main/logging'
import {
  CHAT_EMOTICON_MARKER_PATTERN,
  CHAT_EMOTICON_TOKEN_PATTERN
} from '@shared/chat-emoticons'

export const ASSISTANT_MESSAGE_SEPARATOR = '\n[WUWA_NEXT_MESSAGE]\n'

export const ASSISTANT_MESSAGE_FORMAT_INSTRUCTION = [
  'Application chat output format:',
  `- When one reply should appear as multiple chat bubbles, put ${ASSISTANT_MESSAGE_SEPARATOR.trim()} on its own line between bubbles.`,
  '- Each bubble should be short, natural plain text.',
  `- Do not write opening or closing XML/HTML tags such as <WUWA_MSG> or </WUWA_MSG>.`,
  `- Do not use ${ASSISTANT_MESSAGE_SEPARATOR.trim()} for any purpose except separating chat bubbles.`,
  '- If one bubble is enough, reply normally without the separator.',
  `- Example: 嗯，我知道了。${ASSISTANT_MESSAGE_SEPARATOR}那我们慢慢来。`
].join('\n')

/**
 * @description 将模型原始回复按应用聊天气泡分隔符拆成非空消息段。
 * @param content 模型当前或最终生成的原始回复文本。
 * @returns 去除首尾空白与空段后的消息段；没有有效内容时返回空数组。
 */
export type AssistantMessageSegment =
  | { type: 'text'; text: string }
  | { type: 'emoticon'; emoticonId: string }

/**
 * @description 将模型回复解析为文字和表情消息段。
 * @param content 模型生成的原始回复文本。
 * @param emoticonIds 当前角色允许发送的表情 ID 集合。
 * @returns 按显示顺序排列的 assistant 消息段。
 */
export function splitAssistantMessageSegments(
  content: string,
  emoticonIds: ReadonlySet<string>
): AssistantMessageSegment[] {
  const segments: AssistantMessageSegment[] = []
  for (const rawPart of content.split(ASSISTANT_MESSAGE_SEPARATOR)) {
    const part = rawPart.trim()
    if (!part) continue
    const marker = part.match(CHAT_EMOTICON_MARKER_PATTERN)
    if (marker) {
      const emoticonId = marker[1].trim()
      if (emoticonIds.has(emoticonId)) {
        segments.push({ type: 'emoticon', emoticonId })
      } else {
        void logger.warn('ai', 'chat-emoticon-unknown-id', 'Model emitted an unknown emoticon ID', {
          emoticonId
        })
      }
      continue
    }
    const text = part.replace(CHAT_EMOTICON_TOKEN_PATTERN, '').trim()
    if (text) segments.push({ type: 'text', text })
  }
  return segments
}

/**
 * @description 将 assistant 段解析结果转换为旧的纯文本段列表。
 * @param content 模型生成的原始回复文本。
 * @returns 当前可显示的文字段。
 */
export function splitAssistantMessages(content: string): string[] {
  return splitAssistantMessageSegments(content, new Set())
    .filter((segment): segment is { type: 'text'; text: string } => segment.type === 'text')
    .map((segment) => segment.text)
}

/**
 * @description 将流式中的模型回复拆成气泡，并隐藏末尾尚未完整输出的分隔符前缀。
 * @param content 模型当前累计生成的原始回复文本。
 * @returns 当前可展示的消息段。
 */
export function splitStreamingAssistantMessages(content: string): string[] {
  const prefixLength = getTrailingSeparatorPrefixLength(content)
  const displayWithoutSeparator = prefixLength > 0 ? content.slice(0, -prefixLength) : content
  const emoticonPrefix = getTrailingEmoticonPrefixLength(displayWithoutSeparator)
  const displayContent =
    emoticonPrefix > 0
      ? displayWithoutSeparator.slice(0, -emoticonPrefix)
      : displayWithoutSeparator
  return splitAssistantMessages(displayContent)
}

/**
 * @description 将流式中的模型回复解析为 assistant 消息段。
 * @param content 模型当前累计生成的原始回复文本。
 * @param emoticonIds 当前角色允许发送的表情 ID 集合。
 * @returns 当前可展示的消息段。
 */
export function splitStreamingAssistantMessageSegments(
  content: string,
  emoticonIds: ReadonlySet<string>
): AssistantMessageSegment[] {
  const prefixLength = getTrailingSeparatorPrefixLength(content)
  const displayWithoutSeparator = prefixLength > 0 ? content.slice(0, -prefixLength) : content
  const emoticonPrefix = getTrailingEmoticonPrefixLength(displayWithoutSeparator)
  const displayContent =
    emoticonPrefix > 0
      ? displayWithoutSeparator.slice(0, -emoticonPrefix)
      : displayWithoutSeparator
  return splitAssistantMessageSegments(displayContent, emoticonIds)
}

/**
 * @description 计算末尾未闭合的表情标记前缀长度。
 * @param content 模型当前累计生成的原始回复文本。
 * @returns 未完成标记长度；没有未完成标记时返回 0。
 */
function getTrailingEmoticonPrefixLength(content: string): number {
  const match = content.match(/\[emoticon:[^\]\r\n]*$/u)
  return match ? match[0].length : 0
}

/**
 * @description 计算文本末尾与分隔符开头重合的最长前缀长度。
 * @param content 模型当前累计生成的原始回复文本。
 * @returns 末尾未完成分隔符前缀长度；没有匹配时返回 0。
 */
function getTrailingSeparatorPrefixLength(content: string): number {
  for (let length = ASSISTANT_MESSAGE_SEPARATOR.length - 1; length > 0; length -= 1) {
    if (content.endsWith(ASSISTANT_MESSAGE_SEPARATOR.slice(0, length))) {
      return length
    }
  }

  return 0
}
