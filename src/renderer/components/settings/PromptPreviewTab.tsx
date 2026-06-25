import { useMemo, useState, type ReactElement } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ChatPromptPreviewMessage, ChatPromptPreviewResult } from '@shared/chat'
import { CharacterSessionSelect } from '@renderer/components/settings/CharacterSessionSelect'
import { SectionCard } from '@renderer/components/settings/section'
import { Textarea } from '@renderer/components/ui/textarea'
import { trackUiEvent } from '@renderer/logging'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { selectSessionById, useSessionStore } from '@renderer/stores/sessionStore'
import { selectActiveProfile, useSettingsStore } from '@renderer/stores/settingsStore'

/**
 * @description 将消息角色转换为界面标签。
 * @param role 消息角色。
 * @returns 展示标签。
 */
function formatMessageRoleLabel(role: ChatPromptPreviewMessage['role']): string {
  if (role === 'system') {
    return 'System'
  }

  return role === 'assistant' ? 'Assistant' : 'User'
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
 * @description 根据主页面当前角色和会话，计算 Prompt 页首次挂载时的本地选择。
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
  const characterId = activeCharacter?.id ?? null
  const sessionId =
    currentSession && currentSession.characterId === characterId ? currentSession.id : null

  return {
    characterId,
    sessionId
  }
}

function PreviewMessageList({ messages }: { messages: ChatPromptPreviewMessage[] }): ReactElement {
  return (
    <div>
      {messages.map((message, index) => (
        <article
          key={`${message.role}-${index}`}
          className="relative rounded border border-white/10 bg-black/30 px-4 py-3"
        >
          <span className="absolute left-2 rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-xs text-[#f2d5a8]">
            {formatMessageRoleLabel(message.role)}
          </span>

          <pre className="ml-18 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-white/85">
            {message.content.trim() || '(empty)'}
          </pre>
        </article>
      ))}
    </div>
  )
}

function ResultEmptyState(): ReactElement {
  return (
    <div className="rounded border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm leading-6 text-white/45">
      输入一段模拟用户消息后点击“生成预览”，页面会展示角色
      prompt、检索命中和最终发送给模型的消息结构。
    </div>
  )
}

export default function PromptPreviewTab(): ReactElement {
  const { activateChar, characters } = useCharacterStore(
    useShallow((state) => ({
      activateChar: state.activateChar,
      characters: state.characters
    }))
  )
  const activeProfile = useSettingsStore(selectActiveProfile)
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
  const [result, setResult] = useState<ChatPromptPreviewResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)

  const previewModelInput = window.ai.previewModelInput
  const hasPreviewApi = typeof previewModelInput === 'function'
  const canPreview = Boolean(selectedCharacterId && query.trim() && hasPreviewApi)

  /**
   * @description 触发一次只读的 prompt 预览请求。
   * @remarks 不会发送聊天请求，也不会写入 session 或 run 事件。
   */
  const handleGenerate = async (): Promise<void> => {
    if (!selectedCharacterId) {
      setHasRun(true)
      setResult(null)
      setErrorMessage('请先选择一个角色。')
      return
    }

    if (!previewModelInput) {
      setHasRun(true)
      setResult(null)
      setErrorMessage('当前环境未暴露 Prompt 预览接口，请确认正在使用开发环境。')
      return
    }

    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      setHasRun(true)
      setResult(null)
      setErrorMessage('请输入一段模拟用户消息。')
      return
    }

    try {
      setHasRun(true)
      setIsLoading(true)
      setErrorMessage('')
      trackUiEvent('chat-prompt-preview', 'Developer generated a chat prompt preview', {
        characterId: selectedCharacterId,
        sessionId: selectedSessionId,
        profileId: activeProfile.id,
        queryLength: trimmedQuery.length
      })

      const nextResult = await previewModelInput({
        characterId: selectedCharacterId,
        sessionId: selectedSessionId,
        userMessage: trimmedQuery,
        profileId: activeProfile.id
      })

      setResult(nextResult)
    } catch (error) {
      console.error('Failed to build prompt preview', error)
      setResult(null)
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * @description 清空模拟输入与上一次预览结果。
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
        <SectionCard title="Prompt 预览">
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

          <div className="relative">
            <Textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入一段模拟用户消息，用来预览本次请求会携带的提示词。"
              className="min-h-32 resize-y rounded border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white/90 placeholder:text-white/30"
            />

            <div className="absolute right-2 bottom-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isLoading || !canPreview}
                className="rounded border border-[#e8c690]/50 bg-[#e8c690]/10 px-4 py-2 text-sm text-[#f2d5a8] transition-colors hover:bg-[#e8c690]/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? '生成中...' : '生成预览'}
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
            Prompt 预览失败：{errorMessage}
          </div>
        )}
        {!hasRun && <ResultEmptyState />}

        {result && <PreviewMessageList messages={result.messages} />}
      </div>
    </div>
  )
}
