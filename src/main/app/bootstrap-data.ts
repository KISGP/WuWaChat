import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import {
  getAppDataRoot,
  getCharactersRoot,
  getChatHistoryRoot,
  getLogsRoot,
  getSettingsPath,
  getTtsAudioRoot
} from '../utils'
import { getWorldRoot } from '@main/world/paths'

export async function bootstrapAppData(): Promise<void> {
  await Promise.all([
    mkdir(getAppDataRoot(), { recursive: true }),
    mkdir(getCharactersRoot(), { recursive: true }),
    mkdir(getLogsRoot(), { recursive: true }),
    mkdir(getWorldRoot(), { recursive: true }),
    mkdir(getTtsAudioRoot(), { recursive: true }),
    mkdir(dirname(getSettingsPath()), { recursive: true }),
    mkdir(getChatHistoryRoot(), { recursive: true })
  ])
}
