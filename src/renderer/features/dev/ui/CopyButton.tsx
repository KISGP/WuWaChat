import { Check, Copy } from 'lucide-react'
import type { ReactElement } from 'react'

type CopyButtonProps = {
  value: string
  copiedKey: string | null
  copyKey: string
  onCopy: (value: string, key: string) => void
}

/**
 * @description Renders a compact action for copying diagnostic content.
 * @param props Copy state and callback details.
 * @returns Copy action button.
 */
export function CopyButton({
  value,
  copiedKey,
  copyKey,
  onCopy
}: CopyButtonProps): ReactElement {
  const copied = copiedKey === copyKey

  return (
    <button
      type="button"
      onClick={() => onCopy(value, copyKey)}
      title={copied ? '已复制' : '复制'}
      aria-label={copied ? '已复制' : '复制'}
      className="flex size-7 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/8 hover:text-white"
    >
      {copied ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}
    </button>
  )
}
