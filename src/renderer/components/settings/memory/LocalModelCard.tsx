import { Download, Trash2 } from 'lucide-react'
import type { ReactElement } from 'react'
import type { LocalEmbeddingCatalogItem } from '@shared/memory-settings'
import type { LocalModelUiState } from '@renderer/stores/memoryStore'
import { cn } from '@renderer/utils'
import { Progress } from '@renderer/components/progress'
import { renderStructuredMessage } from './helpers'
import { Badge } from '@renderer/components/badge'

export function LocalModelCard({
  model,
  uiState,
  onDownload,
  onSelect,
  onRemove
}: {
  model: LocalEmbeddingCatalogItem
  uiState?: LocalModelUiState
  onDownload: (modelId: string) => Promise<void>
  onSelect: (modelId: string) => Promise<void>
  onRemove: (modelId: string) => Promise<void>
}): ReactElement {
  const isDownloading = uiState?.phase === 'downloading'
  const isDownloadError = uiState?.phase === 'error'
  const isJustInstalled = uiState?.phase === 'success' && model.status !== 'installed'
  const isInstalled = model.status === 'installed'

  return (
    <div
      className={cn(
        'rounded border p-4 transition-colors',
        model.isSelected ? 'border-[#e8c690]/50 bg-[#e8c690]/10' : 'border-white/10 bg-black/20'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-white/90">{model.label}</h3>
          </div>
          <div className="mt-1 text-xs text-white/45">{model.description}</div>
          <div className="mt-2 flex flex-wrap">
            <Badge variant="secondary" className="bg-secondary/20 scale-90">
              {model.dimensions} 维
            </Badge>
            <Badge variant="secondary" className="bg-secondary/20 scale-90">
              {model.sizeMb} MB
            </Badge>
            <Badge variant="secondary" className="bg-secondary/20 scale-90">
              {model.speedTier}
            </Badge>
            <Badge variant="secondary" className="bg-secondary/20 scale-90">
              {model.languages.join(', ')}
            </Badge>
          </div>

          {model.validationMessage && !isDownloadError && (
            <div className="mt-2 text-xs text-red-300">{model.validationMessage}</div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {!isInstalled && !isJustInstalled && !isDownloading && (
            <button
              type="button"
              onClick={() => void onDownload(model.id)}
              className="flex items-center gap-2 rounded border border-white/15 bg-black/20 px-3 py-2 text-xs text-white/80 transition-colors hover:bg-white/5"
            >
              <Download className="size-4" />
              下载
            </button>
          )}
          {isJustInstalled && (
            <button
              type="button"
              disabled
              className="rounded border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 opacity-80"
            >
              已安装
            </button>
          )}
          {isInstalled && !model.isSelected && (
            <button
              type="button"
              onClick={() => void onSelect(model.id)}
              className="rounded border border-[#e8c690]/40 bg-[#e8c690]/15 px-3 py-2 text-xs text-[#f2dfbd] transition-colors hover:bg-[#e8c690]/20"
            >
              使用此模型
            </button>
          )}
          {model.status === 'installed' && (
            <button
              type="button"
              onClick={() => void onRemove(model.id)}
              className="flex items-center gap-2 rounded border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200 transition-colors hover:bg-red-500/15"
            >
              <Trash2 className="size-4" />
              删除
            </button>
          )}
        </div>
      </div>

      {isDownloading && uiState && (
        <div className="mt-3 space-y-2">
          <Progress value={uiState.progress} />
          <div className="flex items-center justify-between text-xs text-white/55">
            <span>{uiState.message}</span>
            <span>{uiState.progress}%</span>
          </div>
        </div>
      )}

      {isDownloadError && uiState && (
        <div className="mt-3 rounded border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <div className="mb-1 font-medium">{uiState.errorCode || '下载失败'}</div>
          <div className="space-y-1">
            {renderStructuredMessage(uiState.message).map((line, index) => (
              <div key={`${model.id}-${index}`}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
