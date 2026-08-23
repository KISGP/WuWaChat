import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ModelProfile } from '@shared/chat'
import { PARAMETER_FIELDS } from './helpers'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

const REASONING_EFFORT_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' }
] as const

/**
 * @description Renders collapsible generation parameters for the selected model profile.
 * @param props The expanded state, profile values, and profile update handlers.
 * @returns The advanced model configuration section.
 */
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
              <Input
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
              />
            </label>
          ))}
          {profile.provider === 'openai' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/55">思考等级</span>
              <Select
                value={profile.reasoningEffort}
                onValueChange={(value) =>
                  onUpdate({
                    reasoningEffort: value as ModelProfile['reasoningEffort']
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {REASONING_EFFORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-white/35">仅推理模型支持；自动不会传递该参数。</span>
            </label>
          )}
        </div>
      )}
    </section>
  )
}
