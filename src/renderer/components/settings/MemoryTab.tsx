import { useMemo, useState, type ReactElement } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Wifi,
  XCircle
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type {
  CharacterMemoryIndexStatus,
  MemoryRetrievalMode,
  MemoryTargetSelection,
  WorldKnowledgeRouteStatus,
  WorldIndexStatus
} from '@shared/memory-settings'
import { useMemorySettingsDraft } from '@renderer/hooks/useMemorySettingsDraft'
import { useMemoryTabActions } from '@renderer/hooks/useMemoryTabActions'
import { useMemoryTabLifecycle } from '@renderer/hooks/useMemoryTabLifecycle'
import { useMemoryTabViewState } from '@renderer/hooks/useMemoryTabViewState'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useMemoryStore } from '@renderer/stores/memoryStore'
import { selectSessionById, useSessionStore } from '@renderer/stores/sessionStore'
import { cn } from '@renderer/utils'
import { CharacterSessionSelect } from '@renderer/components/settings/CharacterSessionSelect'
import { RETRIEVAL_OPTIONS } from '@renderer/components/settings/memory/constants'
import { EmbeddingTestResultBanner } from '@renderer/components/settings/memory/EmbeddingTestResultBanner'
import {
  formatDateTime,
  getAvailabilityMeta,
  getRuntimeModeMeta,
  getSelectedEmbeddingModeLabel,
  getWorldRouteSummaryHint
} from '@renderer/components/settings/memory/helpers'
import { LocalModelCard } from '@renderer/components/settings/memory/LocalModelCard'
import { InfoPill } from '@renderer/components/settings/memory/InfoPill'
import { TaskPanel } from '@renderer/components/settings/memory/TaskPanel'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@renderer/components/ui/select'
import { Input } from '@renderer/components/ui/input'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { isPositiveInteger } from '@renderer/utils'

type MemoryTabProps = {
  isActive: boolean
}

type IndexStatus = WorldIndexStatus | CharacterMemoryIndexStatus | null
type RouteStatus = WorldKnowledgeRouteStatus | null

/**
 * @description 渲染索引管理区内的轻量状态行。
 * @param props 当前索引状态、条目数和最近构建时间。
 * @returns 索引状态摘要节点。
 */
function IndexStatusLine({
  index,
  metadataLabel,
  metadataValue
}: {
  index: IndexStatus
  metadataLabel?: string
  metadataValue?: string | number | null
}): ReactElement {
  const availabilityMeta = getAvailabilityMeta(index?.availability, index)

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
      <span className={cn('rounded border px-2 py-1 text-[11px]', availabilityMeta.tone)}>
        {availabilityMeta.label}
      </span>
      <span>条目：{index?.entryCount ?? '-'}</span>
      {metadataLabel && (
        <span>
          {metadataLabel}：{metadataValue ?? '-'}
        </span>
      )}
      <span>最近构建：{formatDateTime(index?.builtAt)}</span>
    </div>
  )
}

/**
 * @description 渲染索引管理区内的紧凑操作按钮。
 * @param props 按钮图标、文案、禁用状态和点击处理器。
 * @returns 索引操作按钮节点。
 */
function IndexActionButton({
  icon: Icon,
  label,
  disabled,
  disabledReason,
  highlight,
  onClick
}: {
  icon: LucideIcon
  label: string
  disabled?: boolean
  disabledReason?: string
  highlight?: boolean
  onClick: () => Promise<void>
}): ReactElement {
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
          highlight
            ? 'border-[#e8c690]/40 bg-[#e8c690]/12 text-[#f2dfbd] hover:bg-[#e8c690]/20'
            : 'border-white/15 bg-black/20 text-white/75 hover:bg-white/5'
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {disabledReason && (
        <div className="mt-1 text-xs leading-5 text-amber-200/85">{disabledReason}</div>
      )}
    </div>
  )
}

/**
 * @description 渲染索引分组内的简短提示列表。
 * @param props 当前分组需要展示的提示文本。
 * @returns 提示列表节点；没有提示时返回 `null`。
 */
function IndexTipList({ tips }: { tips: string[] }): ReactElement | null {
  if (tips.length === 0) {
    return null
  }

  return (
    <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/55">
      {tips.map((tip) => (
        <div key={tip}>{tip}</div>
      ))}
    </div>
  )
}

/**
 * @description 渲染 world 细分路由的状态卡。
 * @param props 标题与路由状态。
 * @returns 状态卡节点。
 */
function WorldRouteStatusCard({
  title,
  status,
  tip
}: {
  title: string
  status: RouteStatus
  tip?: string
}): ReactElement {
  const availabilityMeta = getAvailabilityMeta(status?.indexAvailability)
  const runtimeMeta = getRuntimeModeMeta(status?.retrievalModeUsed)
  const routeHint = getWorldRouteSummaryHint(status, tip)
  const fingerprintModel = status?.fingerprint?.model || '尚未生成'

  function renderWorldRouteInfo(): ReactElement {
    return (
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-white/60 xl:grid-cols-5">
        <InfoPill label="当前运行" value={runtimeMeta.label} />
        <InfoPill label="条目来源" value={title} />
        <InfoPill label="索引条目" value={status?.entryCount ?? '-'} />
        <InfoPill label="最近构建" value={formatDateTime(status?.builtAt)} />
        <InfoPill label="向量" value={fingerprintModel} />
      </div>
    )
  }

  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-white/85">
          <Database className="size-4 text-[#e8c690]" />
          <span>{title}</span>
        </div>
        <span className={cn('rounded px-2 py-1 text-[11px]', availabilityMeta.tone)}>
          {availabilityMeta.label}
        </span>
      </div>

      {renderWorldRouteInfo()}

      <i className="mt-2 ml-2 block text-xs leading-5 text-white/55">{routeHint}</i>
    </div>
  )
}

/**
 * @description 计算 Memory 页的初始本地角色 / 会话选择。
 * @param activeCharacter 当前主页面角色。
 * @param currentSession 当前主页面会话。
 * @returns 适合在 Memory 页内部保存的初始选择。
 */
function getInitialMemorySelection(
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
 * @description 返回指定角色最近更新的一条会话 ID。
 * @param sessions 当前会话列表。
 * @param characterId 角色 ID。
 * @returns 最近会话 ID；若角色下暂无会话则返回 `null`。
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

export function MemoryTab({ isActive }: MemoryTabProps): ReactElement {
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
    () => getInitialMemorySelection(activateChar, currentSession),
    [activateChar, currentSession]
  )
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    initialSelection.characterId
  )
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSelection.sessionId
  )
  const {
    settings,
    isLoaded,
    worldIndex,
    storyStatus,
    glossaryStatus,
    memoryIndex,
    compatibility,
    embeddingTestResult,
    hardware,
    localModels,
    localModelUiState,
    tasks,
    setIsLoaded,
    refreshStatus,
    refreshLocalModels,
    saveSettings,
    downloadLocalModel,
    selectLocalModel,
    removeLocalModel,
    clearLocalModelUiState,
    testEmbeddingConnection,
    startWorldBundleDownload,
    startWorldVectorBuild,
    startCharacterMemoryBuild,
    startAllMemoryBuild,
    cancelTask
  } = useMemoryStore(
    useShallow((state) => ({
      settings: state.settings,
      isLoaded: state.isLoaded,
      worldIndex: state.worldIndex,
      storyStatus: state.storyStatus,
      glossaryStatus: state.glossaryStatus,
      memoryIndex: state.memoryIndex,
      compatibility: state.compatibility,
      embeddingTestResult: state.embeddingTestResult,
      hardware: state.hardware,
      localModels: state.localModels,
      localModelUiState: state.localModelUiState,
      tasks: state.tasks,
      setIsLoaded: state.setIsLoaded,
      refreshStatus: state.refreshStatus,
      refreshLocalModels: state.refreshLocalModels,
      saveSettings: state.saveSettings,
      downloadLocalModel: state.downloadLocalModel,
      selectLocalModel: state.selectLocalModel,
      removeLocalModel: state.removeLocalModel,
      clearLocalModelUiState: state.clearLocalModelUiState,
      testEmbeddingConnection: state.testEmbeddingConnection,
      startWorldBundleDownload: state.startWorldBundleDownload,
      startWorldVectorBuild: state.startWorldVectorBuild,
      startCharacterMemoryBuild: state.startCharacterMemoryBuild,
      startAllMemoryBuild: state.startAllMemoryBuild,
      cancelTask: state.cancelTask
    }))
  )
  const {
    draft,
    isDirty,
    autosaveState,
    hasPendingChanges,
    updateDraft,
    flushPendingChanges,
    retryAutosave
  } = useMemorySettingsDraft(settings, saveSettings)
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) || null
  const sessionSelectionDisabled = draft.crossSessionCharacterMemory
  const hasMemoryInspectionTarget = draft.crossSessionCharacterMemory
    ? Boolean(selectedCharacterId)
    : Boolean(selectedSessionId)
  const memorySelection = useMemo<MemoryTargetSelection>(
    () => ({
      characterId: selectedCharacterId,
      sessionId: draft.crossSessionCharacterMemory ? null : selectedSessionId
    }),
    [draft.crossSessionCharacterMemory, selectedCharacterId, selectedSessionId]
  )
  const memoryIndexForView = hasMemoryInspectionTarget ? memoryIndex : null
  const compatibilityForView = hasMemoryInspectionTarget ? compatibility : []
  const {
    vectorModeSelected,
    worldBundleBusy,
    worldVectorBusy,
    characterMemoryBusy,
    activeWorldBundleTaskId,
    activeWorldVectorTaskId,
    activeCharacterMemoryTaskId,
    activeAllMemoryTaskId,
    storyNeedsBuild,
    glossaryNeedsBuild,
    worldRoutesNeedBuild,
    shouldSuggestMemoryBuild,
    operationTips
  } = useMemoryTabViewState({
    draft,
    compatibility: compatibilityForView,
    tasks,
    worldIndex,
    storyStatus,
    glossaryStatus,
    memoryIndex: memoryIndexForView
  })

  const {
    isTestingEmbedding,
    pendingBuildTaskType,
    buildLaunchNotice,
    clearBuildLaunchNotice,
    handleTestEmbedding,
    handleStartWorldBundleDownload,
    handleStartWorldVectorBuild,
    handleStartCharacterMemoryBuild,
    handleStartAllMemoryBuild,
    handleCancelTask,
    handleDownloadLocalModel,
    handleSelectLocalModel,
    handleRemoveLocalModel
  } = useMemoryTabActions({
    draft,
    updateDraft,
    flushPendingChanges,
    selectedCharacterId,
    clearLocalModelUiState,
    downloadLocalModel,
    selectLocalModel,
    removeLocalModel,
    testEmbeddingConnection,
    startWorldBundleDownload,
    startWorldVectorBuild,
    startCharacterMemoryBuild,
    startAllMemoryBuild,
    cancelTask
  })

  const worldVectorPending = pendingBuildTaskType === 'world-vector-build' || worldVectorBusy
  const characterMemoryPending =
    pendingBuildTaskType === 'character-memory-build' || characterMemoryBusy
  const allMemoryPending = pendingBuildTaskType === 'all-memory-build' || characterMemoryBusy
  const selectedRetrievalOption = RETRIEVAL_OPTIONS.find(
    (option) => option.value === draft.retrievalMode
  )
  const [localModelListOpen, setLocalModelListOpen] = useState(false)
  const selectedLocalModel = localModels.find((model) => model.isSelected) || null
  const installedLocalModelCount = localModels.filter(
    (model) => model.status === 'installed'
  ).length

  useMemoryTabLifecycle({
    isActive,
    isLoaded,
    selection: memorySelection,
    buildLaunchNotice,
    refreshStatus,
    refreshLocalModels,
    setIsLoaded,
    clearBuildLaunchNotice
  })

  const autosaveMeta =
    autosaveState === 'saving'
      ? {
          icon: LoaderCircle,
          iconClassName: 'animate-spin text-amber-200',
          tone: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
          title: '正在自动保存记忆设置'
        }
      : autosaveState === 'saved'
        ? {
            icon: CheckCircle2,
            iconClassName: 'text-emerald-200',
            tone: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
            title: '记忆设置已自动保存'
          }
        : autosaveState === 'error'
          ? {
              icon: XCircle,
              iconClassName: 'text-red-200',
              tone: 'border-red-400/30 bg-red-500/10 text-red-100',
              title: '记忆设置保存失败'
            }
          : {
              icon: CheckCircle2,
              iconClassName: 'text-white/55',
              tone: 'border-white/10 bg-black/20 text-white/70',
              title: hasPendingChanges || isDirty ? '有更改等待保存' : '记忆设置会自动保存'
            }

  const AutosaveIcon = autosaveMeta.icon
  const selectionHint = draft.crossSessionCharacterMemory
    ? '当前记忆索引按角色聚合查看。切换角色会同时切换状态、兼容性和索引目标。'
    : '当前记忆索引按会话查看。若不选择会话，状态区只显示空态提示，不会误判为索引缺失。'
  const memoryEmptyTip = '当前还没有角色记忆内容，先开始聊天产生记忆后，再构建向量索引即可。'
  const operationTipsForView = operationTips.map((tip) => {
    if (tip !== memoryEmptyTip || draft.crossSessionCharacterMemory) {
      return tip
    }

    return selectedSessionId
      ? '当前会话还没有可用于索引的记忆内容。你仍然可以重建当前角色记忆，系统会整理该角色名下的历史会话。'
      : '当前没有选择会话，无法判断会话级记忆索引内容。请选择会话，或开启同一角色跨会话共享记忆。'
  })
  const generalIndexTips = operationTipsForView
    .filter((tip) => tip.includes('字符串检索模式'))
    .slice(0, 1)
  const storyIndexTips = operationTipsForView.filter((tip) => tip.includes('故事')).slice(0, 1)
  const glossaryIndexTips = operationTipsForView.filter((tip) => tip.includes('名词')).slice(0, 1)
  const memoryIndexTips = operationTipsForView
    .filter((tip) => !tip.includes('世界知识') && !tip.includes('字符串检索模式'))
    .slice(0, 2)
  const hasIncompatibleIndex =
    draft.retrievalMode !== 'string' &&
    (storyStatus?.indexAvailability === 'incompatible' ||
      glossaryStatus?.indexAvailability === 'incompatible' ||
      memoryIndexForView?.availability === 'incompatible')

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto px-4">
      {!isLoaded && (
        <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">
          正在读取记忆设置...
        </div>
      )}

      <div
        className={cn(
          'flex items-center justify-between gap-4 rounded border px-4 py-3',
          autosaveMeta.tone
        )}
      >
        <div className="flex items-start gap-3">
          <AutosaveIcon className={cn('mt-0.5 size-4 shrink-0', autosaveMeta.iconClassName)} />
          <div className="min-w-0">
            <div className="text-sm font-medium">{autosaveMeta.title}</div>
          </div>
        </div>

        {autosaveState === 'error' && (
          <button
            type="button"
            onClick={() => void retryAutosave()}
            className="flex shrink-0 items-center gap-2 rounded border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 transition-colors hover:bg-red-500/15"
          >
            <RotateCcw className="size-3.5" />
            重试保存
          </button>
        )}
      </div>

      <SectionCard title="检索设置">
        <SettingItem
          title="启用世界知识检索"
          description="从内置故事与名词知识库中检索相关内容，并追加到提示词上下文里。"
        >
          <Switch
            id="switch-world"
            checked={draft.worldSearchEnabled}
            onCheckedChange={(checked) => updateDraft({ worldSearchEnabled: checked })}
            onClick={(e) => e.stopPropagation()}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="启用长期记忆检索"
          description="从历史会话整理出的长期记忆里检索相关内容。"
        >
          <Switch
            id="switch-memory"
            checked={draft.memorySearchEnabled}
            onCheckedChange={(checked) => updateDraft({ memorySearchEnabled: checked })}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem title="检索模式">
          <Select
            value={draft.retrievalMode}
            onValueChange={(value) => updateDraft({ retrievalMode: value as MemoryRetrievalMode })}
          >
            <SelectTrigger className="h-9 w-fit rounded border-white/15 bg-black/35 px-3 text-sm text-white hover:bg-black/45 focus:border-[#e8c690]">
              <span data-slot="select-value" className="truncate">
                {selectedRetrievalOption?.label}
              </span>
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="min-w-(--radix-select-trigger-width) rounded border-0"
            >
              {RETRIEVAL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs leading-5 text-white/45">{option.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
        {draft.retrievalMode !== 'string' && (
          <section className="space-y-6 rounded bg-[rgba(16,16,16,0.3)] px-4 py-3 pt-2">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-medium text-white/90">向量提供方设置</h2>
                <p className="mt-1 text-xs text-white/45">
                  选择、下载并管理本地 Transformers.js embedding 模型。
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleTestEmbedding()}
                disabled={isTestingEmbedding}
                className="flex items-center gap-2 rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <Wifi className={cn('size-4', isTestingEmbedding && 'animate-pulse')} />
                {isTestingEmbedding ? '测试中...' : '测试 embedding'}
              </button>
            </div>

            {draft.retrievalMode === 'vector-local' && (
              <div className="space-y-4">
                <SettingItem
                  title="使用 GPU 运行本地 embedding"
                  description={`开启后会优先使用 GPU，如果当前环境不支持，则会自动切换到 CPU。当前 GPU：${hardware.gpuName}`}
                >
                  <Switch
                    id="switch-local-gpu"
                    checked={draft.localEmbedding.useGpu}
                    onCheckedChange={(checked) =>
                      updateDraft({
                        localEmbedding: { ...draft.localEmbedding, useGpu: checked }
                      })
                    }
                    className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
                  />
                </SettingItem>
                <SettingItem
                  title="使用 Hugging Face 镜像下载本地模型"
                  description="开启后会从 Hugging Face 镜像下载模型文件，适用于国内网络环境较差的用户。默认镜像地址为 https://hf-mirror.com 。"
                >
                  <Switch
                    id="switch-mirror"
                    checked={draft.localEmbedding.useHuggingFaceMirror}
                    onCheckedChange={(checked) =>
                      updateDraft({
                        localEmbedding: {
                          ...draft.localEmbedding,
                          useHuggingFaceMirror: checked
                        }
                      })
                    }
                    className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
                  />
                </SettingItem>
                <SettingItem title="本地模型批处理大小" description="设置本地模型处理批次的大小。">
                  <Input
                    value={draft.localEmbedding.batchSize}
                    onChange={(value) => {
                      const numberValue = Number(value.target.value)
                      isPositiveInteger(numberValue) &&
                        updateDraft({
                          localEmbedding: {
                            ...draft.localEmbedding,
                            batchSize: numberValue
                          }
                        })
                    }}
                  />
                </SettingItem>

                <Collapsible open={localModelListOpen} onOpenChange={setLocalModelListOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded border border-white/10 bg-black/20 px-4 py-3 text-left transition-colors hover:bg-white/5"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-white/90">
                          本地 embedding 模型
                        </span>
                        <span className="mt-1 block truncate text-xs text-white/45">
                          当前：
                          {selectedLocalModel?.label || '未选择模型'} · 已安装{' '}
                          {installedLocalModelCount}/{localModels.length}
                        </span>
                      </span>
                      {localModelListOpen ? (
                        <ChevronDown className="size-4 shrink-0 text-white/55" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-white/55" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      {localModels.map((model) => (
                        <LocalModelCard
                          key={model.id}
                          model={model}
                          uiState={localModelUiState[model.id]}
                          onDownload={handleDownloadLocalModel}
                          onSelect={handleSelectLocalModel}
                          onRemove={handleRemoveLocalModel}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {embeddingTestResult && <EmbeddingTestResultBanner result={embeddingTestResult} />}
          </section>
        )}
      </SectionCard>

      <SectionCard title="记忆范围">
        <SettingItem
          title="同一角色跨会话共享记忆"
          description="开启后，同一角色名下的不同会话会共享同一套长期记忆索引。"
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
            onChange={(value) => {
              const numberValue = Number(value.target.value)
              isPositiveInteger(numberValue) && updateDraft({ recentMessageCount: numberValue })
            }}
          />
        </SettingItem>
        <SettingItem title="长期记忆摘要触发轮数">
          <Input
            value={draft.summaryTriggerTurns}
            onChange={(value) => {
              const numberValue = Number(value.target.value)
              isPositiveInteger(numberValue) && updateDraft({ summaryTriggerTurns: numberValue })
            }}
          />
        </SettingItem>
        <SettingItem title="故事 / 名词 TopK">
          <Input
            value={draft.worldTopK}
            onChange={(value) => {
              const numberValue = Number(value.target.value)
              isPositiveInteger(numberValue) && updateDraft({ worldTopK: numberValue })
            }}
          />
        </SettingItem>
        <SettingItem title="历史记录 TopK">
          <Input
            value={draft.memoryTopK}
            onChange={(value) => {
              const numberValue = Number(value.target.value)
              isPositiveInteger(numberValue) && updateDraft({ memoryTopK: numberValue })
            }}
          />
        </SettingItem>
      </SectionCard>

      <SectionCard title="索引管理">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 bg-[rgb(4,4,4,0.5)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-white/80">当前设置：</span>
              <span className="rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-xs text-[#f2dfbd]">
                {getSelectedEmbeddingModeLabel(draft.retrievalMode)}
              </span>
            </div>

            {hasIncompatibleIndex && (
              <div className="flex items-center gap-2 text-xs text-amber-200">
                <AlertCircle className="size-4 shrink-0" />
                <span>索引与当前 embedding 不一致，建议重建。</span>
              </div>
            )}
          </div>

          <IndexTipList tips={generalIndexTips} />

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded border border-white/10 bg-black/20 p-4">
              <WorldRouteStatusCard title="故事" status={storyStatus} tip={storyIndexTips[0]} />
            </div>
            <div className="rounded border border-white/10 bg-black/20 p-4">
              <WorldRouteStatusCard
                title="名词"
                status={glossaryStatus}
                tip={glossaryIndexTips[0]}
              />
            </div>
          </div>

          <div className="space-y-3 rounded border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-medium text-white/90">世界知识构建</div>
              <IndexStatusLine
                index={worldIndex}
                metadataLabel="知识包更新时间"
                metadataValue={formatDateTime(worldIndex?.updatedAt)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <IndexActionButton
                icon={worldBundleBusy ? XCircle : Download}
                label={
                  worldBundleBusy && activeWorldBundleTaskId ? '中止更新' : '更新故事/名词知识包'
                }
                highlight={worldBundleBusy || worldRoutesNeedBuild}
                disabled={worldBundleBusy ? !activeWorldBundleTaskId : false}
                disabledReason={worldBundleBusy ? '当前已有世界知识包更新任务在运行。' : undefined}
                onClick={
                  worldBundleBusy && activeWorldBundleTaskId
                    ? () => handleCancelTask(activeWorldBundleTaskId)
                    : handleStartWorldBundleDownload
                }
              />
              <IndexActionButton
                icon={worldVectorPending ? XCircle : RefreshCw}
                label={
                  worldVectorPending && activeWorldVectorTaskId ? '中止构建' : '构建故事/名词向量'
                }
                highlight={
                  worldVectorPending ||
                  worldRoutesNeedBuild ||
                  storyNeedsBuild ||
                  glossaryNeedsBuild
                }
                disabled={
                  (worldVectorPending && !activeWorldVectorTaskId) ||
                  (!worldVectorPending && !vectorModeSelected)
                }
                disabledReason={
                  worldVectorPending
                    ? '当前已有世界知识向量构建任务在运行。'
                    : !vectorModeSelected
                      ? '字符串检索模式下不需要构建向量索引。'
                      : undefined
                }
                onClick={
                  worldVectorPending && activeWorldVectorTaskId
                    ? () => handleCancelTask(activeWorldVectorTaskId)
                    : handleStartWorldVectorBuild
                }
              />
            </div>
          </div>

          <div className="rounded border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-white/90">角色记忆</div>
                <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/55">
                  {draft.crossSessionCharacterMemory ? '按角色聚合' : '按会话查看'}
                </span>
              </div>
              <IndexStatusLine
                index={memoryIndexForView}
                metadataLabel="已索引角色"
                metadataValue={memoryIndexForView?.indexedCharacterCount}
              />
            </div>

            <div className="mt-3">
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
                sessionDisabled={sessionSelectionDisabled}
                sessionPlaceholder="不选择会话"
                sessionHint={selectionHint}
              />
              <div className="mt-2 text-xs text-white/50">
                当前目标：{selectedCharacter?.name || '未选择角色'}
              </div>
            </div>

            <div className="mt-3">
              <IndexTipList tips={memoryIndexTips} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <IndexActionButton
                icon={characterMemoryPending && activeCharacterMemoryTaskId ? XCircle : RefreshCw}
                label={
                  characterMemoryPending && activeCharacterMemoryTaskId
                    ? '中止构建'
                    : '重建当前角色记忆'
                }
                highlight={Boolean(
                  selectedCharacterId && !characterMemoryPending && shouldSuggestMemoryBuild
                )}
                disabled={
                  !selectedCharacterId ||
                  !vectorModeSelected ||
                  (characterMemoryPending && !activeCharacterMemoryTaskId)
                }
                disabledReason={
                  !selectedCharacterId
                    ? '请先选择记忆索引目标。'
                    : characterMemoryPending
                      ? '当前已有角色记忆构建任务在运行。'
                      : !vectorModeSelected
                        ? '字符串检索模式下不需要构建记忆向量。'
                        : undefined
                }
                onClick={
                  characterMemoryPending && activeCharacterMemoryTaskId
                    ? () => handleCancelTask(activeCharacterMemoryTaskId)
                    : handleStartCharacterMemoryBuild
                }
              />
              <IndexActionButton
                icon={allMemoryPending && activeAllMemoryTaskId ? XCircle : RefreshCw}
                label={allMemoryPending && activeAllMemoryTaskId ? '中止构建' : '重建全部角色记忆'}
                highlight={allMemoryPending || shouldSuggestMemoryBuild}
                disabled={
                  characters.length === 0 ||
                  !vectorModeSelected ||
                  (allMemoryPending && !activeAllMemoryTaskId)
                }
                disabledReason={
                  characters.length === 0
                    ? '当前没有可用角色。'
                    : allMemoryPending
                      ? '当前已有角色记忆构建任务在运行。'
                      : !vectorModeSelected
                        ? '字符串检索模式下不需要构建记忆向量。'
                        : undefined
                }
                onClick={
                  allMemoryPending && activeAllMemoryTaskId
                    ? () => handleCancelTask(activeAllMemoryTaskId)
                    : handleStartAllMemoryBuild
                }
              />
            </div>
          </div>

          <TaskPanel tasks={tasks} buildLaunchNotice={buildLaunchNotice} />
        </div>
      </SectionCard>
    </div>
  )
}
