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

/**
 * @description 返回指定本地 TTS 模型的应用托管运行时目录。
 * @param modelId 应用设置中的模型标识。
 * @returns 模型运行时的固定托管目录。
 */
export function getTtsModelRoot(modelId: string): string {
  return join(getAppDataRoot(), 'models', 'tts', modelId)
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

export function getCharacterManifestPath(characterId: string): string {
  return join(getCharacterDirectoryPath(characterId), 'manifest.json')
}
