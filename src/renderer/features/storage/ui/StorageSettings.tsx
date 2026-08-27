import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { StorageUsageItem, StorageUsageSnapshot } from '@shared/storage'
import { SectionCard } from '@renderer/common/components/SectionCard'
import { Spinner } from '@renderer/common/components/spinner'
import { formatBytes } from '@renderer/common/lib/cn'
import { getUsage } from '@renderer/services/storage'

type ChartDatum = StorageUsageItem & {
  value: number
}

/**
 * @description 格式化存储扫描时间，缺失或异常值会回退为原始字符串。
 * @param value ISO 时间字符串。
 * @returns 本地化后的时间文本。
 */
function formatScannedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

/**
 * @description 计算分类在总占用中的百分比文案。
 * @param sizeBytes 分类字节数。
 * @param totalBytes 总字节数。
 * @returns 百分比文本。
 */
function formatPercent(sizeBytes: number, totalBytes: number): string {
  if (totalBytes <= 0) {
    return '0%'
  }

  return `${((sizeBytes / totalBytes) * 100).toFixed(1)}%`
}

/**
 * @description 渲染 Recharts Tooltip 中的存储分类信息。
 * @param props Recharts Tooltip 回调属性。
 * @returns Tooltip 节点。
 */
function StorageTooltip({
  active,
  payload
}: {
  active?: boolean
  payload?: Array<{ payload: ChartDatum }>
}): ReactElement | null {
  if (!active || !payload?.[0]) {
    return null
  }

  const item = payload[0].payload

  return (
    <div className="rounded border border-white/10 bg-black/85 px-3 py-2 text-xs text-white shadow-xl">
      <div className="font-medium">{item.label}</div>
      <div className="mt-1 text-white/65">{formatBytes(item.sizeBytes)}</div>
    </div>
  )
}

/**
 * @description 渲染应用数据目录的存储占用分析页。
 * @returns 设置页存储分析 Tab 内容。
 */
export function StorageTab(): ReactElement {
  const [snapshot, setSnapshot] = useState<StorageUsageSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [removedCategoryIds, setRemovedCategoryIds] = useState<string[]>([])

  const chartData = useMemo<ChartDatum[]>(
    () =>
      snapshot
        ? snapshot.items
            .filter((item) => item.sizeBytes > 0 && !removedCategoryIds.includes(item.id))
            .map((item) => ({
              ...item,
              value: item.sizeBytes
            }))
        : [],
    [removedCategoryIds, snapshot]
  )

  /**
   * @description 切换存储分类在分析结果中的移除状态。
   * @param categoryId 被点击的分类 id。
   */
  const toggleCategoryRemoval = (categoryId: string): void => {
    setRemovedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((removedCategoryId) => removedCategoryId !== categoryId)
        : [...current, categoryId]
    )
  }

  /**
   * @description 刷新应用数据目录的存储占用快照。
   * @remarks 失败时保留已有快照，并在页内展示错误信息。
   */
  const refreshStorageUsage = async (): Promise<void> => {
    try {
      setLoading(true)
      setErrorMessage('')
      const nextSnapshot = await getUsage()
      setSnapshot(nextSnapshot)
    } catch (error) {
      console.error('Failed to fetch storage usage:', error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshStorageUsage()
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [])

  return (
    <div className="h-full overflow-y-auto px-4">
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 pb-6">
        <SectionCard title="应用存储">
          <div className="relative w-full rounded border border-white/8 bg-black/20 px-4 py-3 text-xs text-white/55">
            {snapshot ? (
              <>
                <div className="truncate">Root: {snapshot.rootPath}</div>
                <div className="mt-2">
                  Total: {formatBytes(snapshot.totalBytes)} | Scanned:{' '}
                  {formatScannedAt(snapshot.scannedAt)}
                </div>
              </>
            ) : (
              '正在读取应用存储占用...'
            )}

            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2">
              <button
                onClick={() => void refreshStorageUsage()}
                disabled={loading}
                className="rounded bg-white/10 px-3 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50"
              >
                {loading ? '刷新中...' : '刷新'}
              </button>
            </div>
          </div>
        </SectionCard>

        {errorMessage && (
          <div className="rounded border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            读取存储占用失败：{errorMessage}
          </div>
        )}

        <div className="flex min-h-112 flex-1 flex-col gap-4">
          <section className="min-h-80 rounded border border-white/8 bg-black/30 p-4">
            {loading && !snapshot ? (
              <div className="flex h-full min-h-80 items-center justify-center text-[#e8c690]">
                <Spinner className="mr-2" />
                <span className="text-sm">正在分析存储占用...</span>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-full min-h-80 items-center justify-center text-sm text-white/50">
                暂无应用数据占用
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={320}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={2}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                  >
                    {chartData.map((item) => (
                      <Cell
                        key={item.id}
                        fill={item.color}
                        className="cursor-pointer outline-none"
                        onClick={() => toggleCategoryRemoval(item.id)}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<StorageTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="rounded border border-white/8 bg-black/30 p-4">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-baseline justify-between gap-3 lg:justify-start">
                <h3 className="text-sm font-medium text-white/90">分类明细</h3>
                <span className="text-xs text-white/50">
                  {snapshot ? snapshot.items.length : '--'}
                </span>
                {removedCategoryIds.length > 0 && (
                  <button
                    onClick={() => setRemovedCategoryIds([])}
                    className="rounded bg-white/10 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/20"
                  >
                    恢复全部
                  </button>
                )}
              </div>
            </div>

            {(snapshot?.items.length ?? 0) === 0 ? (
              <div className="rounded border border-white/6 bg-white/4 px-3 py-6 text-center text-sm text-white/45">
                暂无存储分类
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {(snapshot?.items ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleCategoryRemoval(item.id)}
                    className={`rounded border border-white/6 bg-white/4 px-3 py-2 text-left transition-all hover:border-red-300/50 hover:bg-red-500/8 ${
                      removedCategoryIds.includes(item.id) ? 'opacity-35' : 'opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="truncate text-sm text-white/85">{item.label}</span>
                        {removedCategoryIds.includes(item.id) && (
                          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                            已隐藏
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 text-xs text-white/65">
                        {formatBytes(item.sizeBytes)}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-white/40">
                      <span className="truncate">{item.description}</span>
                      <span className="shrink-0">
                        {snapshot ? formatPercent(item.sizeBytes, snapshot.totalBytes) : '0%'}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-white/30">{item.path}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
