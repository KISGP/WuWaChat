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

export function getBundledEmbeddingCatalogPath(): string {
  return join(getBundledResourcesRoot(), 'embedding.json')
}

export function getAppDataRoot(): string {
  return join(app.getPath('userData'), 'app-data')
}

export function getWorldRoot(): string {
  return join(getAppDataRoot(), 'world')
}

export function getWorldInfoPath(): string {
  return join(getWorldRoot(), 'info.txt')
}

export function getLogsRoot(): string {
  return join(getAppDataRoot(), 'logs')
}

export function getProfilesPath(): string {
  return join(getAppDataRoot(), 'settings.json')
}

export function getSessionsPath(): string {
  return join(getAppDataRoot(), 'sessions.json')
}

export function getMemorySettingsPath(): string {
  return join(getAppDataRoot(), 'memory-settings.json')
}

export function getMemoryDatabasePath(): string {
  return join(getAppDataRoot(), 'memory.db')
}

export function getLocalEmbeddingRoot(): string {
  return join(getAppDataRoot(), 'models', 'embeddings')
}

export function getCharactersRoot(): string {
  return join(getAppDataRoot(), 'chars')
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
