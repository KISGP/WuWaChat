import { constants } from 'fs'
import { access } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function getAppPath(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath()
}

export function getBundledResourcesRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'resources')
    : join(app.getAppPath(), 'resources')
}

/**
 * @description 返回应用内置聊天表情资源目录。
 * @returns 打包资源中的聊天表情根目录。
 */
export function getBundledEmoticonsRoot(): string {
  return join(getBundledResourcesRoot(), 'emoticons')
}

export function getAppDataRoot(): string {
  return join(app.getPath('userData'), 'app-data')
}

/**
 * @description 返回本地 TTS 生成音频的应用数据目录。
 * @returns 可由主进程读写的临时音频缓存目录。
 */
export function getTtsAudioRoot(): string {
  return join(getAppDataRoot(), 'tts', 'audio')
}

export function getLogsRoot(): string {
  return join(getAppDataRoot(), 'logs')
}

export function getSettingsPath(): string {
  return join(getAppDataRoot(), 'settings.json')
}

export function getSessionsPath(): string {
  return join(getAppDataRoot(), 'chat-history')
}

/**
 * @description 返回聊天记录根目录；每个角色和会话分别使用独立子目录。
 * @returns 聊天记录目录路径。
 */
export function getChatHistoryRoot(): string {
  return getSessionsPath()
}

function assertChatPathSegment(value: string, label: string): void {
  if (!value || value === '.' || value === '..' || /[\\/]/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
}

/**
 * @description 返回指定角色的聊天记录目录。
 * @param characterId 角色标识。
 * @returns 角色聊天记录目录路径。
 */
export function getChatCharacterRoot(characterId: string): string {
  assertChatPathSegment(characterId, 'character id')
  return join(getChatHistoryRoot(), characterId)
}

/**
 * @description 返回指定会话的聊天记录目录。
 * @param characterId 角色标识。
 * @param sessionId 会话标识。
 * @returns 会话目录路径。
 */
export function getChatSessionRoot(characterId: string, sessionId: string): string {
  assertChatPathSegment(characterId, 'character id')
  assertChatPathSegment(sessionId, 'session id')
  return join(getChatCharacterRoot(characterId), sessionId)
}

/**
 * @description 返回指定会话的 JSON 持久化文件路径。
 * @param characterId 角色标识。
 * @param sessionId 会话标识。
 * @returns 会话 JSON 文件路径。
 */
export function getChatSessionPath(characterId: string, sessionId: string): string {
  return join(getChatSessionRoot(characterId, sessionId), 'session.json')
}

/**
 * @description 返回指定会话的图片附件目录。
 * @param characterId 角色标识。
 * @param sessionId 会话标识。
 * @returns 图片附件目录路径。
 */
export function getChatAttachmentsRoot(characterId: string, sessionId: string): string {
  return join(getChatSessionRoot(characterId, sessionId), 'attachments')
}

/**
 * @description 返回指定会话图片资源的文件路径。
 * @param characterId 角色标识。
 * @param sessionId 会话标识。
 * @param resourceId 会话内资源标识。
 * @param extension 图片文件扩展名。
 * @returns 图片附件文件路径。
 */
export function getChatAttachmentPath(
  characterId: string,
  sessionId: string,
  resourceId: string,
  extension: string
): string {
  assertChatPathSegment(resourceId, 'resource id')
  if (!/^\.[a-z0-9]+$/i.test(extension)) {
    throw new Error('Invalid attachment extension')
  }
  return join(getChatAttachmentsRoot(characterId, sessionId), resourceId + extension)
}

/**
 * @description 返回指定会话的 Agent 调试记录目录。
 * @param characterId 角色标识。
 * @param sessionId 会话标识。
 * @returns 会话目录下的调试记录根目录。
 */
export function getChatDebugRunsRoot(characterId: string, sessionId: string): string {
  return join(getChatSessionRoot(characterId, sessionId), 'debug-runs')
}

/**
 * @description 返回指定 Agent 调试运行的事件文件路径。
 * @param characterId 角色标识。
 * @param sessionId 会话标识。
 * @param requestId 运行请求标识。
 * @returns 调试运行 JSONL 文件路径。
 */
export function getChatDebugRunPath(
  characterId: string,
  sessionId: string,
  requestId: string
): string {
  assertChatPathSegment(requestId, 'request id')
  return join(getChatDebugRunsRoot(characterId, sessionId), requestId + '.jsonl')
}

export function getCharactersRoot(): string {
  return join(getAppDataRoot(), 'chars')
}

export function getCharactersCachePath(): string {
  return join(getAppDataRoot(), 'chars-cache.json')
}

export function getCharacterDirectoryPath(characterId: string): string {
  return join(getCharactersRoot(), characterId)
}

export function getCharacterInfoPath(characterId: string): string {
  return join(getCharacterDirectoryPath(characterId), 'info.json')
}

export function getCharacterPromptPath(characterId: string): string {
  return join(getCharacterDirectoryPath(characterId), 'prompt.md')
}

export function getCharacterAvatarPath(characterId: string): string {
  return join(getCharacterDirectoryPath(characterId), 'avatar.png')
}

export function getCharacterCardBgPath(characterId: string): string {
  return join(getCharacterDirectoryPath(characterId), 'cardBg.png')
}

/**
 * @description 返回指定角色的表情资源根目录。
 * @param characterId 角色标识。
 * @returns 角色目录下的表情资源目录。
 */
export function getCharacterEmoticonsRoot(characterId: string): string {
  return join(getCharacterDirectoryPath(characterId), 'emoticons')
}

/**
 * @description 返回指定角色的本地 index-tts 参考音色文件路径。
 * @param characterId 已安装角色的标识。
 * @returns 保存在角色目录中的固定参考音色路径。
 */
export function getCharacterTtsVoicePath(characterId: string): string {
  return join(getCharacterDirectoryPath(characterId), 'TTS.wav')
}

export function getCharacterManifestPath(characterId: string): string {
  return join(getCharacterDirectoryPath(characterId), 'manifest.json')
}
