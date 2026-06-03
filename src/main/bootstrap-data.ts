import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import {
  getAppDataRoot,
  getCharactersRoot,
  getLocalEmbeddingRoot,
  getLogsRoot,
  getMemoryDatabasePath,
  getMemorySettingsPath,
  getProfilesPath,
  getSessionsPath
} from './utils'

export async function bootstrapAppData(): Promise<void> {
  await Promise.all([
    mkdir(getAppDataRoot(), { recursive: true }),
    mkdir(getCharactersRoot(), { recursive: true }),
    mkdir(getLogsRoot(), { recursive: true }),
    mkdir(getLocalEmbeddingRoot(), { recursive: true }),
    mkdir(dirname(getProfilesPath()), { recursive: true }),
    mkdir(dirname(getSessionsPath()), { recursive: true }),
    mkdir(dirname(getMemorySettingsPath()), { recursive: true }),
    mkdir(dirname(getMemoryDatabasePath()), { recursive: true })
  ])
}
