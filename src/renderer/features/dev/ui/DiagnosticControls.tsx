import { CircleStop, Play } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ConversationSession } from '@shared/chat'
import { CharacterSessionSelect } from './CharacterSessionSelect'
import { Switch } from '@renderer/common/components/switch'
import { Textarea } from '@renderer/common/components/textarea'

type DiagnosticControlsProps = {
  characters: Char[]
  sessions: ConversationSession[]
  characterId: string | null
  sessionId: string | null
  message: string
  toolsEnabled: boolean
  isRunning: boolean | undefined
  canRun: boolean
  onCharacterChange: (characterId: string) => void
  onSessionChange: (sessionId: string | null) => void
  onMessageChange: (message: string) => void
  onToolsEnabledChange: (enabled: boolean) => void
  onRun: () => void
  onAbort: () => void
}

/**
 * @description Renders Agent diagnostic context, input, tool toggle, and run controls.
 * @param props Diagnostic input state and action callbacks.
 * @returns Diagnostic control panel.
 */
export function DiagnosticControls({
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
}: DiagnosticControlsProps): ReactElement {
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
            id="agent-diagnostics-tools"
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
