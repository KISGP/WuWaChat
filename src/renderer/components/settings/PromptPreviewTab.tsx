import { useMemo, useState, type ReactElement } from 'react'
import type { ChatPromptPreviewResult, ConversationSession } from '@shared/chat'
import { CharacterSessionSelect } from '@renderer/components/settings/CharacterSessionSelect'
import { SectionCard } from '@renderer/components/settings/section'
import { Textarea } from '@renderer/components/ui/textarea'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useSessionStore } from '@renderer/stores/sessionStore'
import { selectActiveProfile, useSettingsStore } from '@renderer/stores/settingsStore'

/**
 * @description 查找角色的最近会话，供切换角色后默认选择。
 * @param sessions 当前全部会话。
 * @param characterId 角色标识。
 * @returns 最近会话标识；不存在时返回 `null`。
 */
function getLatestSessionIdForCharacter(
  sessions: ConversationSession[],
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
 * @description 渲染开发环境的 Agent 模型输入预览。
 * @returns Prompt 与可用工具预览页面。
 */
export default function PromptPreviewTab(): ReactElement {
  const activateChar = useCharacterStore((state) => state.activateChar)
  const characters = useCharacterStore((state) => state.characters)
  const currentSessionId = useSessionStore((state) => state.currentSessionId)
  const sessions = useSessionStore((state) => state.sessions)
  const activeProfile = useSettingsStore(selectActiveProfile)
  const currentSession = sessions.find((session) => session.id === currentSessionId) || null
  const [characterId, setCharacterId] = useState<string | null>(activateChar?.id || null)
  const [sessionId, setSessionId] = useState<string | null>(
    currentSession && currentSession.characterId === activateChar?.id ? currentSession.id : null
  )
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<ChatPromptPreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const enabled = Boolean(characterId && message.trim())
  const displayMessages = useMemo(
    () => result?.messages.map((item) => `[${item.role}]\n${item.content}`).join('\n\n') || '',
    [result]
  )

  /**
   * @description 生成不执行工具的 Agent 输入预览。
   */
  async function generatePreview(): Promise<void> {
    if (!characterId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      setResult(
        await window.ai.previewModelInput({
          characterId,
          sessionId,
          userMessage: message.trim(),
          profileId: activeProfile.id
        })
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto h-full overflow-y-auto px-4 pb-4">
      <SectionCard title="Agent 输入预览">
        <div className="space-y-3 px-4 pb-4">
          <CharacterSessionSelect
            characters={characters}
            sessions={sessions}
            selectedCharacterId={characterId}
            selectedSessionId={sessionId}
            onCharacterChange={(nextCharacterId) => {
              setCharacterId(nextCharacterId)
              setSessionId(getLatestSessionIdForCharacter(sessions, nextCharacterId))
              setResult(null)
            }}
            onSessionChange={setSessionId}
            allowEmptySession
            sessionPlaceholder="不使用会话"
          />
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} />
          <button
            type="button"
            disabled={!enabled || loading}
            onClick={() => void generatePreview()}
            className="rounded border border-[#e8c690]/50 px-3 py-2 text-sm text-[#f2d5a8] disabled:opacity-50"
          >
            {loading ? '生成中...' : '生成预览'}
          </button>
          {error && <p className="text-xs text-red-200">预览失败：{error}</p>}
          {result && (
            <>
              <p className="text-sm text-white/75">可用工具：{result.agentTools.join('、')}</p>
              <pre className="text-xs leading-6 whitespace-pre-wrap text-white/75">
                {displayMessages}
              </pre>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
