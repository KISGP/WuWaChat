import type { WorldSyncProgress } from '@shared/world'
import { create } from 'zustand'
import { checkForUpdates, download, onDownloadProgress } from '@renderer/services/world'

type WorldSyncStore = {
  phase: 'idle' | 'checking' | 'downloading'
  progress: WorldSyncProgress | null
  noticeMessage: string
  errorMessage: string
  startSync: () => Promise<void>
}

let unsubscribeProgress: (() => void) | null = null

/**
 * @description 订阅应用级 world 下载进度，使进度状态不受设置 Tab 生命周期影响。
 * @returns 无返回值。
 * @remarks 订阅仅创建一次，并由应用进程持续持有。
 */
function ensureProgressSubscription(): void {
  if (unsubscribeProgress) {
    return
  }

  unsubscribeProgress = onDownloadProgress((progress) => {
    useWorldSyncStore.setState({ progress })
  })
}

export const useWorldSyncStore = create<WorldSyncStore>((set, get) => ({
  phase: 'idle',
  progress: null,
  noticeMessage: '',
  errorMessage: '',
  /**
   * @description 先检查远端 world 资料版本，再按需启动下载。
   * @returns 检查及可选下载流程完成后的 Promise。
   * @remarks 已有同步流程时会直接返回，避免重复发起下载。
   */
  startSync: async (): Promise<void> => {
    if (get().phase !== 'idle') {
      return
    }

    ensureProgressSubscription()
    set({ phase: 'checking', progress: null, noticeMessage: '', errorMessage: '' })
    try {
      const status = await checkForUpdates()
      if (!status.updateAvailable) {
        set({ noticeMessage: '资料已是最新，无需下载', phase: 'idle' })
        return
      }

      set({ phase: 'downloading' })
      const result = await download()
      if (result.outcome === 'unchanged') {
        set({ noticeMessage: '资料已是最新，无需下载' })
      }
    } catch (error) {
      console.error('Failed to download world data:', error)
      set({ phase: 'idle', errorMessage: error instanceof Error ? error.message : String(error) })
    } finally {
      if (get().phase === 'downloading') {
        set({ phase: 'idle' })
      }
    }
  }
}))
