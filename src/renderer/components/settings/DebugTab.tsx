import { useMemo, useState, type ReactElement } from 'react'
import type {
  MemoryDebugRetrieveResult,
  MemoryDebugRetrievalHit,
  MemoryDebugRuntimeDetail,
  MemoryDebugScope
} from '@shared/memory-settings'
import { trackUiEvent } from '@renderer/logging'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { selectSessionById, useSessionStore } from '@renderer/stores/sessionStore'
import { cardClassName, formatDateTime, inputClassName } from './memory/helpers'
import { Textarea } from '@renderer/components/textarea'

const SCOPE_OPTIONS: Array<{ value: MemoryDebugScope; label: string; description: string }> = [
  {
    value: 'all',
    label: '全部',
    description: '同时检查 world 和长期记忆'
  },
  {
    value: 'world',
    label: '世界知识',
    description: '只看内置 world 知识库'
  },
  {
    value: 'character-memory',
    label: '长期记忆',
    description: '只看当前角色的长期记忆'
  }
]

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(4)
}

function RuntimeCard({
  detail,
  title
}: {
  detail: MemoryDebugRuntimeDetail
  title: string
}): ReactElement {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white/90">{title}</div>
          <div className="mt-1 text-xs text-white/45">
            可用性: {detail.indexAvailability} | 实际模式: {detail.retrievalModeUsed}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70">
          命中 {detail.resultCount}
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-white/65">
        <div>启用状态: {detail.enabled ? '已启用' : '未启用'}</div>
        {detail.targetCharacterId && <div>角色: {detail.targetCharacterId}</div>}
        {detail.targetSessionId && <div>会话: {detail.targetSessionId}</div>}
        {detail.fallbackReason && (
          <div className="text-amber-200/90">说明: {detail.fallbackReason}</div>
        )}
      </div>
    </div>
  )
}

function HitCard({ hit }: { hit: MemoryDebugRetrievalHit }): ReactElement {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-[#f2d5a8]">
          #{hit.rank}
        </span>
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white/70">
          score {formatScore(hit.score)}
        </span>
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white/70">
          {hit.retrievalModeUsed}
        </span>
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white/70">
          {hit.scope}
        </span>
      </div>

      <div className="mt-3 text-sm leading-6 whitespace-pre-wrap text-white/85">{hit.text}</div>

      <div className="mt-3 space-y-1 text-xs text-white/45">
        {hit.sourcePath && <div>来源文件: {hit.sourcePath}</div>}
        {hit.characterId && <div>角色: {hit.characterId}</div>}
        {hit.sessionId && <div>会话: {hit.sessionId}</div>}
      </div>
    </div>
  )
}

export default function DebugTab(): ReactElement {
  const activateChar = useCharacterStore((state) => state.activateChar)
  const currentSessionId = useSessionStore((state) => state.currentSessionId)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<MemoryDebugScope>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [result, setResult] = useState<MemoryDebugRetrieveResult | null>(null)

  const currentSession = useSessionStore(selectSessionById(currentSessionId))
  const selectedCharacterId = activateChar?.id || currentSession?.characterId || null
  const selectedSessionId =
    currentSession && (!selectedCharacterId || currentSession.characterId === selectedCharacterId)
      ? currentSession.id
      : null

  const groupedHits = useMemo(() => {
    const source = result?.results || []
    return {
      world: source.filter((hit) => hit.scope === 'world'),
      memory: source.filter((hit) => hit.scope === 'character-memory')
    }
  }, [result])

  const handleRun = async (): Promise<void> => {
    if (!window.memory.debugRetrieve) {
      setErrorMessage('当前环境没有暴露调试检索接口。')
      return
    }

    try {
      setIsLoading(true)
      setErrorMessage('')
      trackUiEvent('memory-debug-retrieve', 'Developer ran a memory debug retrieval query', {
        scope,
        characterId: selectedCharacterId,
        sessionId: selectedSessionId,
        queryLength: query.trim().length
      })

      const nextResult = await window.memory.debugRetrieve({
        query,
        scope,
        characterId: selectedCharacterId,
        sessionId: selectedSessionId
      })
      setResult(nextResult)
    } catch (error) {
      console.error('Failed to run debug retrieval', error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-6 py-4">
      <section className={cardClassName()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-white/90">RAG 检索调试</h2>
            <p className="mt-1 text-xs text-white/45">
              仅开发环境可见。直接输入 query，查看 world 与长期记忆的实际检索结果。
            </p>
          </div>
          <div className="rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-xs text-[#f2d5a8]">
            DEV ONLY
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-xs text-white/60 md:grid-cols-2">
          <div className="rounded border border-white/10 bg-black/20 px-3 py-2">
            当前角色: {selectedCharacterId || '未选择'}
          </div>
          <div className="rounded border border-white/10 bg-black/20 px-3 py-2">
            当前会话: {selectedSessionId || '未选择'}
          </div>
        </div>

        <div className="mt-4">
          <Textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入一句想测试的查询，例如：今州黑海岸发生了什么？"
            className={`${inputClassName()} min-h-24 resize-y bg-black/20`}
          />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              className={
                scope === option.value
                  ? 'rounded border border-[#e8c690]/60 bg-white/10 px-3 py-3 text-left text-[#e8c690]'
                  : 'rounded border border-white/10 bg-black/20 px-3 py-3 text-left text-white/70 hover:bg-white/5'
              }
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className="mt-1 text-xs leading-5 text-white/45">{option.description}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={isLoading || !query.trim()}
            className="rounded border border-[#e8c690]/50 bg-[#e8c690]/10 px-4 py-2 text-sm text-[#f2d5a8] transition-colors hover:bg-[#e8c690]/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? '检索中...' : '执行检索'}
          </button>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setErrorMessage('')
              setResult(null)
            }}
            disabled={isLoading && !result}
            className="rounded border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            清空结果
          </button>
          {result && (
            <div className="text-xs text-white/45">
              本次模式: {result.runtimeSummary.requestedMode} | 命中 {result.results.length} 条
            </div>
          )}
        </div>
      </section>

      {errorMessage && (
        <div className="rounded border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          调试检索失败: {errorMessage}
        </div>
      )}

      {result && (
        <>
          <section className={cardClassName()}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-white/90">运行摘要</h3>
                <p className="mt-1 text-xs text-white/45">
                  检索时间: {formatDateTime(new Date().toISOString())}
                </p>
              </div>
              <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                scope: {result.scope}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <RuntimeCard detail={result.runtimeSummary.world} title="世界知识" />
              <RuntimeCard detail={result.runtimeSummary.memory} title="长期记忆" />
            </div>
          </section>

          <section className={cardClassName()}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-white/90">命中结果</h3>
                <p className="mt-1 text-xs text-white/45">
                  query:{' '}
                  <span className="font-mono text-white/70">{result.query || '(empty)'}</span>
                </p>
              </div>
            </div>

            {result.results.length === 0 ? (
              <div className="mt-4 rounded border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                没有命中结果。你可以换一个 query，或者先确认 world / memory 索引状态是否可用。
              </div>
            ) : (
              <div className="mt-4 space-y-5">
                {groupedHits.world.length > 0 && (
                  <div>
                    <div className="mb-3 text-sm font-medium text-white/85">世界知识</div>
                    <div className="space-y-3">
                      {groupedHits.world.map((hit) => (
                        <HitCard key={hit.id} hit={hit} />
                      ))}
                    </div>
                  </div>
                )}

                {groupedHits.memory.length > 0 && (
                  <div>
                    <div className="mb-3 text-sm font-medium text-white/85">长期记忆</div>
                    <div className="space-y-3">
                      {groupedHits.memory.map((hit) => (
                        <HitCard key={hit.id} hit={hit} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
