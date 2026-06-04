import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type { LogEntry, LogViewerState } from '../../../shared/logging'
import { trackUiEvent } from '../../logging'

type RowData = {
  lines: string[]
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatLogLine(entry: LogEntry): string {
  if (entry.rawLine) {
    return entry.rawLine
  }

  const context =
    entry.context && Object.keys(entry.context).length > 0 ? ` ${JSON.stringify(entry.context)}` : ''
  return `[${entry.level.toUpperCase()}] ${entry.timestamp} ${entry.source}:${entry.event} ${entry.message}${context}`
}

function LogRow({ index, style, lines }: RowComponentProps<RowData>): ReactElement {
  return (
    <div style={style} className="border-b border-white/5 px-3 text-xs leading-[25px] text-white/80">
      <span className="block truncate font-mono">{lines[index]}</span>
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
    <div className="flex h-full flex-col px-8 py-4">
      <div className="flex items-start justify-between gap-4 pb-4">
        <div className="min-w-0">
          <div className="mt-1 text-xs text-white/45">
            {viewerState ? (
              <>
                <div className="truncate">File: {viewerState.filePath}</div>
                <div>
                  Size: {formatBytes(viewerState.sizeBytes)}
                  {viewerState.updatedAt ? ` | Updated: ${viewerState.updatedAt}` : ''}
                </div>
              </>
            ) : (
              'Loading log metadata...'
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleClearLogs()}
            disabled={loading || clearing}
            className="rounded bg-red-500/20 px-3 py-1 text-sm text-red-100 hover:bg-red-500/30 disabled:opacity-50"
          >
            {clearing ? '清空中...' : '清空日志'}
          </button>
          <button
            onClick={handleOpenDirectory}
            className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
          >
            打开日志文件夹
          </button>
          <button
            onClick={() => void refreshLogs()}
            disabled={loading || clearing}
            className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded bg-black/30">
        {errorMessage ? (
          <div className="p-4 text-sm text-red-300">Failed to read logs: {errorMessage}</div>
        ) : lines.length === 0 && !loading ? (
          <div className="p-4 text-sm text-white/50">No logs yet</div>
        ) : (
          <List
            rowComponent={LogRow}
            rowCount={lines.length}
            rowHeight={25}
            rowProps={{ lines }}
          />
        )}
      </div>
    </div>
  )
}
