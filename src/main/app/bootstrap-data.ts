import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import { DEFAULT_TTS_MODEL_ID } from '@shared/app-settings'
import {
  getAppDataRoot,
  getAppSettingsPath,
  getCharactersRoot,
  getLocalEmbeddingRoot,
  getLogsRoot,
  getMemoryDatabasePath,
  getMemorySettingsPath,
  getProfilesPath,
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
    mkdir(dirname(getAppSettingsPath()), { recursive: true }),
    mkdir(dirname(getProfilesPath()), { recursive: true }),
    mkdir(dirname(getSessionsPath()), { recursive: true }),
    mkdir(dirname(getMemorySettingsPath()), { recursive: true }),
    mkdir(dirname(getMemoryDatabasePath()), { recursive: true })
  ])
}
