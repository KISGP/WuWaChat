import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ModelProfile } from '@shared/chat'
import { PARAMETER_FIELDS, inputClassName } from './helpers'

export function ModelAdvancedSection({
  advancedOpen,
  profile,
  onToggle,
  onUpdate
}: {
  advancedOpen: boolean
  profile: ModelProfile
  onToggle: () => void
  onUpdate: (patch: Partial<ModelProfile>) => void
}): ReactElement {
  return (
    <section className="overflow-hidden rounded border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-10 w-full items-center justify-between px-3 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white/90"
      >
        <span className="flex items-center gap-2">
          {advancedOpen ? (
            <ChevronDown className="size-4 text-white/50" />
          ) : (
            <ChevronRight className="size-4 text-white/50" />
          )}
          高级设置
        </span>
        <span className="text-xs text-white/35">Temperature / Max Tokens</span>
      </button>

      {advancedOpen && (
        <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-3">
          {PARAMETER_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1.5">
              <span className="text-xs text-white/55">{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={profile[field.key]}
                onChange={(event) =>
                  onUpdate({
                    [field.key]: Number(event.target.value)
                  })
                }
                className={inputClassName()}
              />
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
