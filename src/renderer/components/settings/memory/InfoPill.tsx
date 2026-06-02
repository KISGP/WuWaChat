import type { ReactElement } from 'react'

export function InfoPill({
  label,
  value
}: {
  label: string
  value: string | number
}): ReactElement {
  return (
    <div className="rounded border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[11px] text-white/35">{label}</div>
      <div className="mt-1 text-white/80">{value}</div>
    </div>
  )
}
