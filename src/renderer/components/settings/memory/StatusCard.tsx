import { Database } from 'lucide-react'
import type { ReactElement } from 'react'
import type {
  CharacterMemoryIndexStatus,
  EmbeddingCompatibilityStatus,
  WorldIndexStatus
} from '@shared/memory-settings'
import { cn } from '@renderer/utils'
import {
  formatDateTime,
  getAvailabilityMeta,
  getRuntimeModeMeta,
  getStatusCardEmptyHint
} from './helpers'
import { InfoPill } from './InfoPill'

export function StatusCard({
  title,
  index,
  compatibility,
  metadataLabel,
  metadataValue,
  emptyHint
}: {
  title: string
  index: WorldIndexStatus | CharacterMemoryIndexStatus | null
  compatibility?: EmbeddingCompatibilityStatus
  metadataLabel: string
  metadataValue?: string | number | null
  emptyHint: string
}): ReactElement {
  const availabilityMeta = getAvailabilityMeta(index?.availability, index)
  const runtimeMeta = getRuntimeModeMeta(index?.runtimeMode)
  const derivedEmptyHint = getStatusCardEmptyHint(index, emptyHint)
  const derivedMetadataLabel = index?.scope === 'world' ? 'world 更新时间' : metadataLabel
  const compatibilityMessage =
    compatibility && (index?.availability === 'ready' || index?.availability === 'incompatible')
      ? compatibility.compatible
        ? '当前索引与正在使用的 embedding 配置一致。'
        : compatibility.message
      : null

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

      <div className="mt-3 rounded border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-white/60">
        <div>{availabilityMeta.description}</div>
        <div className="mt-1 text-white/45">{runtimeMeta.description}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/60">
        <InfoPill label="当前运行" value={runtimeMeta.label} />
        <InfoPill label={derivedMetadataLabel} value={metadataValue ?? '-'} />
        <InfoPill label="索引条目" value={index?.entryCount ?? '-'} />
        <InfoPill label="最近构建" value={formatDateTime(index?.builtAt)} />
      </div>

      <div className="mt-3 rounded border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/55">
        <div>向量模型：{index?.fingerprint?.model || '尚未生成'}</div>
        {!index?.fingerprint?.model && <div className="mt-1">{derivedEmptyHint}</div>}
      </div>

      {compatibilityMessage && (
        <div className="mt-3 rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/60">
          {compatibilityMessage}
        </div>
      )}
    </div>
  )
}
