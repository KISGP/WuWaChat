import { useEffect, useState, type ReactElement } from 'react'
import { ChevronDown, ChevronRight, Wifi } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useMemorySettingsDraft } from '@renderer/hooks/useMemorySettingsDraft'
import { useMemoryStore } from '@renderer/stores/memoryStore'
import { cn } from '@renderer/utils'
import { LocalModelCard } from '@renderer/components/settings/memory/LocalModelCard'
import { EmbeddingTestResultBanner } from '@renderer/components/settings/memory/EmbeddingTestResultBanner'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'

/**
 * @description Renders the shared local embedding model configuration and maintenance controls.
 * @returns The semantic model settings page.
 */
export function EmbeddingTab(): ReactElement {
  const {
    settings,
    hardware,
    localModels,
    localModelUiState,
    embeddingTestResult,
    refreshLocalModels,
    saveSettings,
    downloadLocalModel,
    selectLocalModel,
    removeLocalModel,
    clearLocalModelUiState,
    testEmbeddingConnection
  } = useMemoryStore(
    useShallow((state) => ({
      settings: state.settings,
      hardware: state.hardware,
      localModels: state.localModels,
      localModelUiState: state.localModelUiState,
      embeddingTestResult: state.embeddingTestResult,
      refreshLocalModels: state.refreshLocalModels,
      saveSettings: state.saveSettings,
      downloadLocalModel: state.downloadLocalModel,
      selectLocalModel: state.selectLocalModel,
      removeLocalModel: state.removeLocalModel,
      clearLocalModelUiState: state.clearLocalModelUiState,
      testEmbeddingConnection: state.testEmbeddingConnection
    }))
  )
  const { draft, autosaveState, flushPendingChanges, updateDraft } = useMemorySettingsDraft(
    settings,
    saveSettings
  )
  const [isTesting, setIsTesting] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [modelListOpen, setModelListOpen] = useState(false)
  const selectedLocalModel = localModels.find((model) => model.isSelected) || null
  const installedModelCount = localModels.filter((model) => model.status === 'installed').length

  useEffect(() => {
    void refreshLocalModels().catch((error) => {
      setOperationError(error instanceof Error ? error.message : String(error))
      console.error('Failed to load local embedding models', error)
    })
  }, [refreshLocalModels])

  /**
   * @description Saves pending embedding configuration before testing the selected embedding provider.
   */
  async function handleTestEmbedding(): Promise<void> {
    setIsTesting(true)
    setOperationError(null)
    try {
      await flushPendingChanges()
      await testEmbeddingConnection()
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error))
      console.error('Failed to test embedding connection', error)
    } finally {
      setIsTesting(false)
    }
  }

  /**
   * @description Downloads a local embedding model and selects it when no usable model is selected.
   * @param modelId The local embedding model identifier.
   */
  async function handleDownloadModel(modelId: string): Promise<void> {
    setOperationError(null)
    try {
      clearLocalModelUiState(modelId)
      await downloadLocalModel(modelId)
      if (draft.localEmbedding.model === modelId || !draft.localEmbedding.modelPath) {
        updateDraft({ localEmbedding: { ...draft.localEmbedding, model: modelId } })
      }
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error))
      console.error('Failed to download local embedding model', error)
    }
  }

  /**
   * @description Selects an installed local embedding model for future semantic operations.
   * @param modelId The local embedding model identifier.
   */
  async function handleSelectModel(modelId: string): Promise<void> {
    setOperationError(null)
    try {
      await selectLocalModel(modelId)
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error))
      console.error('Failed to select local embedding model', error)
    }
  }

  /**
   * @description Removes an installed local embedding model from the local cache.
   * @param modelId The local embedding model identifier.
   */
  async function handleRemoveModel(modelId: string): Promise<void> {
    setOperationError(null)
    try {
      await removeLocalModel(modelId)
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error))
      console.error('Failed to remove local embedding model', error)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 overflow-y-auto px-4 pb-3">
      <SectionCard title="共享本地语义模型">
        <section className="space-y-5 rounded bg-[rgba(16,16,16,0.3)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-medium text-white/90">模型与运行设置</h2>
              <p className="mt-1 text-xs text-white/45">
                用于长期记忆向量检索与 Lore 的任务级语义回退。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleTestEmbedding()}
              disabled={isTesting}
              className="flex items-center gap-2 rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
            >
              <Wifi className={cn('size-4', isTesting && 'animate-pulse')} />
              {isTesting ? '测试中...' : '测试 embedding'}
            </button>
          </div>
          <div className="space-y-4">
            <SettingItem
              title="使用 GPU 运行本地 embedding"
              description={`开启后优先使用 GPU；不支持时自动切换到 CPU。当前 GPU：${hardware.gpuName}`}
            >
              <Switch
                id="switch-local-gpu"
                checked={draft.localEmbedding.useGpu}
                onCheckedChange={(checked) =>
                  updateDraft({ localEmbedding: { ...draft.localEmbedding, useGpu: checked } })
                }
                className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
              />
            </SettingItem>
            <SettingItem
              title="使用 Hugging Face 镜像下载本地模型"
              description="开启后从 Hugging Face 镜像下载模型文件。"
            >
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
            </SettingItem>
            <SettingItem title="本地模型批处理大小" description="设置本地模型处理批次的大小。">
              <Input
                value={draft.localEmbedding.batchSize}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isInteger(value) && value > 0)
                    updateDraft({ localEmbedding: { ...draft.localEmbedding, batchSize: value } })
                }}
              />
            </SettingItem>
          </div>

          <Collapsible open={modelListOpen} onOpenChange={setModelListOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded border border-white/10 bg-black/20 px-4 py-3 text-left hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white/90">
                    本地 embedding 模型
                  </span>
                  <span className="mt-1 block truncate text-xs text-white/45">
                    当前：{selectedLocalModel?.label || '未选择模型'} · 已安装 {installedModelCount}
                    /{localModels.length}
                  </span>
                </span>
                {modelListOpen ? (
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
                    onDownload={handleDownloadModel}
                    onSelect={handleSelectModel}
                    onRemove={handleRemoveModel}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
          {operationError && <p className="text-xs leading-5 text-red-200">{operationError}</p>}
          {embeddingTestResult && <EmbeddingTestResultBanner result={embeddingTestResult} />}
          {autosaveState === 'error' && (
            <p className="text-xs text-red-200">
              语义模型设置保存失败，请在再次操作前检查设置服务。
            </p>
          )}
        </section>
      </SectionCard>
    </div>
  )
}
