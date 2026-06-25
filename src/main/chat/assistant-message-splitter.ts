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
export function splitAssistantMessages(content: string): string[] {
  return content
    .split(ASSISTANT_MESSAGE_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * @description 将流式中的模型回复拆成气泡，并隐藏末尾尚未完整输出的分隔符前缀。
 * @param content 模型当前累计生成的原始回复文本。
 * @returns 当前可展示的消息段。
 */
export function splitStreamingAssistantMessages(content: string): string[] {
  const prefixLength = getTrailingSeparatorPrefixLength(content)
  const displayContent = prefixLength > 0 ? content.slice(0, -prefixLength) : content
  return splitAssistantMessages(displayContent)
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
