import { worldService } from '@main/app/services'
import type { WorldSyncResult } from '@shared/world'
import { WORLD_SYNC_PROGRESS_CHANNEL } from '@shared/world-events'
import { handleLogged } from './logged-handler'

let activeSync: Promise<WorldSyncResult> | null = null

/**
 * @description 注册 world 资料状态查询、更新检查和下载 IPC。
 */
export function registerWorldIpc(): void {
  handleLogged('world:getStatus', () => worldService.getSyncStatus())
  handleLogged('world:checkForUpdates', () => worldService.checkSync())
  handleLogged('world:download', (event) => {
    if (activeSync) {
      return activeSync
    }

    activeSync = worldService
      .sync((progress) => {
        event.sender.send(WORLD_SYNC_PROGRESS_CHANNEL, progress)
      })
      .finally(() => {
        activeSync = null
      })

    return activeSync
  })
}
