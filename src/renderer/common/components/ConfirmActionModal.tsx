import { Trash2 } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

export type ConfirmActionModalProps = {
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  confirmDisabled?: boolean
  cancelDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  confirmDisabled = false,
  cancelDisabled = false,
  onConfirm,
  onCancel
}: ConfirmActionModalProps): ReactElement {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded border border-white/15 bg-[#171717] p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded border border-red-400/30 bg-red-500/10 text-red-300">
            <Trash2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-white/90">{title}</h3>
            <div className="mt-2 text-sm leading-5 text-white/55">{description}</div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelDisabled}
            className="h-9 rounded border border-white/15 bg-white/5 px-4 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="h-9 rounded border border-red-400/40 bg-red-500/15 px-4 text-sm text-red-200 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
