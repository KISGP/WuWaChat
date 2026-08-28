/**
 * @description 描述一个可在聊天中引用的表情资源。
 */
export type ChatEmoticonDefinition = {
  id: string
  description: string
  file: string
}

/**
 * @description 描述 renderer 可展示的表情图片结果。
 */
export type ChatEmoticonImage = {
  id: string
  description: string
  dataUrl?: string
  unavailable?: boolean
}

/**
 * @description 应用内置的用户表情清单。
 */
export const CHAT_USER_EMOTICONS: readonly ChatEmoticonDefinition[] = [
  { id: 'T_ChatEmo_D_01', description: '呆住', file: 'T_ChatEmo_D_01.png' },
  { id: 'T_ChatEmo_D_02', description: '害羞', file: 'T_ChatEmo_D_02.png' },
  { id: 'T_ChatEmo_D_03', description: '慌张', file: 'T_ChatEmo_D_03.png' },
  { id: 'T_ChatEmo_D_04', description: '晕眩', file: 'T_ChatEmo_D_04.png' },
  { id: 'T_ChatEmo_E_01', description: '惊讶', file: 'T_ChatEmo_E_01.png' },
  { id: 'T_ChatEmo_E_02', description: '哼', file: 'T_ChatEmo_E_02.png' },
  { id: 'T_ChatEmo_E_03', description: '点赞', file: 'T_ChatEmo_E_03.png' },
  { id: 'T_ChatEmo_E_04', description: '大笑', file: 'T_ChatEmo_E_04.png' }
]

export const CHAT_EMOTICON_MARKER_PREFIX = '[emoticon:'
export const CHAT_EMOTICON_MARKER_PATTERN = /^\[emoticon:([^\]\r\n]+)\]$/u
export const CHAT_EMOTICON_TOKEN_PATTERN = /\[emoticon:([^\]\r\n]+)\]/gu

/**
 * @description 构造表情标记文本。
 * @param id 表情全局唯一 ID。
 * @returns 可注入聊天历史的表情标记。
 */
export function formatChatEmoticonMarker(id: string): string {
  return `[emoticon:${id}]`
}
