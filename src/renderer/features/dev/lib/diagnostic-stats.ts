import type { ChatDiagnosticRunEvent, ChatTokenUsage } from '@shared/chat'
import type { AgentDiagnosticsSnapshot } from '@renderer/features/dev/store/diagnostics'

export type DiagnosticStats = {
  modelCalls: number
  toolResults: number
  durationMs: number | null
  tokenUsage: ChatTokenUsage | null
  usageReportedCalls: number
}

/**
 * @description 统计诊断运行的模型请求、工具结果和 token 用量。
 * @param snapshot 当前快照。
 * @returns 诊断统计。
 */
export function getDiagnosticStats(snapshot: AgentDiagnosticsSnapshot): DiagnosticStats {
  type DiagnosticStatsAccumulator = DiagnosticStats & {
    completedTokenUsage?: ChatTokenUsage
  }

  const stats = snapshot.events.reduce<DiagnosticStatsAccumulator>(
    (current, event: ChatDiagnosticRunEvent) => {
      if (event.type === 'llm-request') {
        current.modelCalls += 1
      } else if (event.type === 'tool-result') {
        current.toolResults += 1
      } else if (event.type === 'llm-response' && event.usage) {
        current.usageReportedCalls += 1
        const total = current.tokenUsage
        current.tokenUsage = {
          inputTokens: (total?.inputTokens || 0) + event.usage.inputTokens,
          outputTokens: (total?.outputTokens || 0) + event.usage.outputTokens,
          totalTokens: (total?.totalTokens || 0) + event.usage.totalTokens
        }
      } else if (event.type === 'completed') {
        current.durationMs = event.durationMs
        current.completedTokenUsage = event.tokenUsage
      }

      return current
    },
    {
      modelCalls: 0,
      toolResults: 0,
      durationMs: null,
      tokenUsage: null,
      usageReportedCalls: 0
    }
  )

  return {
    modelCalls: stats.modelCalls,
    toolResults: stats.toolResults,
    durationMs: stats.durationMs,
    tokenUsage: stats.completedTokenUsage || stats.tokenUsage,
    usageReportedCalls: stats.usageReportedCalls
  }
}
