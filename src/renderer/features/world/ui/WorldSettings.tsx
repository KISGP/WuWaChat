import { useEffect, useState, type ReactElement } from 'react'
import { SettingItem } from '@renderer/common/components/SettingItem'
import { useWorldSyncStore } from '@renderer/features/world/store/sync'
import { Spinner } from '@renderer/common/components/spinner'
import { getWorldStatus } from '@renderer/services/world'

/**
 * @description 渲染 world 资料下载页面。
 * @returns 资料设置 Tab 内容。
 */
export function WorldTab(): ReactElement {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const { phase, progress, noticeMessage, errorMessage, startSync } = useWorldSyncStore()

  useEffect(() => {
    /**
     * @description 读取本地 world 资料状态并初始化页面。
     */
    const loadStatus = async (): Promise<void> => {
      try {
        setLoading(true)
        setLoadError('')
        await getWorldStatus()
      } catch (error) {
        console.error('Failed to load world status:', error)
        setLoadError(error instanceof Error ? error.message : String(error))
      } finally {
        setLoading(false)
      }
    }
    void loadStatus()
  }, [])

  return (
    <div className="mx-auto h-full overflow-y-auto px-4 pb-4">
      <SettingItem
        title="背景资料"
        expandedItems={[
          <p key="description" className="text-muted-foreground">
            下载或更新 WuWaChatWorld 的远端资料。
          </p>
        ]}
      >
        <button
          type="button"
          onClick={() => void startSync()}
          disabled={loading || phase !== 'idle'}
          className="flex min-w-36 items-center justify-center gap-2 rounded bg-[#e8c690] px-3 py-2 text-sm text-[#1b1b1b] transition-colors hover:bg-[#f2d7a7] disabled:opacity-50"
        >
          {(loading || phase !== 'idle') && <Spinner className="size-4" />}
          {loading
            ? '读取状态...'
            : phase === 'checking'
              ? '检查更新...'
              : phase === 'downloading'
                ? progress
                  ? `下载中 ${progress.completed}/${progress.total}`
                  : '下载中...'
                : noticeMessage || '下载资料'}
        </button>
      </SettingItem>

      {(loadError || errorMessage) && (
        <p className="px-4 py-3 text-xs text-red-200">资料操作失败：{loadError || errorMessage}</p>
      )}
    </div>
  )
}
