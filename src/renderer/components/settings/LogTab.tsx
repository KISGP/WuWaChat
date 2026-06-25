import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type { LogEntry, LogViewerState } from '@shared/logging'
import { trackUiEvent } from '@renderer/logging'
import { ConfirmActionModal } from '@renderer/components/settings/ConfirmActionModal'
import { SectionCard } from '@renderer/components/settings/section'
import { formatBytes } from '@renderer/utils'

type RowData = {
  entries: LogEntry[]
}

type LogLevelFilter = LogEntry['level'] | 'all'

const LOG_LEVEL_FILTERS: Array<{ value: LogLevelFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'error', label: '错误' },
  { value: 'warn', label: '警告' },
  { value: 'info', label: '信息' },
  { value: 'debug', label: '调试' }
]

function getLogLevelClass(entry: LogEntry): string {
  if (entry.rawLine) {
    return 'bg-yellow-500/5 text-yellow-100/75'
  }

  if (entry.level === 'error') {
    return 'bg-red-500/10 text-red-100'
  }

  if (entry.level === 'warn') {
    return 'bg-yellow-500/10 text-yellow-100'
  }

  return 'bg-transparent text-white/55'
}

function getLogLevelBadgeClass(level: LogEntry['level']): string {
  if (level === 'error') {
    return 'bg-red-500/20 text-red-100'
  }

  if (level === 'warn') {
    return 'bg-yellow-500/20 text-yellow-100'
  }

  return 'bg-white/8 text-white/45'
}

function formatLogLine(entry: LogEntry): [string, string, string] {
  if (entry.rawLine) {
    return ['WARN', entry.rawLine, '']
  }

  const context =
    entry.context && Object.keys(entry.context).length > 0
      ? ` ${JSON.stringify(entry.context)}`
      : ''

  return [
    entry.level.toUpperCase(),
    `${new Date(entry.timestamp).toLocaleString()} ${entry.source}:${entry.event}`,
    ` ${entry.message}${context}`
  ]
}

function LogRow({ index, style, entries }: RowComponentProps<RowData>): ReactElement {
  const entry = entries[index]
  const [levelLabel, metaText, detailText] = formatLogLine(entry)

  return (
    <div style={style} className={`px-3 py-2 text-xs leading-6.25 ${getLogLevelClass(entry)}`}>
      <span className="flex min-w-0 items-center gap-2 font-mono">
        <span
          className={`w-12 shrink-0 rounded text-center text-[10px] font-semibold ${getLogLevelBadgeClass(entry.level)}`}
        >
          {levelLabel}
        </span>
        <span className="truncate">{metaText}</span>
      </span>
      <span className="ml-14 block truncate font-mono">{detailText}</span>
    </div>
  )
}

export function LogTab(): ReactElement {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [viewerState, setViewerState] = useState<LogViewerState | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('all')

  const filteredEntries = useMemo(
    () => entries.filter((entry) => levelFilter === 'all' || entry.level === levelFilter),
    [entries, levelFilter]
  )

  /**
   * @description 读取日志元数据与日志列表，并同步更新日志页展示状态。
   * @remarks 该函数会重置加载态与错误信息；失败时保留已有列表内容，仅更新错误提示。
   */
  const refreshLogs = async (): Promise<void> => {
    try {
      setLoading(true)
      setErrorMessage('')
      const [nextViewerState, nextEntries] = await Promise.all([
        window.logs.getViewerState(),
        window.logs.readLogs()
      ])
      setViewerState(nextViewerState)
      setEntries(nextEntries)
    } catch (error) {
      console.error('Failed to fetch logs:', error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshLogs()
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [])

  /**
   * @description 打开当前日志目录，便于用户直接查看或导出日志文件。
   */
  const handleOpenDirectory = (): void => {
    trackUiEvent('log-directory-open', 'User opened the log directory from the log tab')
    void window.logs.openDirectory()
  }

  /**
   * @description 打开清空日志确认弹层，避免使用原生同步确认框影响窗口命中状态。
   */
  const handleOpenClearConfirm = (): void => {
    setIsConfirmOpen(true)
  }

  /**
   * @description 关闭清空日志确认弹层。
   * @remarks 日志正在清空时不允许关闭，避免界面状态与实际执行状态不一致。
   */
  const handleCloseClearConfirm = (): void => {
    if (clearing) {
      return
    }

    setIsConfirmOpen(false)
  }

  /**
   * @description 清空当前日志文件并刷新日志页内容。
   * @remarks 成功后关闭确认弹层；失败时保留弹层并展示错误信息，防止误判执行结果。
   */
  const handleClearLogs = async (): Promise<void> => {
    try {
      setClearing(true)
      setErrorMessage('')
      trackUiEvent('log-clear', 'User cleared log entries from the log tab')
      await window.logs.clearLogs()
      await refreshLogs()
      setIsConfirmOpen(false)
    } catch (error) {
      console.error('Failed to clear logs:', error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setClearing(false)
    }
  }

  return (
    <>
      <div className="h-full overflow-y-auto px-4">
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 pb-6">
          <SectionCard title="日志状态">
            <div className="relative w-full rounded border border-white/8 bg-black/20 px-4 py-3 text-xs text-white/55">
              {viewerState ? (
                <>
                  <div className="truncate">File: {viewerState.filePath}</div>
                  <div className="mt-2">
                    Size: {formatBytes(viewerState.sizeBytes)}
                    {viewerState.updatedAt ? ` | Updated: ${viewerState.updatedAt}` : ''}
                  </div>
                </>
              ) : (
                'Loading log metadata...'
              )}

              <div className="absolute top-1/2 right-2 flex flex-1 -translate-y-1/2 flex-wrap items-center gap-2">
                <button
                  onClick={handleOpenClearConfirm}
                  disabled={loading || clearing}
                  className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-100 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                >
                  {clearing ? '清空中...' : '清空日志'}
                </button>
                <button
                  onClick={handleOpenDirectory}
                  className="rounded bg-white/10 px-3 py-2 text-sm text-white transition-colors hover:bg-white/20"
                >
                  打开日志目录
                </button>
                <button
                  onClick={() => void refreshLogs()}
                  disabled={loading || clearing}
                  className="rounded bg-white/10 px-3 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  {loading ? '刷新中...' : '刷新'}
                </button>
              </div>
            </div>
          </SectionCard>

          <div className="flex flex-wrap items-center gap-2 rounded border border-white/8 bg-black/20 px-4 py-3">
            <span className="mr-1 text-xs text-white/45">Level</span>
            {LOG_LEVEL_FILTERS.map((filter) => {
              const isActive = levelFilter === filter.value

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setLevelFilter(filter.value)}
                  className={`rounded px-3 py-1.5 text-xs transition-colors ${
                    isActive
                      ? 'bg-[#e8c690]/20 text-[#f7d9a6]'
                      : 'bg-white/8 text-white/55 hover:bg-white/14 hover:text-white/75'
                  }`}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>

          <div className="min-h-96 flex-1 overflow-hidden rounded border border-white/8 bg-black/30">
            {errorMessage ? (
              <div className="p-4 text-sm text-red-300">Failed to read logs: {errorMessage}</div>
            ) : filteredEntries.length === 0 && !loading ? (
              <div className="p-4 text-sm text-white/50">No logs yet</div>
            ) : (
              <List
                rowComponent={LogRow}
                rowCount={filteredEntries.length}
                rowHeight={60}
                rowProps={{ entries: filteredEntries }}
              />
            )}
          </div>
        </div>
      </div>

      {isConfirmOpen && (
        <ConfirmActionModal
          title="清空日志"
          description="确认是否清空当前日志文件？该操作会移除日志页当前可见的日志内容。"
          confirmLabel={clearing ? '清空中...' : '确认清空'}
          confirmDisabled={clearing}
          cancelDisabled={clearing}
          onCancel={handleCloseClearConfirm}
          onConfirm={() => void handleClearLogs()}
        />
      )}
    </>
  )
}
