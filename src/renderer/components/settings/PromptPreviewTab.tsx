import { useMemo, useState, type ReactElement } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type {
  ChatPromptPreviewHit,
  ChatPromptPreviewMessage,
  ChatPromptPreviewResult
} from '@shared/chat'
import { CharacterSessionSelect } from '@renderer/components/settings/CharacterSessionSelect'
import { SectionCard } from '@renderer/components/settings/section'
import { ButtonGroup } from '@renderer/components/ui/button-group'
import { Button } from '@renderer/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { Textarea } from '@renderer/components/ui/textarea'
import { trackUiEvent } from '@renderer/logging'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { selectSessionById, useSessionStore } from '@renderer/stores/sessionStore'
import { selectActiveProfile, useSettingsStore } from '@renderer/stores/settingsStore'
import { cn } from '@renderer/utils'

type SystemSectionId = 'prompt' | 'story' | 'glossary'
type PromptPreviewViewMode = 'preview' | 'raw'

/**
 * @description 将消息角色转换为界面标签。
 * @param role 消息角色。
 * @returns 展示标签。
 */
function formatMessageRoleLabel(role: ChatPromptPreviewMessage['role'], title?: string): string {
  if (role === 'system') {
    return 'System'
  }

  if (role === 'assistant') {
    return title ? title : 'Assistant'
  }

  return 'User'
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

/**
 * @description 返回 system 预览折叠区块的默认展开状态。
 * @returns 各区块是否展开的初始值。
 */
function createInitialOpenSections(): Record<SystemSectionId, boolean> {
  return {
    prompt: true,
    story: true,
    glossary: true
  }
}

/**
 * @description 将检索命中格式化为 system 展示文本。
 * @param hit 单条检索命中。
 * @returns 带来源标签的预览文本。
 */
function formatRetrievalHit(hit: ChatPromptPreviewHit): string {
  const scopeLabel =
    hit.scope === 'glossary' ? 'Glossary' : hit.scope === 'story' ? 'Story' : 'Chat Memory'
  const locationLabel = hit.term ? ` (${hit.term})` : hit.sourcePath ? ` (${hit.sourcePath})` : ''
  return `[${scopeLabel}${locationLabel}]\n${hit.text}`
}

/**
 * @description 根据预览结果提取 system 区域中 story 区块的展示文本。
 * @param result 当前 prompt 预览结果。
 * @returns story 区块文本；为空时返回 `(empty)`。
 */
function buildStoryPreviewText(result: ChatPromptPreviewResult): string {
  return result.storyContextHits.map(formatRetrievalHit).join('\n\n').trim() || '(empty)'
}

/**
 * @description 根据预览结果提取 system 区域中 glossary 区块的展示文本。
 * @param result 当前 prompt 预览结果。
 * @returns glossary 区块文本；为空时返回 `(empty)`。
 */
function buildGlossaryPreviewText(result: ChatPromptPreviewResult): string {
  return result.glossaryContextHits.map(formatRetrievalHit).join('\n\n').trim() || '(empty)'
}

/**
 * @description 将最终发送给模型的完整消息序列拼接为原始文本视图。
 * @param result 当前 prompt 预览结果。
 * @param assistantLabel assistant 角色的展示名。
 * @returns 带角色标题的完整原始消息文本。
 */
function buildRawPromptPreviewText(
  result: ChatPromptPreviewResult,
  assistantLabel?: string
): string {
  const blocks = result.messages.map((message) => {
    const roleLabel = formatMessageRoleLabel(message.role, assistantLabel)
    const content = message.content.trim() || '(empty)'

    return `[${roleLabel}]\n${content}`
  })

  return blocks.join('\n\n').trim() || '(empty)'
}

/**
 * @description 渲染 system 预览中的单个可折叠区块。
 * @param section 当前区块数据。
 * @param open 当前展开状态。
 * @param onOpenChange 展开状态变更回调。
 * @returns 区块节点。
 */
function SystemSectionCard({
  section,
  open,
  onOpenChange
}: {
  section: { id: SystemSectionId; title: string; content: string }
  open: boolean
  onOpenChange: (nextOpen: boolean) => void
}): ReactElement {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="rounded border border-white/10 bg-black/25">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/90">{section.title}</p>
            </div>
            {open ? (
              <ChevronDown className="size-4 shrink-0 text-white/55" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-white/55" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-white/8 px-4 py-4">
            <pre className="max-h-80 overflow-auto text-sm leading-6 wrap-break-word whitespace-pre-wrap text-white/82">
              {section.content.trim() || '(empty)'}
            </pre>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

/**
 * @description 使用结构化折叠区块渲染第一条 system 预览消息。
 * @param result 当前 prompt 预览结果。
 * @param openSections 各区块当前展开状态。
 * @param onOpenChange 展开状态变更回调。
 * @returns system 预览节点。
 */
function SystemPreviewCard({
  result,
  openSections,
  onOpenChange
}: {
  result: ChatPromptPreviewResult
  assistantLabel?: string
  openSections: Record<SystemSectionId, boolean>
  onOpenChange: (sectionId: SystemSectionId, nextOpen: boolean) => void
}): ReactElement {
  const sections = [
    {
      id: 'prompt' as const,
      title: '角色提示词',
      content: result.prompt.trim() || '(empty)'
    },
    {
      id: 'story' as const,
      title: '故事',
      content: buildStoryPreviewText(result)
    },
    {
      id: 'glossary' as const,
      title: '名词',
      content: buildGlossaryPreviewText(result)
    }
  ]

  return (
    <article className="relative rounded border border-white/10 bg-black/30 px-4 py-3">
      <span className="absolute left-2 rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-xs text-[#f2d5a8]">
        System
      </span>

      <div className="ml-18 space-y-2">
        {sections.map((section) => (
          <SystemSectionCard
            key={section.id}
            section={section}
            open={openSections[section.id]}
            onOpenChange={(nextOpen) => onOpenChange(section.id, nextOpen)}
          />
        ))}
      </div>
    </article>
  )
}

/**
 * @description 渲染 prompt 预览的完整消息列表，并对首条 system 做结构化展示。
 * @param result 当前 prompt 预览结果。
 * @param openSections system 区块展开状态。
 * @param onOpenChange system 区块展开状态变更回调。
 * @returns 消息列表节点。
 */
function PreviewMessageList({
  result,
  assistantLabel,
  openSections,
  onOpenChange
}: {
  result: ChatPromptPreviewResult
  assistantLabel?: string
  openSections: Record<SystemSectionId, boolean>
  onOpenChange: (sectionId: SystemSectionId, nextOpen: boolean) => void
}): ReactElement {
  return (
    <div className="space-y-2">
      {result.messages.map((message, index) => {
        if (index === 0 && message.role === 'system') {
          return (
            <SystemPreviewCard
              key={`${message.role}-${index}`}
              result={result}
              assistantLabel={assistantLabel}
              openSections={openSections}
              onOpenChange={onOpenChange}
            />
          )
        }

        return (
          <article
            key={`${message.role}-${index}`}
            className="relative rounded border border-white/10 bg-black/30 px-4 py-3"
          >
            <span className="absolute left-2 rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-xs text-[#f2d5a8]">
              {formatMessageRoleLabel(message.role, assistantLabel)}
            </span>

            <pre className="ml-18 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-white/85">
              {message.content.trim() || '(empty)'}
            </pre>
          </article>
        )
      })}
    </div>
  )
}

/**
 * @description 渲染 Prompt 预览的初始空状态。
 * @returns 空状态节点。
 */
function ResultEmptyState(): ReactElement {
  return (
    <div className="rounded border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm leading-6 text-white/45">
      输入一段模拟用户消息后点击“生成预览”，页面会展示角色
      prompt、检索命中和最终发送给模型的消息结构。
    </div>
  )
}

function RawPromptCard({
  result,
  assistantLabel
}: {
  result: ChatPromptPreviewResult
  assistantLabel?: string
}): ReactElement {
  return (
    <article className="rounded border border-white/10 bg-black/30 px-4 py-3">
      <pre className="text-sm leading-6 wrap-break-word whitespace-pre-wrap text-white/85">
        {buildRawPromptPreviewText(result, assistantLabel)}
      </pre>
    </article>
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
  const [openSections, setOpenSections] = useState(createInitialOpenSections)
  const [viewMode, setViewMode] = useState<PromptPreviewViewMode>('preview')

  const previewModelInput = window.ai.previewModelInput
  const hasPreviewApi = typeof previewModelInput === 'function'
  const canPreview = Boolean(selectedCharacterId && query.trim() && hasPreviewApi)
  const assistantLabel =
    characters.find((character) => character.id === selectedCharacterId)?.name ||
    activateChar?.name ||
    undefined

  /**
   * @description 切换某个 system 区块的折叠状态。
   * @param sectionId 区块 ID。
   * @param nextOpen 下一个展开状态。
   */
  const setSectionOpen = (sectionId: SystemSectionId, nextOpen: boolean): void => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: nextOpen
    }))
  }

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

      setViewMode('preview')
      setOpenSections(createInitialOpenSections())
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
    setViewMode('preview')
    setOpenSections(createInitialOpenSections())
  }

  return (
    <div className="h-full overflow-y-auto px-4">
      <div className="flex flex-col gap-2 pb-6">
        <SectionCard title="Prompt 预览">
          <SettingItem
            title="角色与会话"
            description="选择一个角色和会话，预览本次请求会携带的提示词。"
          >
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
                setViewMode('preview')
              }}
              onSessionChange={(sessionId) => {
                setSelectedSessionId(sessionId)
                setResult(null)
                setErrorMessage('')
                setHasRun(false)
                setViewMode('preview')
              }}
              allowEmptySession
              sessionPlaceholder="不使用会话"
            />
          </SettingItem>

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

        {result && (
          <>
            <div className="flex justify-end">
              <ButtonGroup>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={viewMode === 'preview'}
                  onClick={() => setViewMode('preview')}
                  className={cn(
                    'border-white/10 bg-black/20 text-white/70 hover:bg-white/5',
                    viewMode === 'preview' &&
                      'border-[#e8c690]/50 bg-[#e8c690]/10 text-[#f2d5a8] hover:bg-[#e8c690]/15'
                  )}
                >
                  预览模式
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={viewMode === 'raw'}
                  onClick={() => setViewMode('raw')}
                  className={cn(
                    'border-white/10 bg-black/20 text-white/70 hover:bg-white/5',
                    viewMode === 'raw' &&
                      'border-[#e8c690]/50 bg-[#e8c690]/10 text-[#f2d5a8] hover:bg-[#e8c690]/15'
                  )}
                >
                  原始提示词
                </Button>
              </ButtonGroup>
            </div>

            {viewMode === 'preview' ? (
              <PreviewMessageList
                result={result}
                assistantLabel={assistantLabel}
                openSections={openSections}
                onOpenChange={setSectionOpen}
              />
            ) : (
              <RawPromptCard result={result} assistantLabel={assistantLabel} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
