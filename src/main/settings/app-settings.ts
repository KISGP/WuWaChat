import { type AppSettings, normalizeAppSettings } from '@shared/app-settings'
import { getUnifiedSettingsStore } from './store'

/**
 * @description 读取持久化的应用通用设置，文件缺失或内容无效时回退到默认值。
 * @returns 可供渲染进程使用的应用通用设置。
 */
export async function getAppSettings(): Promise<AppSettings> {
  return (await getUnifiedSettingsStore().get()).app
}

/**
 * @description 规范化并持久化应用通用设置。
 * @param settings 需要保存的应用通用设置。
 * @returns 保存后的规范化设置。
 */
export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = normalizeAppSettings(settings)
  return getUnifiedSettingsStore().update('app', normalized)
}
