import { useEffect, useState, type ReactElement } from 'react'
import { JsonView } from 'react-json-view-lite'
import type { ChatDebugRunRecord, ChatDebugRunSummary, ConversationSession } from '@shared/chat'
import { listDebugRuns, onRunEvent, readDebugRun } from '@renderer/services/ai'
import { useCharacterRegistryStore } from '@renderer/store/character-registry'
import { useSessionStore } from '@renderer/store/session'
import { CharacterSessionSelect } from './CharacterSessionSelect'
import { shouldExpandJsonNode } from '../lib/formatters'
import { jsonPreviewStyles } from './json-preview'

import 'react-json-view-lite/dist/index.css'

/**
 * @description 渲染设置页中的会话 Agent 运行记录查看器。
 * @returns 会话运行记录 Tab 内容。
 */
export default function AgentRunRecordsTab(): ReactElement {
  const characters = useCharacterRegistryStore((state) => state.registry.local)
  const sessions = useSessionStore((state) => state.sessions)
  const currentSessionId = useSessionStore((state) => state.currentSessionId)
  const currentSession = sessions.find((session) => session.id === currentSessionId) || null
  const [characterId, setCharacterId] = useState<string | null>(currentSession?.characterId || characters[0]?.id || null)
  const [sessionId, setSessionId] = useState<string | null>(currentSessionId)
  const [runs, setRuns] = useState<ChatDebugRunSummary[]>([])
  const [record, setRecord] = useState<ChatDebugRunRecord | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!characterId || !sessionId) {
      queueMicrotask(() => {
        if (!cancelled) {
          setRuns([])
          setRecord(null)
        }
      })
      return () => {
        cancelled = true
      }
    }
    const refresh = (): void => {
      void listDebugRuns({ characterId, sessionId })
        .then((nextRuns) => {
          if (!cancelled) setRuns(nextRuns)
        })
        .catch((cause: unknown) => {
          console.error('Failed to load Agent run records:', cause)
          if (!cancelled) setRuns([])
        })
    }
    refresh()
    const unsubscribe = onRunEvent((event) => {
      if (
        'sessionId' in event &&
        event.sessionId === sessionId &&
        (event.type === 'run-finished' || event.type === 'run-error' || event.type === 'run-aborted')
      ) {
        refresh()
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [characterId, sessionId])

  async function handleSelect(run: ChatDebugRunSummary): Promise<void> {
    if (!characterId || !sessionId) return
    try {
      setRecord(await readDebugRun({ characterId, sessionId, requestId: run.requestId }))
    } catch (cause) {
      console.error('Failed to read Agent run record:', cause)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-4">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-3">
        <section className="rounded border border-white/10 bg-black/25 p-3">
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.18em] text-white/35 uppercase">会话</p>
          <CharacterSessionSelect
            characters={characters}
            sessions={sessions as ConversationSession[]}
            selectedCharacterId={characterId}
            selectedSessionId={sessionId}
            onCharacterChange={(next) => {
              setCharacterId(next)
              setSessionId(sessions.find((session) => session.characterId === next)?.id || null)
              setRecord(null)
            }}
            onSessionChange={(next) => {
              setSessionId(next)
              setRecord(null)
            }}
            allowEmptySession
            sessionPlaceholder="选择会话"
          />
        </section>
        <section className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(14rem,0.55fr)_minmax(0,1.45fr)]">
          <div className="rounded border border-white/10 bg-black/25 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold tracking-[0.18em] text-white/35 uppercase">运行记录</p>
              <span className="text-xs text-white/35">{runs.length}</span>
            </div>
            <div className="space-y-1 overflow-y-auto">
              {runs.map((run) => (
                <button
                  key={run.requestId}
                  type="button"
                  onClick={() => void handleSelect(run)}
                  className="w-full rounded border border-white/10 bg-black/20 px-2.5 py-2 text-left text-xs text-white/70 hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white/80">{run.status}</span>
                    <span className="text-white/35">{run.eventCount} events</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-white/35">{run.requestId}</div>
                  <div className="mt-1 text-[10px] text-white/35">{run.startedAt}</div>
                </button>
              ))}
              {runs.length === 0 && <p className="text-xs text-white/30">当前会话暂无运行记录。</p>}
            </div>
          </div>
          <div className="overflow-auto rounded border border-white/10 bg-black/35 p-3">
            {record ? (
              <JsonView
                data={record as unknown as object}
                style={jsonPreviewStyles}
                shouldExpandNode={shouldExpandJsonNode}
                clickToExpandNode
              />
            ) : (
              <p className="text-xs text-white/35">选择一条运行记录查看完整原始 JSON。</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
