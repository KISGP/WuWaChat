import { readFile } from 'fs/promises'
import {
  type AppSettings,
  createDefaultAppSettings,
  normalizeAppSettings
} from '@shared/app-settings'
import { logger } from '@main/logging'
import { getAppSettingsPath, pathExists, writeJsonFileAtomic } from '@main/utils'

/**
 * @description 读取持久化的应用通用设置，文件缺失或内容无效时回退到默认值。
 * @returns 可供渲染进程使用的应用通用设置。
 */
export async function getAppSettings(): Promise<AppSettings> {
  const filePath = getAppSettingsPath()
  if (!(await pathExists(filePath))) {
    void logger.info('settings', 'app-settings-missing', 'App settings not found, using defaults', {
      filePath
    })
    return createDefaultAppSettings()
  }
  try {
    return normalizeAppSettings(JSON.parse(await readFile(filePath, 'utf-8')))
  } catch (error) {
    console.error('Failed to read app settings', error)
    void logger.error('settings', 'app-settings-read-failed', 'Failed to read app settings', {
      filePath,
      error: error instanceof Error ? error.message : String(error)
    })
    return createDefaultAppSettings()
  }
}

/**
 * @description 规范化并持久化应用通用设置。
 * @param settings 需要保存的应用通用设置。
 * @returns 保存后的规范化设置。
 */
export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = normalizeAppSettings(settings)
  const filePath = getAppSettingsPath()
  await writeJsonFileAtomic(filePath, normalized)
  void logger.info('settings', 'app-settings-saved', 'App settings saved', {
    filePath,
    animationPreference: normalized.animationPreference,
    messageCollapseLineCount: normalized.messageCollapseLineCount
  })
  return normalized
}
