import { Wifi, X } from 'lucide-react'
import type { ReactElement } from 'react'
import type { OpenAIProfileConnectionTestResult } from '@shared/model-settings'
import { cn } from '@renderer/common/lib/cn'

export function ModelConnectionSection({
  canTest,
  testing,
  result,
  onTest,
  onCancel
}: {
  canTest: boolean
  testing: boolean
  result?: OpenAIProfileConnectionTestResult
  onTest: () => Promise<void>
  onCancel: () => Promise<void>
}): ReactElement {
  return (
    <section className="rounded border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-3">
        {testing ? (
          <button
            type="button"
            onClick={() => void onCancel()}
            className="flex h-9 items-center gap-2 rounded border border-red-300/30 bg-red-500/10 px-4 text-sm text-red-100 transition-colors hover:bg-red-500/20"
          >
            <X className="size-4" />
            取消测试
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={!canTest}
            className="flex h-9 items-center gap-2 rounded border border-white/20 bg-white/5 px-4 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Wifi className="size-4" />
            测试连接
          </button>
        )}

        {result && (
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              result.ok ? 'text-green-400' : 'text-red-300'
            )}
            title={result.message}
          >
            {result.message}
            {typeof result.latencyMs === 'number' ? ` / ${result.latencyMs}ms` : ''}
          </span>
        )}
      </div>
    </section>
  )
}
