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

export function getResourcesRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
}

export function getWorldRoot(): string {
  return join(getResourcesRoot(), 'world')
}

export function getMemorySettingsPath(): string {
  return join(getResourcesRoot(), 'memory-settings.json')
}

export function getMemoryDatabasePath(): string {
  return join(getResourcesRoot(), 'memory.db')
}