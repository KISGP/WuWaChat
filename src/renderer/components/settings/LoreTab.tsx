import { useEffect, useState, type ReactElement } from 'react'
import { Download, LoaderCircle, RefreshCw } from 'lucide-react'
import type { LoreStatus } from '@shared/lore'
import { SectionCard } from '@renderer/components/settings/section'

/**
 * @description 渲染 Lore 资料包状态及维护操作。
 * @returns Lore 设置页面。
 */
export function LoreTab(): ReactElement {
  const [status, setStatus] = useState<LoreStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.lore
      .getStatus()
      .then(setStatus)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [])

  /**
   * @description 运行 Lore 资料包维护操作并刷新状态。
   * @param action 要调用的维护操作。
   */
  async function runAction(action: () => Promise<LoreStatus>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setStatus(await action())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto h-full overflow-y-auto px-4 pb-4">
      <SectionCard title="Lore 知识包">
        <div className="space-y-4 px-4 pb-4 text-sm text-white/70">
          <p>
            {status?.available ? '资料包可用' : '资料包未就绪'}。场景 {status?.sceneCount ?? '-'}{' '}
            条，术语 {status?.termCount ?? '-'} 条。
          </p>
          {error && <p className="text-xs text-red-200">操作失败：{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction(() => window.lore.updateSource())}
              className="flex items-center gap-2 rounded border border-white/15 px-3 py-2 disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              更新资料
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction(() => window.lore.rebuild())}
              className="flex items-center gap-2 rounded border border-white/15 px-3 py-2 disabled:opacity-50"
            >
              <RefreshCw className="size-4" />
              重建资料包
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
