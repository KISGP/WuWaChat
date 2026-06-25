import { useMemo, useState, type ReactElement } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type {
  IndexRuntimeMode,
  MemoryDebugRetrieveResult,
  MemoryDebugRetrievalHit,
  MemoryDebugScope
} from '@shared/memory-settings'
import { CharacterSessionSelect } from '@renderer/components/settings/CharacterSessionSelect'
import { SectionCard } from '@renderer/components/settings/section'
import { Textarea } from '@renderer/components/ui/textarea'
import { trackUiEvent } from '@renderer/logging'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { selectSessionById, useSessionStore } from '@renderer/stores/sessionStore'
import { cn } from '@renderer/utils'

const SCOPE_OPTIONS: Array<{ value: MemoryDebugScope; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'world', label: 'World' },
  { value: 'character-memory', label: '角色记忆' }
]

const RUNTIME_MODE_LABELS: Record<IndexRuntimeMode, string> = {
  string: '字符串',
  vector: '向量',
  degraded: '降级'
}

/**
 * @description 查找指定角色最近更新的一条会话，用于切换角色后的默认选择。
 * @param sessions 当前会话列表。
 * @param characterId 角色 ID。
 * @returns 最近会话 ID；若不存在则返回 `null`。
 */
function getLatestSessionIdForCharacter(
  sessions: Session[],
  characterId: string | null
): string | null {
  if (!characterId) {
    return null
  }

  return (
    sessions
      .filter((session) => session.characterId === characterId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id || null
  )
}

/**
 * @description 根据主页面当前角色和会话，计算 Debug 页首次挂载时的本地选择。
 * @param activeCharacter 当前主页面角色。
 * @param currentSession 当前主页面会话。
 * @returns 角色与会话的初始选择。
 */
function getInitialSelection(
  activeCharacter: Char | null,
  currentSession: Session | null
): {
  characterId: string | null
  sessionId: string | null
} {
  const characterId = activeCharacter?.id ?? currentSession?.characterId ?? null
  const sessionId =
    currentSession && currentSession.characterId === characterId ? currentSession.id : null

  return {
    characterId,
    sessionId
  }
}

/**
 * @description 将调试范围转换为界面标签。
 * @param scope 调试请求或命中的范围标识。
 * @returns 展示标签。
 */
function formatScopeLabel(scope: MemoryDebugScope | MemoryDebugRetrievalHit['scope']): string {
  if (scope === 'all') {
    return '全部'
  }

  return scope === 'world' ? 'World' : '角色记忆'
}

/**
 * @description 将命中分数格式化为更易读的文本。
 * @param score 检索命中分数。
 * @returns 格式化后的分数字符串。
 */
function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(4)
}

/**
 * @description 渲染单条记忆调试命中。
 * @param hit 检索命中。
 * @returns 命中条目节点。
 */
function DebugHitItem({ hit }: { hit: MemoryDebugRetrievalHit }): ReactElement {
  return (
    <article className="rounded border border-white/10 bg-black/30 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
        <span className="rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-[#f2d5a8]">
          #{hit.rank}
        </span>
        <span>{formatScopeLabel(hit.scope)}</span>
        <span>{RUNTIME_MODE_LABELS[hit.retrievalModeUsed]}</span>
        <span>score {formatScore(hit.score)}</span>
      </div>

      <pre className="mt-3 line-clamp-5 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-white/85">
        {hit.text.trim() || '(empty)'}
      </pre>

      {(hit.sourcePath || hit.characterId || hit.sessionId) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/35">
          {hit.sourcePath && <span className="break-all">来源：{hit.sourcePath}</span>}
          {hit.characterId && <span className="break-all">角色：{hit.characterId}</span>}
          {hit.sessionId && <span className="break-all">会话：{hit.sessionId}</span>}
        </div>
      )}
    </article>
  )
}

/**
 * @description 渲染调试页初始空状态。
 * @returns 空状态节点。
 */
function ResultEmptyState(): ReactElement {
  return (
    <div className="rounded border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm leading-6 text-white/45">
      选择角色和会话后输入 query，点击“执行检索”即可查看 memory / world 的实际命中结果。
    </div>
  )
}

export default function DebugTab(): ReactElement {
  const { activateChar, characters } = useCharacterStore(
    useShallow((state) => ({
      activateChar: state.activateChar,
      characters: state.characters
    }))
  )
  const { currentSessionId, sessions } = useSessionStore(
    useShallow((state) => ({
      currentSessionId: state.currentSessionId,
      sessions: state.sessions
    }))
  )
  const currentSession = useSessionStore(selectSessionById(currentSessionId))
  const initialSelection = useMemo(
    () => getInitialSelection(activateChar, currentSession),
    [activateChar, currentSession]
  )
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    initialSelection.characterId
  )
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSelection.sessionId
  )
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<MemoryDebugScope>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [result, setResult] = useState<MemoryDebugRetrieveResult | null>(null)
  const [hasRun, setHasRun] = useState(false)

  const debugRetrieve = window.memory.debugRetrieve
  const hasDebugApi = typeof debugRetrieve === 'function'
  const canRun = Boolean(selectedCharacterId && query.trim() && hasDebugApi)

  /**
   * @description 执行一次记忆调试检索，并刷新当前页面结果。
   * @remarks 若当前环境未暴露调试接口，则直接展示错误提示。
   */
  const handleRun = async (): Promise<void> => {
    if (!selectedCharacterId) {
      setHasRun(true)
      setResult(null)
      setErrorMessage('请先选择一个角色。')
      return
    }

    if (!debugRetrieve) {
      setHasRun(true)
      setResult(null)
      setErrorMessage('当前环境未暴露 debugRetrieve 接口，请确认正在使用开发环境构建。')
      return
    }

    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      setHasRun(true)
      setResult(null)
      setErrorMessage('请输入一段调试 query。')
      return
    }

    try {
      setHasRun(true)
      setIsLoading(true)
      setErrorMessage('')
      trackUiEvent('memory-debug-retrieve', 'Developer ran a memory debug retrieval query', {
        scope,
        characterId: selectedCharacterId,
        sessionId: selectedSessionId,
        queryLength: trimmedQuery.length
      })

      const nextResult = await debugRetrieve({
        query: trimmedQuery,
        scope,
        characterId: selectedCharacterId,
        sessionId: selectedSessionId
      })

      setResult(nextResult)
    } catch (error) {
      console.error('Failed to run debug retrieval', error)
      setResult(null)
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * @description 清空调试输入与上一次检索结果。
   */
  const handleClear = (): void => {
    setQuery('')
    setResult(null)
    setErrorMessage('')
    setHasRun(false)
  }

  return (
    <div className="h-full overflow-y-auto px-4">
      <div className="flex flex-col gap-2 pb-6">
        <SectionCard title="记忆调试">
          <CharacterSessionSelect
            characters={characters}
            sessions={sessions}
            selectedCharacterId={selectedCharacterId}
            selectedSessionId={selectedSessionId}
            onCharacterChange={(characterId) => {
              setSelectedCharacterId(characterId)
              setSelectedSessionId(getLatestSessionIdForCharacter(sessions, characterId))
              setResult(null)
              setErrorMessage('')
              setHasRun(false)
            }}
            onSessionChange={(sessionId) => {
              setSelectedSessionId(sessionId)
              setResult(null)
              setErrorMessage('')
              setHasRun(false)
            }}
            allowEmptySession
            sessionPlaceholder="不使用会话"
          />

          <div className="flex flex-wrap gap-2">
            {SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScope(option.value)}
                className={cn(
                  'rounded border px-3 py-1.5 text-xs transition-colors',
                  scope === option.value
                    ? 'border-[#e8c690]/60 bg-[#e8c690]/10 text-[#f2d5a8]'
                    : 'border-white/10 bg-black/20 text-white/60 hover:bg-white/5'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入 query，用来验证当前角色 / 会话的记忆检索结果。"
              className="min-h-32 resize-y rounded border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white/90 placeholder:text-white/30"
            />

            <div className="absolute right-2 bottom-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleRun()}
                disabled={isLoading || !canRun}
                className="rounded border border-[#e8c690]/50 bg-[#e8c690]/10 px-4 py-2 text-sm text-[#f2d5a8] transition-colors hover:bg-[#e8c690]/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? '检索中...' : '执行检索'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                className="rounded border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空
              </button>
            </div>
          </div>
        </SectionCard>

        {errorMessage && (
          <div className="rounded border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
            记忆调试失败：{errorMessage}
          </div>
        )}

        {!hasRun && <ResultEmptyState />}

        {result && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 rounded border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/60">
              <span className="rounded border border-white/10 bg-white/5 px-2 py-1">
                {formatScopeLabel(result.scope)}
              </span>
              <span className="rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-[#f2d5a8]">
                总命中 {result.results.length}
              </span>
              <span className="break-all">Query：{result.query || '(empty)'}</span>
            </div>

            {result.results.length === 0 ? (
              <div className="rounded border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white/55">
                本次查询没有命中结果。
              </div>
            ) : (
              <div className="space-y-2">
                {result.results.map((hit) => (
                  <DebugHitItem key={hit.id} hit={hit} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
