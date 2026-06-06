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
import type { CloudEmbeddingSettings } from '@shared/memory-settings'
import { HUGGING_FACE_INFERENCE_PROVIDERS } from '@shared/memory-settings'
import { useMemorySettingsDraft } from '@renderer/hooks/useMemorySettingsDraft'
import { useMemoryTabActions } from '@renderer/hooks/useMemoryTabActions'
import { useMemoryTabLifecycle } from '@renderer/hooks/useMemoryTabLifecycle'
import { useMemoryTabViewState } from '@renderer/hooks/useMemoryTabViewState'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useMemoryStore } from '@renderer/stores/memoryStore'
import { cn } from '@renderer/utils'
import { ActionCard } from './memory/ActionCard'
import { CLOUD_PROVIDER_OPTIONS, RETRIEVAL_OPTIONS } from './memory/constants'
import { EmbeddingTestResultBanner } from './memory/EmbeddingTestResultBanner'
import {
  cardClassName,
  getDefaultCloudBaseUrl,
  getDefaultCloudModel,
  getSelectedEmbeddingModeLabel,
  inputClassName
} from './memory/helpers'
import { LocalModelCard } from './memory/LocalModelCard'
import { NumberInput } from './memory/NumberInput'
import { StatusCard } from './memory/StatusCard'
import { TaskPanel } from './memory/TaskPanel'
import { Switch } from '../switch'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '../field'
import { useShallow } from 'zustand/react/shallow'

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
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto px-6 py-4">
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

      <section className={cardClassName()}>
        <div className="mb-3">
          <h2 className="text-base font-medium text-white/90">检索模式</h2>
          <p className="mt-1 text-xs text-white/45">选择运行时如何检索世界知识和长期记忆。</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {RETRIEVAL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateDraft({ retrievalMode: option.value })}
              className={cn(
                'rounded border px-3 py-3 text-left transition-colors',
                draft.retrievalMode === option.value
                  ? 'border-[#e8c690]/60 bg-white/10 text-[#e8c690]'
                  : 'border-white/10 bg-black/20 text-white/70 hover:bg-white/5'
              )}
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className="mt-1 text-xs leading-5 text-white/45">{option.description}</div>
            </button>
          ))}
        </div>

        <FieldGroup className="mt-4 grid w-full grid-cols-2 gap-3">
          <FieldLabel htmlFor="switch-world" className="border-none">
            <Field
              orientation="horizontal"
              className="h-fit rounded border-0 border-white/10 bg-black/20"
            >
              <FieldContent>
                <FieldTitle className="text-sm text-white/80">启用世界知识检索</FieldTitle>
                <FieldDescription>
                  从内置 world 知识库中检索相关内容，并追加到提示词上下文里。
                </FieldDescription>
              </FieldContent>
              <Switch
                id="switch-world"
                checked={draft.worldSearchEnabled}
                onCheckedChange={(checked) => updateDraft({ worldSearchEnabled: checked })}
                className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
              />
            </Field>
          </FieldLabel>
          <FieldLabel htmlFor="switch-memory" className="border-none">
            <Field
              orientation="horizontal"
              className="h-fit rounded border border-white/10 bg-black/20"
            >
              <FieldContent>
                <FieldTitle className="text-sm text-white/80">启用长期记忆检索</FieldTitle>
                <FieldDescription>从历史会话整理出的长期记忆里检索相关内容。</FieldDescription>
              </FieldContent>
              <Switch
                id="switch-memory"
                checked={draft.memorySearchEnabled}
                onCheckedChange={(checked) => updateDraft({ memorySearchEnabled: checked })}
                className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
              />
            </Field>
          </FieldLabel>
        </FieldGroup>
      </section>

      {draft.retrievalMode !== 'string' && (
        <section className={cardClassName()}>
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

          {draft.retrievalMode === 'vector-cloud' ? (
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
                  <input
                    value={draft.cloudEmbedding.provider}
                    className={inputClassName()}
                    disabled
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-white/55">模型</span>
                  <input
                    value={draft.cloudEmbedding.model}
                    onChange={(event) => updateCloudEmbedding({ model: event.target.value })}
                    className={inputClassName()}
                    placeholder={getDefaultCloudModel(draft.cloudEmbedding.provider)}
                  />
                </label>

                {isHuggingFace && (
                  <label className="col-span-2 flex flex-col gap-1.5">
                    <span className="text-xs text-white/55">推理提供方</span>
                    <select
                      value={draft.cloudEmbedding.inferenceProvider || 'hf-inference'}
                      onChange={(event) =>
                        updateCloudEmbedding({
                          inferenceProvider: event.target
                            .value as CloudEmbeddingSettings['inferenceProvider']
                        })
                      }
                      className={inputClassName()}
                    >
                      {HUGGING_FACE_INFERENCE_PROVIDERS.map((option) => (
                        <option key={option} value={option} className="bg-[#1b1b1b]">
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {!isHuggingFace && (
                  <label className="col-span-2 flex flex-col gap-1.5">
                    <span className="text-xs text-white/55">Base URL</span>
                    <input
                      value={draft.cloudEmbedding.baseUrl}
                      onChange={(event) => updateCloudEmbedding({ baseUrl: event.target.value })}
                      className={inputClassName()}
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
                  <input
                    type="password"
                    value={draft.cloudEmbedding.apiKey}
                    onChange={(event) => updateCloudEmbedding({ apiKey: event.target.value })}
                    className={inputClassName()}
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
                  <input
                    type="number"
                    value={draft.cloudEmbedding.dimensions ?? ''}
                    onChange={(event) =>
                      updateCloudEmbedding({
                        dimensions: event.target.value ? Number(event.target.value) : null
                      })
                    }
                    className={inputClassName()}
                    placeholder="除非服务要求固定维度，否则建议留空。"
                  />
                </label>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <FieldLabel htmlFor="switch-local-gpu" className="border-none">
                <Field
                  orientation="horizontal"
                  className="h-fit rounded border-0 border-white/10 bg-black/20"
                >
                  <FieldContent>
                    <FieldTitle className="text-sm text-white/80">
                      使用 GPU 运行本地 embedding
                    </FieldTitle>
                    <FieldDescription>
                      <span>开启后会优先使用 GPU，如果当前环境不支持，则会自动切换到 CPU。</span>
                      {hardware.gpuName && <span>当前 GPU：{hardware.gpuName}</span>}
                    </FieldDescription>
                  </FieldContent>
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
                </Field>
              </FieldLabel>
              <FieldGroup className="mt-4 w-full gap-3">
                <FieldLabel htmlFor="switch-mirror" className="border-none">
                  <Field
                    orientation="horizontal"
                    className="h-fit rounded border-0 border-white/10 bg-black/20"
                  >
                    <FieldContent>
                      <FieldTitle className="text-sm text-white/80">
                        使用 Hugging Face 镜像下载本地模型
                      </FieldTitle>
                    </FieldContent>
                    <Switch
                      id="switch-mirror"
                      checked={draft.localEmbedding.useHuggingFaceMirror}
                      onCheckedChange={(checked) =>
                        updateDraft({
                          localEmbedding: { ...draft.localEmbedding, useHuggingFaceMirror: checked }
                        })
                      }
                      className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
                    />
                  </Field>
                </FieldLabel>
              </FieldGroup>

              <label className="col-span-2 flex flex-col gap-1.5">
                <span className="text-xs text-white/55">Hugging Face 镜像地址</span>
                <input
                  value={draft.localEmbedding.huggingFaceMirrorUrl}
                  onChange={(event) =>
                    updateDraft({
                      localEmbedding: {
                        ...draft.localEmbedding,
                        huggingFaceMirrorUrl: event.target.value
                      }
                    })
                  }
                  className={inputClassName()}
                  disabled={!draft.localEmbedding.useHuggingFaceMirror}
                  placeholder="https://hf-mirror.com"
                />
              </label>

              <NumberInput
                label="Local Embedding Batch Size"
                value={draft.localEmbedding.batchSize}
                onChange={(value) =>
                  updateDraft({
                    localEmbedding: {
                      ...draft.localEmbedding,
                      batchSize: value
                    }
                  })
                }
              />

              <div className="grid grid-cols-2 gap-3">
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

      <section className={cardClassName()}>
        <div className="mb-3">
          <h2 className="text-base font-medium text-white/90">记忆范围</h2>
          <p className="mt-1 text-xs text-white/45">
            控制近期消息窗口大小，以及同一角色是否跨会话共享长期记忆。
          </p>
        </div>

        <div className="grid grid-cols-2 items-start gap-3">
          <FieldGroup className="col-span-2 w-full gap-3">
            <FieldLabel htmlFor="switch-shareMemory" className="border-none">
              <Field
                orientation="horizontal"
                className="h-fit rounded border-0 border-white/10 bg-black/20"
              >
                <FieldContent>
                  <FieldTitle className="text-sm text-white/80">同一角色跨会话共享记忆</FieldTitle>
                  <FieldDescription>
                    开启后，同一角色名下的不同会话会共享同一套长期记忆索引。
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="switch-shareMemory"
                  checked={draft.crossSessionCharacterMemory}
                  onCheckedChange={(checked) =>
                    updateDraft({ crossSessionCharacterMemory: checked })
                  }
                  className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
                />
              </Field>
            </FieldLabel>
          </FieldGroup>

          <NumberInput
            label="近期消息数量"
            value={draft.recentMessageCount}
            onChange={(value) => updateDraft({ recentMessageCount: value })}
          />
          <NumberInput
            label="长期记忆摘要触发轮数"
            value={draft.summaryTriggerTurns}
            onChange={(value) => updateDraft({ summaryTriggerTurns: value })}
          />
          <NumberInput
            label="World TopK"
            value={draft.worldTopK}
            onChange={(value) => updateDraft({ worldTopK: value })}
          />
          <NumberInput
            label="Memory TopK"
            value={draft.memoryTopK}
            onChange={(value) => updateDraft({ memoryTopK: value })}
          />
        </div>
      </section>

      <section className={cardClassName()}>
        <div className="mb-3">
          <h2 className="text-base font-medium text-white/90">索引状态</h2>
          <p className="mt-1 text-xs text-white/45">
            这里会告诉你当前实际在用哪种检索方式，以及世界知识和角色记忆索引是否已经准备好。
          </p>
        </div>

        <div className="mb-3 rounded border border-white/10 bg-black/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/80">当前设置：</span>
            <span className="rounded border border-[#e8c690]/30 bg-[#e8c690]/10 px-2 py-1 text-xs text-[#f2dfbd]">
              {getSelectedEmbeddingModeLabel(draft.retrievalMode)}
            </span>
          </div>
          <div className="mt-2 text-xs leading-5 text-white/55">
            {draft.retrievalMode === 'string'
              ? '你现在没有依赖向量索引，系统将使用字符串匹配。即使索引未构建，也不会影响基础检索。'
              : '你现在希望使用向量检索。只有当对应索引状态为“可用”且与当前 embedding 配置兼容时，系统才会真正使用向量检索。'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
      </section>

      <section className={cardClassName()}>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-white/90">索引操作</h2>
            <p className="mt-1 text-xs text-white/45">
              每个操作都对应不同的数据准备阶段。先看说明，再决定是否需要执行。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="hidden rounded border border-[#e8c690]/40 bg-[#e8c690]/15 px-4 py-2 text-sm text-[#f2dfbd] transition-colors hover:bg-[#e8c690]/20 disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '保存记忆设置'}
          </button>
        </div>

        {operationTips.length > 0 && (
          <div className="mb-3 rounded border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/60">
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
      </section>
    </div>
  )
}
