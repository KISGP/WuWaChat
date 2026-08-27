import { useMemo, useState, type ReactElement } from 'react'
import { Braces } from 'lucide-react'
import type { ConversationSession } from '@shared/chat'
import { DiagnosticControls } from './DiagnosticControls'
import { DiagnosticDetails } from './DiagnosticDetails'
import { DiagnosticSummary } from './DiagnosticSummary'
import { DiagnosticTimeline } from './DiagnosticTimeline'
import { getDiagnosticStats } from '../lib/diagnostic-stats'
import { getRawEventValue } from '../lib/formatters'
import { useAgentDiagnosticsStore } from '@renderer/features/diagnostics/store/diagnostics'
import { useCharacterRegistryStore } from '@renderer/store/character-registry'
import { useSessionStore } from '@renderer/store/session'
import { selectActiveProfile, useSettingsStore } from '@renderer/store/profiles'

import 'react-json-view-lite/dist/index.css'

/**
 * @description 查找角色的最近会话。
 * @param sessions 当前全部会话。
 * @param characterId 角色标识。
 * @returns 最近会话标识。
 */
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
 * @description 渲染开发环境的单次 Agent 原始消息诊断工作台。
 * @returns 诊断页面。
 */
export default function AgentDiagnosticsTab(): ReactElement {
  const activateChar = useCharacterRegistryStore((state) => state.activateChar)
  const characters = useCharacterRegistryStore((state) => state.registry.local)
  const currentSessionId = useSessionStore((state) => state.currentSessionId)
  const sessions = useSessionStore((state) => state.sessions)
  const activeProfile = useSettingsStore(selectActiveProfile)
  const snapshot = useAgentDiagnosticsStore((state) => state.snapshot)
  const startRun = useAgentDiagnosticsStore((state) => state.startRun)
  const abortRun = useAgentDiagnosticsStore((state) => state.abortRun)
  const clear = useAgentDiagnosticsStore((state) => state.clear)
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

  /**
   * @description 复制诊断详情到系统剪贴板，并在短暂反馈后恢复按钮状态。
   * @param value 要复制的文本。
   * @param key 复制项标识。
   */
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
