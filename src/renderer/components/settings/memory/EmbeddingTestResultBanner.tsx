import type { ReactElement } from 'react'
import type { EmbeddingConnectionTestResult } from '../../../../shared/memory-settings'
import { cn } from '../../../utils'

export function EmbeddingTestResultBanner({
  result
}: {
  result: EmbeddingConnectionTestResult
}): ReactElement {
  return (
    <div
      className={cn(
        'mt-3 rounded border px-3 py-2 text-sm',
        result.ok
          ? 'border-green-400/30 bg-green-500/10 text-green-200'
          : 'border-red-400/30 bg-red-500/10 text-red-200'
      )}
    >
      <div>{result.message}</div>
      <div className="mt-1 text-xs opacity-80">
        {typeof result.latencyMs === 'number' ? `延迟 ${result.latencyMs}ms` : '延迟未知'}
        {typeof result.dimensions === 'number' ? ` / ${result.dimensions} 维` : ''}
      </div>
    </div>
  )
}
