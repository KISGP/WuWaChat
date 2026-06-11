import { type ReactElement } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Wifi,
  XCircle
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { CloudEmbeddingSettings, MemoryRetrievalMode } from '@shared/memory-settings'
import { HUGGING_FACE_INFERENCE_PROVIDERS } from '@shared/memory-settings'
import { useMemorySettingsDraft } from '@renderer/hooks/useMemorySettingsDraft'
import { useMemoryTabActions } from '@renderer/hooks/useMemoryTabActions'
import { useMemoryTabLifecycle } from '@renderer/hooks/useMemoryTabLifecycle'
import { useMemoryTabViewState } from '@renderer/hooks/useMemoryTabViewState'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useMemoryStore } from '@renderer/stores/memoryStore'
import { cn } from '@renderer/utils'
import { ActionCard } from '@renderer/components/settings/memory/ActionCard'
import {
  CLOUD_PROVIDER_OPTIONS,
  RETRIEVAL_OPTIONS
} from '@renderer/components/settings/memory/constants'
import { EmbeddingTestResultBanner } from '@renderer/components/settings/memory/EmbeddingTestResultBanner'
import {
  getDefaultCloudBaseUrl,
  getDefaultCloudModel,
  getSelectedEmbeddingModeLabel
} from '@renderer/components/settings/memory/helpers'
import { LocalModelCard } from '@renderer/components/settings/memory/LocalModelCard'
import { StatusCard } from '@renderer/components/settings/memory/StatusCard'
import { TaskPanel } from '@renderer/components/settings/memory/TaskPanel'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@renderer/components/ui/select'
import { Input } from '@renderer/components/ui/input'
import { isPositiveInteger } from '@renderer/utils'

type MemoryTabProps = {
  isActive: boolean
}

export function MemoryTab({ isActive }: MemoryTabProps): ReactElement {
  const { activateChar, characters } = useCharacterStore(
    useShallow((state) => ({
      activateChar: state.activateChar,
      characters: state.characters
    }))
  )
  const {
    settings,
    isLoaded,
    worldIndex,
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
    updateCloudEmbedding,
    flushPendingChanges,
    retryAutosave
  } = useMemorySettingsDraft(settings, saveSettings)
  const {
    providerListOpen,
    setProviderListOpen,
    worldCompatibility,
    memoryCompatibility,
    selectedProvider,
    isHuggingFace,
    isVolcengineArk,
    vectorModeSelected,
    worldBundleBusy,
    worldVectorBusy,
    characterMemoryBusy,
    activeWorldBundleTaskId,
    activeWorldVectorTaskId,
    activeCharacterMemoryTaskId,
    activeAllMemoryTaskId,
    worldIndexNeedsBuild,
    shouldSuggestMemoryBuild,
    operationTips
  } = useMemoryTabViewState({
    draft,
    compatibility,
    tasks,
    worldIndex,
    memoryIndex
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
    handleCloudProviderChange,
    handleDownloadLocalModel,
    handleSelectLocalModel,
    handleRemoveLocalModel
  } = useMemoryTabActions({
    draft,
    updateCloudEmbedding,
    updateDraft,
    flushPendingChanges,
    activeCharacterId: activateChar?.id || null,
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
  const isSaving = autosaveState === 'saving'
  const handleSave = retryAutosave
  const selectedRetrievalOption = RETRIEVAL_OPTIONS.find(
    (option) => option.value === draft.retrievalMode
  )

  useMemoryTabLifecycle({
    isActive,
    isLoaded,
    activeCharacterId: activateChar?.id || null,
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
          description="从内置 world 知识库中检索相关内容，并追加到提示词上下文里。"
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
                  {draft.retrievalMode === 'vector-cloud'
                    ? '配置远程 embedding 服务，并测试连接状态。'
                    : '选择、下载并管理本地 Transformers.js embedding 模型。'}
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

            {draft.retrievalMode === 'vector-cloud' && (
              <>
                <div className="mb-3 rounded border border-white/10 bg-black/20">
                  <button
                    type="button"
                    onClick={() => setProviderListOpen((value) => !value)}
                    className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white/85">
                        {selectedProvider.label}
                      </span>
                      <span className="block truncate text-xs text-white/45">
                        {selectedProvider.description}
                      </span>
                    </span>
                    {providerListOpen ? (
                      <ChevronDown className="size-4 shrink-0 text-white/55" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-white/55" />
                    )}
                  </button>

                  {providerListOpen && (
                    <div className="border-t border-white/10 p-2">
                      <div className="space-y-2">
                        {CLOUD_PROVIDER_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              handleCloudProviderChange(option.value)
                              setProviderListOpen(false)
                            }}
                            className={cn(
                              'block w-full rounded border px-3 py-3 text-left transition-colors',
                              draft.cloudEmbedding.provider === option.value
                                ? 'border-[#e8c690]/60 bg-white/10 text-[#e8c690]'
                                : 'border-white/10 bg-black/20 text-white/70 hover:bg-white/5'
                            )}
                          >
                            <div className="text-sm font-medium">{option.label}</div>
                            <div className="mt-1 text-xs leading-5 text-white/45">
                              {option.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-white/55">提供方</span>
                    <Input value={draft.cloudEmbedding.provider} disabled />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-white/55">模型</span>
                    <Input
                      value={draft.cloudEmbedding.model}
                      onChange={(event) => updateCloudEmbedding({ model: event.target.value })}
                      placeholder={getDefaultCloudModel(draft.cloudEmbedding.provider)}
                    />
                  </label>

                  {isHuggingFace && (
                    <label className="col-span-2 flex flex-col gap-1.5">
                      <span className="text-xs text-white/55">推理提供方</span>

                      <Select
                        value={draft.cloudEmbedding.inferenceProvider || 'hf-inference'}
                        onValueChange={(value) =>
                          updateCloudEmbedding({
                            inferenceProvider: value as CloudEmbeddingSettings['inferenceProvider']
                          })
                        }
                      >
                        <SelectTrigger className="h-9 w-fit rounded border-white/15 bg-black/35 px-3 text-sm text-white hover:bg-black/45 focus:border-[#e8c690]">
                          <span data-slot="select-value" className="truncate">
                            {draft.cloudEmbedding.inferenceProvider}
                          </span>
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="min-w-(--radix-select-trigger-width) rounded border-0"
                        >
                          {HUGGING_FACE_INFERENCE_PROVIDERS.map((option) => (
                            <SelectItem key={option} value={option}>
                              <div className="flex flex-col">
                                <span>{option}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  )}

                  {!isHuggingFace && (
                    <label className="col-span-2 flex flex-col gap-1.5">
                      <span className="text-xs text-white/55">Base URL</span>
                      <Input
                        value={draft.cloudEmbedding.baseUrl}
                        onChange={(event) => updateCloudEmbedding({ baseUrl: event.target.value })}
                        placeholder={getDefaultCloudBaseUrl(draft.cloudEmbedding.provider)}
                      />
                    </label>
                  )}

                  <label
                    className={cn(
                      'flex flex-col gap-1.5',
                      (isHuggingFace || isVolcengineArk) && 'col-span-2'
                    )}
                  >
                    <span className="text-xs text-white/55">
                      {isHuggingFace
                        ? 'Hugging Face Token'
                        : isVolcengineArk
                          ? 'Ark API Key'
                          : 'API Key'}
                    </span>
                    <Input
                      type="password"
                      value={draft.cloudEmbedding.apiKey}
                      onChange={(event) => updateCloudEmbedding({ apiKey: event.target.value })}
                      placeholder={
                        isHuggingFace ? 'hf_...' : isVolcengineArk ? 'your-ark-api-key' : 'sk-...'
                      }
                    />
                  </label>

                  <label
                    className={cn(
                      'flex flex-col gap-1.5',
                      (isHuggingFace || isVolcengineArk) && 'col-span-2'
                    )}
                  >
                    <span className="text-xs text-white/55">维度</span>
                    <Input
                      type="number"
                      value={draft.cloudEmbedding.dimensions ?? ''}
                      onChange={(event) =>
                        updateCloudEmbedding({
                          dimensions: event.target.value ? Number(event.target.value) : null
                        })
                      }
                      placeholder="除非服务要求固定维度，否则建议留空。"
                    />
                  </label>
                </div>
              </>
            )}

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

                <div className="grid grid-cols-1 gap-3">
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
        <SettingItem title="World TopK">
          <Input
            value={draft.worldTopK}
            onChange={(value) => {
              const numberValue = Number(value.target.value)
              isPositiveInteger(numberValue) && updateDraft({ worldTopK: numberValue })
            }}
          />
        </SettingItem>
        <SettingItem title="Memory TopK">
          <Input
            value={draft.memoryTopK}
            onChange={(value) => {
              const numberValue = Number(value.target.value)
              isPositiveInteger(numberValue) && updateDraft({ memoryTopK: numberValue })
            }}
          />
        </SettingItem>
      </SectionCard>

      <SectionCard title="索引状态">
        <div className="mb-3 rounded border border-white/10 bg-[rgb(4,4,4,0.5)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/80">当前设置：</span>
            <span className="rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-xs text-[#f2dfbd]">
              {getSelectedEmbeddingModeLabel(draft.retrievalMode)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <StatusCard
            title="世界知识索引"
            index={worldIndex}
            compatibility={worldCompatibility}
            metadataLabel="world 更新时间"
            metadataValue={new Date(worldIndex?.updatedAt || 0).toLocaleString()}
            emptyHint="如果你想让系统从世界知识库里做语义检索，需要先更新知识包并构建世界知识向量。"
          />
          <StatusCard
            title="角色记忆索引"
            index={memoryIndex}
            compatibility={memoryCompatibility}
            metadataLabel="已索引角色数"
            metadataValue={memoryIndex?.indexedCharacterCount}
            emptyHint="如果你想让系统从历史会话里做语义检索，需要先为当前角色或全部角色重建记忆。"
          />
        </div>

        {draft.retrievalMode !== 'string' &&
          (worldIndex?.availability === 'incompatible' ||
            memoryIndex?.availability === 'incompatible') && (
            <div className="mt-3 flex items-start gap-2 rounded border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                当前向量索引与正在使用的 embedding
                模型不一致。在完成重建前，系统会回退到字符串检索。
              </span>
            </div>
          )}
      </SectionCard>

      <SectionCard title="索引操作">
        <div className="mb-3 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="hidden rounded border border-[#e8c690]/40 bg-[rgb(4,4,4,0.5)] px-4 py-2 text-sm text-[#f2dfbd] transition-colors hover:bg-[#e8c690]/20 disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '保存记忆设置'}
          </button>
        </div>

        {operationTips.length > 0 && (
          <div className="mb-3 rounded border border-white/10 bg-[rgb(4,4,4,0.5)] px-4 py-3 text-xs leading-5 text-white/60">
            {operationTips.map((tip, index) => (
              <div key={index}>{tip}</div>
            ))}
          </div>
        )}

        <div className="mb-3">
          <TaskPanel tasks={tasks} buildLaunchNotice={buildLaunchNotice} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ActionCard
            icon={worldBundleBusy ? XCircle : Download}
            title="更新世界知识包"
            summary="从远端下载最新 world 压缩包，并覆盖本地已有数据。"
            guidance="首次缺少 world 内容时会自动准备；之后当远端版本更新时，也可以在这里手动刷新。"
            effect="仅更新 world 原始内容，不会自动生成向量索引。完成后如需向量检索，需再执行一次。"
            statusText={
              worldBundleBusy ? '更新中' : worldIndexNeedsBuild ? '建议先执行' : '按需执行'
            }
            tone={worldBundleBusy || worldIndexNeedsBuild ? 'highlight' : 'default'}
            disabled={worldBundleBusy ? !activeWorldBundleTaskId : false}
            disabledReason={worldBundleBusy ? '当前已有世界知识包更新任务在运行。' : undefined}
            onClick={
              worldBundleBusy && activeWorldBundleTaskId
                ? () => handleCancelTask(activeWorldBundleTaskId)
                : handleStartWorldBundleDownload
            }
          />
          <ActionCard
            icon={worldVectorPending ? XCircle : RefreshCw}
            title="构建世界知识向量"
            summary="把世界知识转换成可供语义检索的向量索引。"
            guidance="仅在使用向量检索时才需要执行；更新知识包后需要再构建。"
            effect="完成后，世界知识检索才能真正走向量语义匹配。"
            statusText={
              worldVectorPending ? '构建中' : worldIndexNeedsBuild ? '建议执行' : '可按需重建'
            }
            tone={worldVectorPending || worldIndexNeedsBuild ? 'highlight' : 'default'}
            disabled={
              (worldVectorPending && !activeWorldVectorTaskId) ||
              (!worldVectorPending && !vectorModeSelected)
            }
            disabledReason={
              worldVectorPending
                ? '当前已有世界知识向量构建任务在运行。'
                : !vectorModeSelected
                  ? '你当前使用的是字符串检索模式，暂时不需要构建向量索引。'
                  : undefined
            }
            onClick={
              worldVectorPending && activeWorldVectorTaskId
                ? () => handleCancelTask(activeWorldVectorTaskId)
                : handleStartWorldVectorBuild
            }
          />
          <ActionCard
            icon={characterMemoryPending && activeCharacterMemoryTaskId ? XCircle : RefreshCw}
            title="重建当前角色记忆"
            summary="只为当前选中的角色重新整理历史会话记忆。"
            guidance="当你只想修复或更新当前角色的长期记忆检索时，用它最快。"
            effect="只影响当前角色，不会处理其他角色。"
            statusText={
              !activateChar?.id
                ? '需先选择角色'
                : characterMemoryPending
                  ? '构建中'
                  : shouldSuggestMemoryBuild
                    ? '建议执行'
                    : '适合局部更新'
            }
            tone={
              activateChar?.id && !characterMemoryPending && shouldSuggestMemoryBuild
                ? 'highlight'
                : 'default'
            }
            disabled={
              !activateChar?.id ||
              !vectorModeSelected ||
              (characterMemoryPending && !activeCharacterMemoryTaskId)
            }
            disabledReason={
              !activateChar?.id
                ? '当前没有选中角色，无法只重建单个角色记忆。'
                : characterMemoryPending
                  ? '当前已有角色记忆构建任务在运行。'
                  : !vectorModeSelected
                    ? '你当前使用的是字符串检索模式，暂时不需要构建记忆向量。'
                    : undefined
            }
            onClick={
              characterMemoryPending && activeCharacterMemoryTaskId
                ? () => handleCancelTask(activeCharacterMemoryTaskId)
                : handleStartCharacterMemoryBuild
            }
          />
          <ActionCard
            icon={allMemoryPending && activeAllMemoryTaskId ? XCircle : RefreshCw}
            title="重建全部角色记忆"
            summary="为所有角色统一重建长期记忆向量索引。"
            guidance="当你调整了 embedding 配置、切换了模型，或想一次性修复所有角色时使用。"
            effect="耗时通常比单角色更长，但能保证所有角色索引一致。"
            statusText={
              allMemoryPending ? '构建中' : shouldSuggestMemoryBuild ? '建议执行' : '适合全量更新'
            }
            tone={allMemoryPending || shouldSuggestMemoryBuild ? 'highlight' : 'default'}
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
                    ? '你当前使用的是字符串检索模式，暂时不需要构建记忆向量。'
                    : undefined
            }
            onClick={
              allMemoryPending && activeAllMemoryTaskId
                ? () => handleCancelTask(activeAllMemoryTaskId)
                : handleStartAllMemoryBuild
            }
          />
        </div>
      </SectionCard>
    </div>
  )
}
