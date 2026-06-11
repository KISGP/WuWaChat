import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type { LogEntry, LogViewerState } from '@shared/logging'
import { trackUiEvent } from '@renderer/logging'
import { SectionCard } from '@renderer/components/settings/section'
import { formatBytes } from '@renderer/utils'

type RowData = {
  lines: [string, string][]
}

export function formatLogLine(entry: LogEntry): [string, string] {
  if (entry.rawLine) {
    return [entry.rawLine, '']
  }

  const context =
    entry.context && Object.keys(entry.context).length > 0
      ? ` ${JSON.stringify(entry.context)}`
      : ''

  return [
    `[${entry.level.toUpperCase()}] ${new Date(entry.timestamp).toLocaleString()} ${entry.source}:${entry.event}`,
    ` ${entry.message}${context}`
  ]
}

function LogRow({ index, style, lines }: RowComponentProps<RowData>): ReactElement {
  return (
    <div style={style} className="border-b border-white/5 px-3 text-xs leading-6.25 text-white/80">
      <span className="block truncate font-mono">{lines[index][0]}</span>
      <span className="ml-12 block truncate font-mono">{lines[index][1]}</span>
    </div>
  )
}

export function LogTab(): ReactElement {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [viewerState, setViewerState] = useState<LogViewerState | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const lines = useMemo(() => entries.map((entry) => formatLogLine(entry)), [entries])

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

  const handleOpenDirectory = (): void => {
    trackUiEvent('log-directory-open', 'User opened the log directory from the log tab')
    void window.logs.openDirectory()
  }

  const handleClearLogs = async (): Promise<void> => {
    if (!window.confirm('Clear the current log file?')) {
      return
    }

    try {
      setClearing(true)
      setErrorMessage('')
      trackUiEvent('log-clear', 'User cleared log entries from the log tab')
      await window.logs.clearLogs()
      await refreshLogs()
    } catch (error) {
      console.error('Failed to clear logs:', error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setClearing(false)
    }
  }

  return (
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
                onClick={() => void handleClearLogs()}
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

        <div className="min-h-96 flex-1 overflow-hidden rounded border border-white/8 bg-black/30">
          {errorMessage ? (
            <div className="p-4 text-sm text-red-300">Failed to read logs: {errorMessage}</div>
          ) : lines.length === 0 && !loading ? (
            <div className="p-4 text-sm text-white/50">No logs yet</div>
          ) : (
            <List
              rowComponent={LogRow}
              rowCount={lines.length}
              rowHeight={50}
              rowProps={{ lines }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
