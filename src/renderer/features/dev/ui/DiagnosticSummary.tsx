import { Eraser } from 'lucide-react'
import type { ReactElement } from 'react'
import type { AgentDiagnosticsSnapshot } from '@renderer/features/dev/store/diagnostics'
import type { DiagnosticStats } from '../lib/diagnostic-stats'
import { formatDuration, formatTokenCount } from '../lib/formatters'

type DiagnosticSummaryProps = {
  snapshot: AgentDiagnosticsSnapshot
  stats: DiagnosticStats
  activeProfileName: string
  isRunning: boolean | undefined
  onClear: () => void
}

/**
 * @description Renders aggregate counts and token usage for the current diagnostic run.
 * @param props Diagnostic snapshot, statistics, and clear callback.
 * @returns Diagnostic summary bar.
 */
export function DiagnosticSummary({
  snapshot,
  stats,
  activeProfileName,
  isRunning,
  onClear
}: DiagnosticSummaryProps): ReactElement {
  return (
    <section className="flex flex-wrap items-center gap-2 rounded border border-white/8 bg-black/20 px-3 py-2">
      <span className="text-xs text-white/35">当前模型：{activeProfileName}</span>
      <span className="text-xs text-white/35">模型请求 {stats.modelCalls}</span>
      <span className="text-xs text-white/35">工具结果 {stats.toolResults}</span>
      {stats.tokenUsage ? (
        <>
          <span className="text-xs text-white/35">输入 {formatTokenCount(stats.tokenUsage.inputTokens)}</span>
          <span className="text-xs text-white/35">输出 {formatTokenCount(stats.tokenUsage.outputTokens)}</span>
          <span className="text-xs text-white/45">总计 {formatTokenCount(stats.tokenUsage.totalTokens)}</span>
          {stats.usageReportedCalls < stats.modelCalls && (
            <span className="text-[10px] text-amber-200/70">
              Token 已统计 {stats.usageReportedCalls}/{stats.modelCalls} 次
            </span>
          )}
        </>
      ) : (
        snapshot.status !== 'running' && (
          <span className="text-[10px] text-white/30">Token 未提供</span>
        )
      )}
      {stats.durationMs !== null && (
        <span className="text-xs text-white/35">耗时 {formatDuration(stats.durationMs)}</span>
      )}
      <button
        type="button"
        onClick={onClear}
        disabled={isRunning}
        title="清理诊断结果"
        aria-label="清理诊断结果"
        className="ml-auto flex size-7 items-center justify-center rounded text-white/45 hover:bg-white/8 disabled:opacity-30"
      >
        <Eraser className="size-3.5" />
      </button>
    </section>
  )
}
