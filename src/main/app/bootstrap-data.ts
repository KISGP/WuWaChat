import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import { DEFAULT_TTS_MODEL_ID } from '@shared/app-settings'
import {
  getAppDataRoot,
  getCharactersRoot,
  getLocalEmbeddingRoot,
  getLogsRoot,
  getMemoryDatabasePath,
  getSettingsPath,
  getSessionsPath,
  getTtsAudioRoot,
  getTtsModelRoot
} from '../utils'

export async function bootstrapAppData(): Promise<void> {
  await Promise.all([
    mkdir(getAppDataRoot(), { recursive: true }),
    mkdir(getCharactersRoot(), { recursive: true }),
    mkdir(getLogsRoot(), { recursive: true }),
    mkdir(getLocalEmbeddingRoot(), { recursive: true }),
    mkdir(getTtsAudioRoot(), { recursive: true }),
    mkdir(getTtsModelRoot(DEFAULT_TTS_MODEL_ID), { recursive: true }),
    mkdir(dirname(getSettingsPath()), { recursive: true }),
    mkdir(dirname(getSessionsPath()), { recursive: true }),
    mkdir(dirname(getMemoryDatabasePath()), { recursive: true })
  ])
}
