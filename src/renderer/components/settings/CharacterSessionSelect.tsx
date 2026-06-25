import { useCallback, useMemo, type ReactElement } from 'react'
import { ChevronDown } from 'lucide-react'
import type { CharacterSummary, ConversationSession } from '@shared/chat'
import { formatDateTime } from '@renderer/components/settings/memory/helpers'
import { cn } from '@renderer/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

type CharacterSessionSelectProps = {
  characters: CharacterSummary[]
  sessions: ConversationSession[]
  selectedCharacterId: string | null
  selectedSessionId: string | null
  onCharacterChange: (characterId: string) => void
  onSessionChange: (sessionId: string | null) => void
  allowEmptySession?: boolean
  sessionDisabled?: boolean
  sessionPlaceholder?: string
  sessionHint?: string
}

type SessionMenuItem = {
  session: ConversationSession
  preview: string
  updatedAtLabel: string
  isSelected: boolean
}

type CharacterMenuItem = {
  character: CharacterSummary
  sessions: SessionMenuItem[]
  canSelectEmptySession: boolean
  hasSelectableSession: boolean
  isSelected: boolean
}

type CharacterSessionMenuViewModel = {
  selectedCharacter: CharacterSummary | null
  selectedSession: ConversationSession | null
  triggerSessionLabel: string
  characterItems: CharacterMenuItem[]
}

type CharacterSessionMenuViewModelParams = {
  characters: CharacterSummary[]
  sessions: ConversationSession[]
  selectedCharacterId: string | null
  selectedSessionId: string | null
  allowEmptySession: boolean
  sessionDisabled: boolean
  sessionPlaceholder: string
}

const MENU_PANEL_CLASS = 'rounded border-0 bg-[#161616] text-white ring-white/10'
const MENU_ITEM_CLASS =
  'py-2 text-white/78 transition-colors focus:bg-white/8 focus:text-white focus:[&_span]:!text-white'
const MENU_SUB_TRIGGER_CLASS =
  'py-2 text-white/78 transition-colors focus:bg-white/8 focus:text-white focus:[&_span]:!text-white data-open:bg-white/8 data-open:text-white data-open:[&_span]:!text-white data-disabled:opacity-50'
const MENU_ITEM_SELECTED_CLASS = 'bg-white/10 text-white [&_span]:!text-white'
const MENU_META_CLASS =
  'block truncate text-xs leading-5 text-white/45 group-focus/dropdown-menu-item:!text-white/60 group-data-open:!text-white/60'

/**
 * @description 按角色 ID 分组会话，并将每组会话按更新时间倒序排列。
 * @param sessions 全部会话列表。
 * @returns 以角色 ID 为键的会话列表映射。
 */
function getSessionsByCharacter(
  sessions: ConversationSession[]
): Map<string, ConversationSession[]> {
  const sessionsByCharacter = new Map<string, ConversationSession[]>()

  sessions.forEach((session) => {
    const characterSessions = sessionsByCharacter.get(session.characterId) || []
    characterSessions.push(session)
    sessionsByCharacter.set(session.characterId, characterSessions)
  })

  sessionsByCharacter.forEach((characterSessions) => {
    characterSessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  })

  return sessionsByCharacter
}

/**
 * @description 提取会话最后一条用户或助手消息，用于菜单项摘要展示。
 * @param session 待展示的会话。
 * @returns 适合在下拉项中显示的会话摘要。
 */
function getSessionPreview(session: ConversationSession): string {
  const lastMessage = [...session.messages]
    .reverse()
    .find((message) => message.role === 'assistant' || message.role === 'user')

  const preview = lastMessage?.content.trim() || '暂无消息'
  return preview.length > 48 ? `${preview.slice(0, 48)}...` : preview
}

/**
 * @description 根据当前选择生成触发器中展示的会话标题。
 * @param selectedSession 当前选中的会话。
 * @param selectedCharacter 当前选中的角色。
 * @param sessionPlaceholder 空会话选择的展示文案。
 * @returns 触发器中的会话描述。
 */
function getTriggerSessionLabel(
  selectedSession: ConversationSession | null,
  selectedCharacter: CharacterSummary | null,
  sessionPlaceholder: string
): string {
  if (selectedSession) {
    return getSessionPreview(selectedSession)
  }

  return selectedCharacter ? sessionPlaceholder : '选择角色和会话'
}

/**
 * @description 生成角色会话级联菜单所需的派生数据，保证选中会话必须属于当前角色。
 * @param params 组件输入与默认化后的选择配置。
 * @returns 可直接用于渲染菜单和触发器的 view model。
 */
function getCharacterSessionMenuViewModel({
  characters,
  sessions,
  selectedCharacterId,
  selectedSessionId,
  allowEmptySession,
  sessionDisabled,
  sessionPlaceholder
}: CharacterSessionMenuViewModelParams): CharacterSessionMenuViewModel {
  const sessionsByCharacter = getSessionsByCharacter(sessions)
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) || null
  const selectedSession =
    sessions.find(
      (session) => session.id === selectedSessionId && session.characterId === selectedCharacterId
    ) || null
  const canSelectEmptySession = allowEmptySession || sessionDisabled
  const characterItems = characters.map((character) => {
    const characterSessions = sessionDisabled ? [] : sessionsByCharacter.get(character.id) || []
    const sessionsForMenu = characterSessions.map((session) => ({
      session,
      preview: getSessionPreview(session),
      updatedAtLabel: formatDateTime(session.updatedAt),
      isSelected: session.id === selectedSession?.id
    }))

    return {
      character,
      sessions: sessionsForMenu,
      canSelectEmptySession,
      hasSelectableSession: canSelectEmptySession || sessionsForMenu.length > 0,
      isSelected: character.id === selectedCharacterId
    }
  })

  return {
    selectedCharacter,
    selectedSession,
    triggerSessionLabel: getTriggerSessionLabel(
      selectedSession,
      selectedCharacter,
      sessionPlaceholder
    ),
    characterItems
  }
}

export function CharacterSessionSelect({
  characters,
  sessions,
  selectedCharacterId,
  selectedSessionId,
  onCharacterChange,
  onSessionChange,
  allowEmptySession = false,
  sessionDisabled = false,
  sessionPlaceholder = '选择会话'
}: CharacterSessionSelectProps): ReactElement {
  const { selectedCharacter, triggerSessionLabel, characterItems } = useMemo(
    () =>
      getCharacterSessionMenuViewModel({
        characters,
        sessions,
        selectedCharacterId,
        selectedSessionId,
        allowEmptySession,
        sessionDisabled,
        sessionPlaceholder
      }),
    [
      allowEmptySession,
      characters,
      selectedCharacterId,
      selectedSessionId,
      sessionDisabled,
      sessionPlaceholder,
      sessions
    ]
  )
  /**
   * @description 选择角色下的空会话入口，并按角色优先的顺序同步给调用方。
   * @param characterId 需要切换到的角色 ID。
   */
  const handleEmptySessionSelect = useCallback(
    (characterId: string): void => {
      onCharacterChange(characterId)
      onSessionChange(null)
    },
    [onCharacterChange, onSessionChange]
  )
  /**
   * @description 选择角色下的真实会话，并按角色优先的顺序同步给调用方。
   * @param characterId 会话所属角色 ID。
   * @param sessionId 需要选中的会话 ID。
   */
  const handleSessionSelect = useCallback(
    (characterId: string, sessionId: string): void => {
      onCharacterChange(characterId)
      onSessionChange(sessionId)
    },
    [onCharacterChange, onSessionChange]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded border border-white/15 bg-black/35 px-3 py-2 text-left text-sm text-white transition-colors hover:bg-black/45"
        >
          <span className="min-w-0">
            <span className="block truncate text-white/90">
              {selectedCharacter?.name || '选择角色和会话'}
            </span>
            <span className="block truncate text-xs leading-5 text-white/45">
              {triggerSessionLabel}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-white/55" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn('w-72', MENU_PANEL_CLASS)}>
        {characters.length === 0 && (
          <DropdownMenuItem disabled className="text-white/45">
            暂无可选角色
          </DropdownMenuItem>
        )}

        {characterItems.map((characterItem) => {
          return (
            <DropdownMenuSub key={characterItem.character.id}>
              <DropdownMenuSubTrigger
                disabled={!characterItem.hasSelectableSession}
                className={cn(
                  MENU_SUB_TRIGGER_CLASS,
                  characterItem.isSelected && MENU_ITEM_SELECTED_CLASS,
                  'relative overflow-hidden [&_img]:absolute [&_img]:top-0 [&_img]:bottom-0 [&_img]:left-0 [&_img]:h-full [&_img]:object-cover'
                )}
              >
                <span className="mx-20 block min-w-0 truncate">{characterItem.character.name}</span>
                <img
                  src={characterItem.character.cardBg}
                  className="absolute top-0 bottom-0 left-0"
                />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={cn('w-80', MENU_PANEL_CLASS)}>
                {characterItem.canSelectEmptySession && (
                  <DropdownMenuItem
                    className={cn(
                      MENU_ITEM_CLASS,
                      characterItem.isSelected && !selectedSessionId && MENU_ITEM_SELECTED_CLASS
                    )}
                    onSelect={() => handleEmptySessionSelect(characterItem.character.id)}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{sessionPlaceholder}</span>
                      <span className={MENU_META_CLASS}>不附带历史消息和会话记忆。</span>
                    </span>
                  </DropdownMenuItem>
                )}

                {characterItem.sessions.length === 0 && !characterItem.canSelectEmptySession && (
                  <DropdownMenuItem disabled className="text-white/45">
                    暂无会话
                  </DropdownMenuItem>
                )}

                {characterItem.sessions.map((sessionItem) => (
                  <DropdownMenuItem
                    key={sessionItem.session.id}
                    className={cn(
                      MENU_ITEM_CLASS,
                      sessionItem.isSelected && MENU_ITEM_SELECTED_CLASS
                    )}
                    onSelect={() =>
                      handleSessionSelect(characterItem.character.id, sessionItem.session.id)
                    }
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{sessionItem.preview}</span>
                      <span className={MENU_META_CLASS}>{sessionItem.updatedAtLabel}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
