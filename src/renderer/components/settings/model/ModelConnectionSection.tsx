import { Loader2, Wifi } from 'lucide-react'
import type { ReactElement } from 'react'
import type { OpenAIProfileConnectionTestResult } from '../../../../shared/model-settings'
import { cn } from '../../../utils'

export function ModelConnectionSection({
  canTest,
  testing,
  result,
  modelOptions,
  onTest
}: {
  canTest: boolean
  testing: boolean
  result?: OpenAIProfileConnectionTestResult
  modelOptions: string[]
  onTest: () => Promise<void>
}): ReactElement {
  const hasModelOptions = modelOptions.length > 0

  return (
    <section className="rounded border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onTest()}
          disabled={!canTest}
          className="flex h-9 items-center gap-2 rounded border border-white/20 bg-white/5 px-4 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Wifi className="size-4" />}
          {testing ? '测试中...' : '测试连接'}
        </button>

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

      {hasModelOptions && (
        <div className="mt-3 max-h-20  overflow-y-auto rounded bg-black/25 p-2 text-xs text-white/55">
          {modelOptions.slice(0, 24).join(' / ')}
          {modelOptions.length > 24 ? ` / 还有 ${modelOptions.length - 24} 个` : ''}
        </div>
      )}
    </section>
  )
}
