import { useMemo, useState, type ReactElement } from 'react'
import { Bot, Braces, Check, CircleStop, Copy, Eraser, Play, Wrench } from 'lucide-react'
import { JsonView, darkStyles } from 'react-json-view-lite'
import 'react-json-view-lite/dist/index.css'
import type { ChatDiagnosticRunEvent, ChatTokenUsage, ConversationSession } from '@shared/chat'
import { CharacterSessionSelect } from '@renderer/components/settings/CharacterSessionSelect'
import { Switch } from '@renderer/components/ui/switch'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  type PromptDiagnosticSnapshot,
  usePromptDiagnosticStore
} from '@renderer/stores/promptDiagnosticStore'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useSessionStore } from '@renderer/stores/sessionStore'
import { selectActiveProfile, useSettingsStore } from '@renderer/stores/settingsStore'

/** @description 查找角色的最近会话。
 * @param sessions 当前全部会话。
 * @param characterId 角色标识。
 * @returns 最近会话标识。
 * */
function getLatestSessionIdForCharacter(
  sessions: ConversationSession[],
  characterId: string | null
): string | null {
  if (!characterId) return null

  const latestSession = sessions.reduce<ConversationSession | null>((latest, session) => {
    if (session.characterId !== characterId) return latest
    if (!latest || session.updatedAt.localeCompare(latest.updatedAt) > 0) return session
    return latest
  }, null)

  return latestSession?.id || null
}

/**
 * @description 将未知结构格式化为可复制的 JSON。
 * @param value 待格式化的数据。
 * @returns JSON 文本。
 * */
function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch (cause) {
    return 'Unable to serialize value: ' + (cause instanceof Error ? cause.message : String(cause))
  }
}

/**
 * @description 格式化诊断运行耗时。
 * @param durationMs 毫秒数。
 * @returns 可读时长。
 * */
function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? durationMs + ' ms' : (durationMs / 1000).toFixed(2) + ' s'
}

/**
 * @description 格式化 token 数量。
 * @param count token 数量。
 * @returns 带千位分隔符的数量。
 * */
function formatTokenCount(count: number): string {
  return count.toLocaleString('en-US')
}

/**
 * @description 控制 JSON 预览初始展开层级，保留根节点和第一层字段可见。
 * @param level 当前层级。
 * @returns 是否展开。
 */
function shouldExpandJsonNode(level: number): boolean {
  return level < 2
}

const jsonPreviewStyles = {
  ...darkStyles,
  container: 'font-mono text-xs leading-6 text-white/75',
  basicChildStyle: 'px-0.5',
  childFieldsContainer: 'ml-4 border-l border-white/10 pl-3',
  label: 'mr-1 font-medium text-[#e8c690]',
  clickableLabel: 'mr-1 cursor-pointer font-medium text-[#e8c690]',
  nullValue: 'text-white/40',
  undefinedValue: 'text-white/40',
  stringValue: 'text-emerald-200',
  booleanValue: 'text-sky-200',
  numberValue: 'text-violet-200',
  otherValue: 'text-white/65',
  punctuation: 'mr-1 font-semibold text-white/45',
  collapsedContent: 'mr-1 cursor-pointer text-white/35',
  quotesForFieldNames: true,
  stringifyStringValues: true
}

/**
 * @description 返回事件的时间线标题。
 * @param event 诊断事件。
 * @returns 标题文本。
 * */
function getEventLabel(event: ChatDiagnosticRunEvent): string {
  if (event.type === 'llm-request')
    return (
      (event.phase === 'tool-routing' ? '工具路由' : '最终回复') + ' · 模型请求 #' + event.sequence
    )
  if (event.type === 'llm-response')
    return (
      (event.phase === 'tool-routing' ? '工具路由' : '最终回复') + ' · 模型响应 #' + event.sequence
    )
  if (event.type === 'tool-result')
    return '工具返回 · ' + (event.message.name || '未知工具') + ' · 第 ' + event.round + ' 轮'
  if (event.type === 'completed') return '运行完成'
  if (event.type === 'error') return '运行失败'
  if (event.type === 'aborted') return '运行已停止'
  return '运行开始'
}

/**
 * @description 提取事件对应的 provider body 或响应数据。
 * @param event 诊断事件。
 * @returns 诊断数据。
 * */
function getRawEventValue(event: ChatDiagnosticRunEvent): unknown {
  if (event.type === 'llm-request') return event.body
  if (event.type === 'llm-response') {
    return {
      content: event.content,
      tool_calls: event.tool_calls,
      ...(event.usage ? { usage: event.usage } : {})
    }
  }
  if (event.type === 'tool-result') return event.message
  if (event.type === 'completed') return event.assistantDraft
  return event
}

type DiagnosticStats = {
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
 * */
function getDiagnosticStats(snapshot: PromptDiagnosticSnapshot): DiagnosticStats {
  type DiagnosticStatsAccumulator = DiagnosticStats & {
    completedTokenUsage?: ChatTokenUsage
  }

  const stats = snapshot.events.reduce<DiagnosticStatsAccumulator>(
    (current, event) => {
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

/**
 * @description
 * 渲染复制按钮。
 * @param props 复制参数。
 * @returns 复制按钮。
 * */
function CopyButton({
  value,
  copiedKey,
  copyKey,
  onCopy
}: {
  value: string
  copiedKey: string | null
  copyKey: string
  onCopy: (value: string, key: string) => void
}): ReactElement {
  const copied = copiedKey === copyKey
  return (
    <button
      type="button"
      onClick={() => onCopy(value, copyKey)}
      title={copied ? '已复制' : '复制'}
      aria-label={copied ? '已复制' : '复制'}
      className="flex size-7 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/8 hover:text-white"
    >
      {copied ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}
    </button>
  )
}

/**
 * @description 渲染左侧时间线事件。
 * @param props 事件和选择状态。
 * @returns 时间线项。
 * */
function TimelineEvent({
  event,
  selected,
  onSelect
}: {
  event: ChatDiagnosticRunEvent
  selected: boolean
  onSelect: () => void
}): ReactElement {
  const modelEvent = event.type === 'llm-request' || event.type === 'llm-response'
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'flex w-full items-center gap-2 rounded border px-3 py-2 text-left transition-colors ' +
        (selected
          ? 'border-[#e8c690]/45 bg-[#e8c690]/10'
          : 'border-white/8 bg-black/15 hover:bg-white/5')
      }
    >
      <span className={modelEvent ? 'text-sky-300' : 'text-violet-200'}>
        {modelEvent ? <Bot className="size-4" /> : <Wrench className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/78">
        {getEventLabel(event)}
      </span>
    </button>
  )
}

function DiagnosticControls({
  characters,
  sessions,
  characterId,
  sessionId,
  message,
  toolsEnabled,
  isRunning,
  canRun,
  onCharacterChange,
  onSessionChange,
  onMessageChange,
  onToolsEnabledChange,
  onRun,
  onAbort
}: {
  characters: Char[]
  sessions: ConversationSession[]
  characterId: string | null
  sessionId: string | null
  message: string
  toolsEnabled: boolean
  isRunning: boolean
  canRun: boolean
  onCharacterChange: (characterId: string) => void
  onSessionChange: (sessionId: string | null) => void
  onMessageChange: (message: string) => void
  onToolsEnabledChange: (enabled: boolean) => void
  onRun: () => void
  onAbort: () => void
}): ReactElement {
  return (
    <section className="rounded border border-white/10 bg-black/25 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.18em] text-white/35 uppercase">
            上下文
          </p>
          <CharacterSessionSelect
            characters={characters}
            sessions={sessions}
            selectedCharacterId={characterId}
            selectedSessionId={sessionId}
            onCharacterChange={onCharacterChange}
            onSessionChange={onSessionChange}
            allowEmptySession
            sessionPlaceholder="不使用会话"
          />
        </div>
        <div className="min-w-72 flex-[1.6]">
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.18em] text-white/35 uppercase">
            单次输入
          </p>
          <Textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="输入消息并执行一次隔离的 Agent 诊断..."
            className="min-h-10 resize-none rounded border-white/15 bg-black/35 py-2 text-sm text-white placeholder:text-white/25"
          />
        </div>
        <label className="flex h-10 shrink-0 items-center gap-2.5 rounded border border-white/10 bg-black/20 px-3 text-xs text-white/65">
          <Switch
            id="prompt-diagnostic-tools"
            checked={toolsEnabled}
            disabled={isRunning}
            onCheckedChange={onToolsEnabledChange}
            className="data-checked:bg-[#e8c690] data-unchecked:bg-white/20"
          />
          启用工具
        </label>
        {isRunning ? (
          <button
            type="button"
            onClick={onAbort}
            className="flex h-10 items-center gap-2 rounded bg-red-400/15 px-4 text-sm text-red-100"
          >
            <CircleStop className="size-4" />
            停止
          </button>
        ) : (
          <button
            type="button"
            disabled={!canRun}
            onClick={onRun}
            className="flex h-10 items-center gap-2 rounded bg-[#e8c690] px-4 text-sm font-medium text-[#251d13] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play className="size-4" />
            执行诊断
          </button>
        )}
      </div>
    </section>
  )
}

function DiagnosticSummary({
  snapshot,
  stats,
  activeProfileName,
  isRunning,
  onClear
}: {
  snapshot: PromptDiagnosticSnapshot
  stats: DiagnosticStats
  activeProfileName: string
  isRunning: boolean
  onClear: () => void
}): ReactElement {
  return (
    <section className="flex flex-wrap items-center gap-2 rounded border border-white/8 bg-black/20 px-3 py-2">
      <span className="text-xs text-white/35">当前模型：{activeProfileName}</span>
      <span className="text-xs text-white/35">模型请求 {stats.modelCalls}</span>
      <span className="text-xs text-white/35">工具结果 {stats.toolResults}</span>
      {stats.tokenUsage ? (
        <>
          <span className="text-xs text-white/35">
            输入 {formatTokenCount(stats.tokenUsage.inputTokens)}
          </span>
          <span className="text-xs text-white/35">
            输出 {formatTokenCount(stats.tokenUsage.outputTokens)}
          </span>
          <span className="text-xs text-white/45">
            总计 {formatTokenCount(stats.tokenUsage.totalTokens)}
          </span>
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

function DiagnosticTimeline({
  events,
  selectedIndex,
  onSelect
}: {
  events: ChatDiagnosticRunEvent[]
  selectedIndex: number
  onSelect: (index: number) => void
}): ReactElement {
  return (
    <div className="min-h-96 overflow-y-auto rounded border border-white/10 bg-[#0d0d0d] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-white/65">
        <Bot className="size-4 text-[#e8c690]" />
        操作
      </div>
      <div className="space-y-1.5">
        {events.map((event, index) => (
          <TimelineEvent
            key={event.type + '-' + index}
            event={event}
            selected={selectedIndex === index}
            onSelect={() => onSelect(index)}
          />
        ))}
      </div>
    </div>
  )
}

function DiagnosticDetails({
  selectedEvent,
  rawValue,
  previewData,
  selectedIndex,
  copiedKey,
  onCopy
}: {
  selectedEvent: ChatDiagnosticRunEvent | null
  rawValue: unknown
  previewData: unknown
  selectedIndex: number
  copiedKey: string | null
  onCopy: (value: string, key: string) => void
}): ReactElement {
  return (
    <div className="flex min-h-96 min-w-0 flex-col overflow-hidden rounded border border-white/10 bg-[#0d0d0d]">
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
        <Braces className="size-4 text-[#e8c690]" />
        <span className="ml-auto text-[11px] text-white/35">
          {selectedEvent ? getEventLabel(selectedEvent) : '请选择时间线事件'}
        </span>
        {rawValue !== null && (
          <CopyButton
            value={formatJson(rawValue)}
            copiedKey={copiedKey}
            copyKey={'event-' + selectedIndex}
            onCopy={onCopy}
          />
        )}
      </div>
      <div className="json-preview-content min-h-0 flex-1 overflow-auto p-3">
        {selectedEvent?.type === 'completed' ? (
          <div className="text-sm leading-7 whitespace-pre-wrap text-white/85">
            {selectedEvent.assistantDraft || '模型未返回文本结果。'}
          </div>
        ) : rawValue !== null ? (
          <JsonView
            data={previewData as object}
            style={jsonPreviewStyles}
            shouldExpandNode={shouldExpandJsonNode}
            clickToExpandNode
          />
        ) : (
          <p className="text-sm text-white/35">等待诊断事件...</p>
        )}
      </div>
    </div>
  )
}

/**
 * @description 渲染开发环境的单次 Agent 原始消息诊断工作台。
 * @returns 诊断页面。
 * */
export default function PromptPreviewTab(): ReactElement {
  const activateChar = useCharacterStore((state) => state.activateChar)
  const characters = useCharacterStore((state) => state.characters)
  const currentSessionId = useSessionStore((state) => state.currentSessionId)
  const sessions = useSessionStore((state) => state.sessions)
  const activeProfile = useSettingsStore(selectActiveProfile)
  const snapshot = usePromptDiagnosticStore((state) => state.snapshot)
  const startRun = usePromptDiagnosticStore((state) => state.startRun)
  const abortRun = usePromptDiagnosticStore((state) => state.abortRun)
  const clear = usePromptDiagnosticStore((state) => state.clear)
  const currentSession = sessions.find((session) => session.id === currentSessionId) || null
  const [characterId, setCharacterId] = useState<string | null>(activateChar?.id || null)
  const [sessionId, setSessionId] = useState<string | null>(
    currentSession && currentSession.characterId === activateChar?.id ? currentSession.id : null
  )
  const [message, setMessage] = useState('')
  const [toolsEnabled, setToolsEnabled] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [followCompletion, setFollowCompletion] = useState(true)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const isRunning = snapshot?.status === 'running'
  const canRun = Boolean(characterId && message.trim() && !isRunning)
  const diagnosticView = useMemo(() => {
    if (!snapshot) return null

    const completedIndex =
      snapshot.status === 'completed'
        ? snapshot.events.findIndex((event) => event.type === 'completed')
        : -1
    const effectiveSelectedIndex =
      followCompletion && completedIndex >= 0 ? completedIndex : selectedIndex
    const selectedEvent = snapshot.events[effectiveSelectedIndex] || null
    const rawValue = selectedEvent ? getRawEventValue(selectedEvent) : null

    return {
      stats: getDiagnosticStats(snapshot),
      selectedEvent,
      rawValue,
      previewData: rawValue && typeof rawValue === 'object' ? rawValue : { value: rawValue },
      selectedIndex: effectiveSelectedIndex
    }
  }, [followCompletion, selectedIndex, snapshot])

  /** @description 启动隔离诊断运行。 */
  async function handleRun(): Promise<void> {
    const userMessage = message.trim()
    if (!characterId || !userMessage) return
    setCopiedKey(null)
    setSelectedIndex(0)
    setFollowCompletion(true)
    await startRun({
      characterId,
      sessionId,
      userMessage,
      profileId: activeProfile.id,
      toolsEnabled
    })
  }

  /** @description 复制原始 JSON 到剪贴板。 @param value 要复制的文本。 @param key 复制项标识。 */
  function handleCopy(value: string, key: string): void {
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopiedKey(key)
        window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600)
      })
      .catch((cause: unknown) => {
        console.error('Failed to copy diagnostic content:', cause)
      })
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-4">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-3">
        <DiagnosticControls
          characters={characters}
          sessions={sessions}
          characterId={characterId}
          sessionId={sessionId}
          message={message}
          toolsEnabled={toolsEnabled}
          isRunning={isRunning}
          canRun={canRun}
          onCharacterChange={(next) => {
            setCharacterId(next)
            setSessionId(getLatestSessionIdForCharacter(sessions, next))
          }}
          onSessionChange={setSessionId}
          onMessageChange={setMessage}
          onToolsEnabledChange={setToolsEnabled}
          onRun={() => void handleRun()}
          onAbort={() => void abortRun()}
        />
        {snapshot && diagnosticView ? (
          <>
            <DiagnosticSummary
              snapshot={snapshot}
              stats={diagnosticView.stats}
              activeProfileName={activeProfile.name}
              isRunning={isRunning}
              onClear={clear}
            />
            <section className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.6fr)]">
              <DiagnosticTimeline
                events={snapshot.events}
                selectedIndex={diagnosticView.selectedIndex}
                onSelect={(index) => {
                  setFollowCompletion(false)
                  setSelectedIndex(index)
                }}
              />
              <DiagnosticDetails
                selectedEvent={diagnosticView.selectedEvent}
                rawValue={diagnosticView.rawValue}
                previewData={diagnosticView.previewData}
                selectedIndex={diagnosticView.selectedIndex}
                copiedKey={copiedKey}
                onCopy={handleCopy}
              />
            </section>
          </>
        ) : (
          <section className="flex min-h-96 flex-1 flex-col items-center justify-center rounded border border-dashed border-white/10 bg-black/15 text-center">
            <Braces className="mb-3 size-8 text-white/20" />
            <p className="text-sm text-white/45">等待执行一次 Agent 诊断</p>
            <p className="mt-1 text-xs text-white/25">
              结果仅保存在当前应用运行期间，不会写入真实会话。
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
