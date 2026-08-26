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
  return join(getAppDataRoot(), 'sessions.json')
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
