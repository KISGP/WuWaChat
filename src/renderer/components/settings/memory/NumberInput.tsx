import type { ReactElement } from 'react'
import { inputClassName } from './helpers'

export function NumberInput({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (value: number) => void
}): ReactElement {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-white/55">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={inputClassName()}
      />
    </label>
  )
}
