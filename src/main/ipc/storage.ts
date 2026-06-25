import { getStorageUsageSnapshot } from '@main/storage'
import { handleLogged } from './logged-handler'

/**
 * @description 注册应用存储分析相关 IPC handler。
 */
export function registerStorageIpc(): void {
  handleLogged('storage:getUsage', () => getStorageUsageSnapshot())
}
