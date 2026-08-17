import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { AlertCircle, RefreshCw, RotateCcw, XCircle, type LucideIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type {
  MemoryRetrievalMode,
  MemoryTargetSelection,
  MemoryTask
} from '@shared/memory-settings'
import { useMemorySettingsDraft } from '@renderer/hooks/useMemorySettingsDraft'
import { useMemoryTabViewState } from '@renderer/hooks/useMemoryTabViewState'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useMemoryStore } from '@renderer/stores/memoryStore'
import { selectSessionById, useSessionStore } from '@renderer/stores/sessionStore'
import { cn } from '@renderer/utils'
import { CharacterSessionSelect } from '@renderer/components/settings/CharacterSessionSelect'
import { RETRIEVAL_OPTIONS } from '@renderer/components/settings/memory/constants'
import { TaskPanel } from '@renderer/components/settings/memory/TaskPanel'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { Input } from '@renderer/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'

/**
 * @description Resolves the newest session belonging to a character.
 * @param sessions All available sessions.
 * @param characterId The character whose session is needed.
 * @returns The latest session identifier, or `null` when no session exists.
 */
function getLatestSessionIdForCharacter(
  sessions: Session[],
  characterId: string | null
): string | null {
  if (!characterId) return null
  return (
    sessions
      .filter((session) => session.characterId === characterId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id || null
  )
}

/**
 * @description Renders long-term memory policy, inspection, and build task controls.
 * @returns The long-term memory settings page.
 */
export function MemoryTab(): ReactElement {
  const { activateChar, characters } = useCharacterStore(
    useShallow((state) => ({ activateChar: state.activateChar, characters: state.characters }))
  )
  const { currentSessionId, sessions } = useSessionStore(
    useShallow((state) => ({ currentSessionId: state.currentSessionId, sessions: state.sessions }))
  )
  const currentSession = useSessionStore(selectSessionById(currentSessionId))
  const {
    settings,
    isLoaded,
    memoryIndex,
    compatibility,
    tasks,
    setIsLoaded,
    refreshStatus,
    saveSettings,
    startCharacterMemoryBuild,
    startAllMemoryBuild,
    cancelTask
  } = useMemoryStore(
    useShallow((state) => ({
      settings: state.settings,
      isLoaded: state.isLoaded,
      memoryIndex: state.memoryIndex,
      compatibility: state.compatibility,
      tasks: state.tasks,
      setIsLoaded: state.setIsLoaded,
      refreshStatus: state.refreshStatus,
      saveSettings: state.saveSettings,
      startCharacterMemoryBuild: state.startCharacterMemoryBuild,
      startAllMemoryBuild: state.startAllMemoryBuild,
      cancelTask: state.cancelTask
    }))
  )
  const { draft, autosaveState, flushPendingChanges, retryAutosave, updateDraft } =
    useMemorySettingsDraft(settings, saveSettings)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    activateChar?.id ?? null
  )
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    currentSession?.characterId === activateChar?.id ? (currentSession?.id ?? null) : null
  )
  const [pendingTaskType, setPendingTaskType] = useState<MemoryTask['taskType'] | null>(null)
  const [buildLaunchNotice, setBuildLaunchNotice] = useState<{
    type: 'error'
    title: string
    message: string
  } | null>(null)
  const memorySelection = useMemo<MemoryTargetSelection>(
    () => ({
      characterId: selectedCharacterId,
      sessionId: draft.crossSessionCharacterMemory ? null : selectedSessionId
    }),
    [draft.crossSessionCharacterMemory, selectedCharacterId, selectedSessionId]
  )
  const hasInspectionTarget = draft.crossSessionCharacterMemory
    ? Boolean(selectedCharacterId)
    : Boolean(selectedSessionId)
  const memoryIndexForView = hasInspectionTarget ? memoryIndex : null
  const {
    vectorModeSelected,
    characterMemoryBusy,
    activeCharacterMemoryTaskId,
    activeAllMemoryTaskId,
    shouldSuggestMemoryBuild,
    operationTips
  } = useMemoryTabViewState({
    draft,
    compatibility: hasInspectionTarget ? compatibility : [],
    tasks,
    memoryIndex: memoryIndexForView
  })
  const characterMemoryPending = pendingTaskType === 'character-memory-build' || characterMemoryBusy
  const allMemoryPending = pendingTaskType === 'all-memory-build' || characterMemoryBusy
  const selectedRetrievalOption = RETRIEVAL_OPTIONS.find(
    (option) => option.value === draft.retrievalMode
  )

  useEffect(() => {
    void refreshStatus(memorySelection)
      .catch((error) => console.error('Failed to load memory status', error))
      .finally(() => setIsLoaded(true))
  }, [memorySelection, refreshStatus, setIsLoaded])

  /**
   * @description Persists pending settings before submitting a memory build task.
   * @param taskType The task type displayed as pending.
   * @param title The user-facing failure title.
   * @param startTask The task launcher.
   */
  async function launchBuildTask(
    taskType: MemoryTask['taskType'],
    title: string,
    startTask: () => Promise<void>
  ): Promise<void> {
    setPendingTaskType(taskType)
    setBuildLaunchNotice(null)
    try {
      await flushPendingChanges()
      await startTask()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setBuildLaunchNotice({ type: 'error', title, message })
      console.error(title, error)
    } finally {
      setPendingTaskType((current) => (current === taskType ? null : current))
    }
  }

  /** @description Starts rebuilding the selected character's memory index. */
  async function handleBuildCurrentCharacter(): Promise<void> {
    if (!selectedCharacterId) {
      setBuildLaunchNotice({
        type: 'error',
        title: '未选择角色',
        message: '请先选择一个角色，再执行当前角色记忆重建。'
      })
      return
    }
    await launchBuildTask('character-memory-build', '重建当前角色记忆失败', () =>
      startCharacterMemoryBuild(selectedCharacterId)
    )
  }

  /** @description Starts rebuilding all character memory indexes. */
  async function handleBuildAllCharacters(): Promise<void> {
    await launchBuildTask('all-memory-build', '重建全部角色记忆失败', startAllMemoryBuild)
  }

  /**
   * @description Cancels an active memory build task.
   * @param taskId The task identifier to cancel.
   */
  async function handleCancelTask(taskId: string): Promise<void> {
    try {
      await cancelTask(taskId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setBuildLaunchNotice({ type: 'error', title: '中止构建失败', message })
      console.error('Failed to cancel memory build task', error)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 overflow-y-auto px-4 pb-3">
      {!isLoaded && (
        <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">
          正在读取长期记忆设置...
        </div>
      )}
      {autosaveState === 'error' && (
        <div className="flex items-center justify-between gap-3 rounded border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <span>长期记忆设置保存失败</span>
          <button
            type="button"
            onClick={() => void retryAutosave()}
            className="flex items-center gap-1.5 rounded border border-red-300/30 px-2.5 py-1.5 text-xs hover:bg-red-500/15"
          >
            <RotateCcw className="size-3.5" />
            重试
          </button>
        </div>
      )}
      <SectionCard title="长期记忆检索">
        <SettingItem
          title="启用长期记忆检索"
          description="从历史会话整理出的长期记忆中检索相关内容。"
        >
          <Switch
            id="switch-memory"
            checked={draft.memorySearchEnabled}
            onCheckedChange={(checked) => updateDraft({ memorySearchEnabled: checked })}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="长期记忆检索模式"
          description="只影响长期记忆，不影响 Lore 原作资料检索。"
        >
          <Select
            value={draft.retrievalMode}
            onValueChange={(value) => updateDraft({ retrievalMode: value as MemoryRetrievalMode })}
          >
            <SelectTrigger className="h-9 w-fit rounded border-white/15 bg-black/35 px-3 text-sm text-white">
              <span data-slot="select-value" className="truncate">
                {selectedRetrievalOption?.label}
              </span>
            </SelectTrigger>
            <SelectContent position="popper">
              {RETRIEVAL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </SectionCard>
      <SectionCard title="长期记忆范围">
        <SettingItem
          title="同一角色跨会话共享记忆"
          description="开启后，同一角色名下的不同会话会共享长期记忆索引。"
        >
          <Switch
            id="switch-shareMemory"
            checked={draft.crossSessionCharacterMemory}
            onCheckedChange={(checked) => updateDraft({ crossSessionCharacterMemory: checked })}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem title="近期消息数量">
          <Input
            value={draft.recentMessageCount}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isInteger(value) && value > 0) updateDraft({ recentMessageCount: value })
            }}
          />
        </SettingItem>
        <SettingItem title="长期记忆摘要触发轮数">
          <Input
            value={draft.summaryTriggerTurns}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isInteger(value) && value > 0) updateDraft({ summaryTriggerTurns: value })
            }}
          />
        </SettingItem>
        <SettingItem title="历史记录 TopK">
          <Input
            value={draft.memoryTopK}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isInteger(value) && value > 0) updateDraft({ memoryTopK: value })
            }}
          />
        </SettingItem>
      </SectionCard>
      <SectionCard title="长期记忆索引">
        <div className="space-y-3 rounded border border-white/10 bg-black/20 p-4">
          {memoryIndexForView?.availability === 'incompatible' && (
            <div className="flex items-center gap-2 text-xs text-amber-200">
              <AlertCircle className="size-4" />
              索引与当前 embedding 不一致，建议重建。
            </div>
          )}
          <CharacterSessionSelect
            characters={characters}
            sessions={sessions}
            selectedCharacterId={selectedCharacterId}
            selectedSessionId={selectedSessionId}
            onCharacterChange={(characterId) => {
              setSelectedCharacterId(characterId)
              setSelectedSessionId(getLatestSessionIdForCharacter(sessions, characterId))
            }}
            onSessionChange={setSelectedSessionId}
            allowEmptySession
            sessionDisabled={draft.crossSessionCharacterMemory}
            sessionPlaceholder="不选择会话"
            sessionHint={
              draft.crossSessionCharacterMemory
                ? '当前记忆索引按角色聚合查看。'
                : '请选择会话以查看会话级记忆索引。'
            }
          />
          {operationTips.map((tip) => (
            <p key={tip} className="text-xs leading-5 text-white/55">
              {tip}
            </p>
          ))}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MemoryActionButton
              icon={characterMemoryPending && activeCharacterMemoryTaskId ? XCircle : RefreshCw}
              label={
                characterMemoryPending && activeCharacterMemoryTaskId
                  ? '中止构建'
                  : '重建当前角色记忆'
              }
              disabled={
                !selectedCharacterId ||
                !vectorModeSelected ||
                (characterMemoryPending && !activeCharacterMemoryTaskId)
              }
              highlight={Boolean(
                selectedCharacterId && !characterMemoryPending && shouldSuggestMemoryBuild
              )}
              onClick={
                characterMemoryPending && activeCharacterMemoryTaskId
                  ? () => handleCancelTask(activeCharacterMemoryTaskId)
                  : handleBuildCurrentCharacter
              }
            />
            <MemoryActionButton
              icon={allMemoryPending && activeAllMemoryTaskId ? XCircle : RefreshCw}
              label={allMemoryPending && activeAllMemoryTaskId ? '中止构建' : '重建全部角色记忆'}
              disabled={
                characters.length === 0 ||
                !vectorModeSelected ||
                (allMemoryPending && !activeAllMemoryTaskId)
              }
              highlight={allMemoryPending || shouldSuggestMemoryBuild}
              onClick={
                allMemoryPending && activeAllMemoryTaskId
                  ? () => handleCancelTask(activeAllMemoryTaskId)
                  : handleBuildAllCharacters
              }
            />
          </div>
          <TaskPanel tasks={tasks} buildLaunchNotice={buildLaunchNotice} />
        </div>
      </SectionCard>
    </div>
  )
}

/**
 * @description Renders one memory index management command.
 * @param props The command's visual state and action.
 * @returns A memory index command button.
 */
function MemoryActionButton({
  icon: Icon,
  label,
  disabled,
  highlight,
  onClick
}: {
  icon: LucideIcon
  label: string
  disabled: boolean
  highlight: boolean
  onClick: () => Promise<void>
}): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onClick()}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40',
        highlight
          ? 'border-[#e8c690]/40 bg-[#e8c690]/12 text-[#f2dfbd]'
          : 'border-white/15 bg-black/20 text-white/75 hover:bg-white/5'
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}
