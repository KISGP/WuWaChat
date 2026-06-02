import { Trash2 } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ModelProfile } from '../../../../shared/ai'
import { PROVIDER_LABELS } from '../../../../shared/model-settings'

export function ModelDeleteModal({
  target,
  onCancel,
  onConfirm
}: {
  target: ModelProfile
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded border border-white/15 bg-[#171717] p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded border border-red-400/30 bg-red-500/10 text-red-300">
            <Trash2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-white/90">鍒犻櫎妯″瀷閰嶇疆</h3>
            <p className="mt-2 text-sm leading-5 text-white/55">
              纭畾瑕佸垹闄も€渰{target.name}鈥濆悧锛熸鎿嶄綔浼氱Щ闄ょ
              {` ${PROVIDER_LABELS[target.provider]} `}
              Profile 鐨勬湰鍦伴厤缃€?
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded border border-white/15 bg-white/5 px-4 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            鍙栨秷
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded border border-red-400/40 bg-red-500/15 px-4 text-sm text-red-200 transition-colors hover:bg-red-500/25"
          >
            鍒犻櫎
          </button>
        </div>
      </div>
    </div>
  )
}
