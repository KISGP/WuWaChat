import type { ReactElement } from 'react'
import { type LucideIcon, InfoIcon, Clock10Icon, BugIcon } from 'lucide-react'
import { cn } from '../../../utils'

export function ActionCard({
  icon: Icon,
  title,
  summary,
  guidance,
  effect,
  statusText,
  tone,
  disabled,
  disabledReason,
  onClick
}: {
  icon: LucideIcon
  title: string
  summary: string
  guidance: string
  effect: string
  statusText: string
  tone: 'default' | 'highlight'
  disabled?: boolean
  disabledReason?: string
  onClick: () => Promise<void>
}): ReactElement {
  return (
    <div
      className={cn(
        'rounded border p-4',
        tone === 'highlight'
          ? 'border-[#e8c690]/35 bg-[#e8c690]/[0.06]'
          : 'border-white/10 bg-black/20'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded border',
              tone === 'highlight'
                ? 'border-[#e8c690]/30 bg-[#e8c690]/10 text-[#f2dfbd]'
                : 'border-white/10 bg-white/5 text-white/70'
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white/90">{title}</div>
            <div className="mt-1 text-xs leading-5 text-white/55">{summary}</div>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded px-2 py-1 text-[11px]',
            tone === 'highlight' ? 'bg-[#e8c690]/15 text-[#f2dfbd]' : 'bg-white/5 text-white/60'
          )}
        >
          {statusText}
        </span>
      </div>

      <div className="mt-3 h-20 space-y-2 text-xs leading-5 text-white/55">
        <div className="flex items-center gap-1">
          <Clock10Icon className="my-auto size-4" /> <span>{guidance}</span>
        </div>
        <div className="flex items-center gap-1">
          <InfoIcon className="size-4" /> <span>{effect}</span>
        </div>
        {disabledReason && (
          <div className="flex items-center gap-1">
            <BugIcon className="size-4 text-amber-200/90" />{' '}
            <span className="text-amber-200/90">{disabledReason}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void onClick()}
        disabled={disabled}
        className={cn(
          'mt-4 flex w-full items-center justify-center gap-2 rounded border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
          tone === 'highlight'
            ? 'border-[#e8c690]/40 bg-[#e8c690]/12 text-[#f2dfbd] hover:bg-[#e8c690]/20'
            : 'border-white/15 bg-black/20 text-white/75 hover:bg-white/5'
        )}
      >
        <Icon className="size-4" />
        {title}
      </button>
    </div>
  )
}
