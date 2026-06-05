import { ChevronDown } from 'lucide-react'
import type { ReactElement } from 'react'
import { cn } from '../../../utils'
import { inputClassName } from './helpers'

export function ModelSelectorField({
  model,
  placeholder,
  hasModelOptions,
  modelDropdownOpen,
  visibleModelOptions,
  onChange,
  onToggleDropdown,
  onOpenDropdown,
  onCloseDropdown,
  onSelectModel
}: {
  model: string
  placeholder: string
  hasModelOptions: boolean
  modelDropdownOpen: boolean
  visibleModelOptions: string[]
  onChange: (value: string) => void
  onToggleDropdown: () => void
  onOpenDropdown: () => void
  onCloseDropdown: () => void
  onSelectModel: (model: string) => void
}): ReactElement {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-white/55">模型 ID</span>
      <span className="relative">
        <input
          type="text"
          value={model}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (hasModelOptions) {
              onOpenDropdown()
            }
          }}
          onBlur={() => window.setTimeout(onCloseDropdown, 120)}
          className={cn(inputClassName(), hasModelOptions ? 'w-full pr-10' : 'w-full')}
          placeholder={placeholder}
        />
        {hasModelOptions && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleDropdown}
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center text-white/45 transition-colors hover:text-white/80"
            title="浠庡彲鐢ㄦā鍨嬪垪琛ㄩ€夋嫨"
          >
            <ChevronDown
              className={cn('size-4 transition-transform', modelDropdownOpen && 'rotate-180')}
            />
          </button>
        )}

        {hasModelOptions && modelDropdownOpen && (
          <div className="absolute top-10 right-0 left-0 z-10 max-h-44 overflow-hidden rounded border border-white/15 bg-[#171717] shadow-xl">
            {visibleModelOptions.length > 0 ? (
              <div className="max-h-44 overflow-y-auto py-1">
                {visibleModelOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelectModel(option)}
                    className={cn(
                      'block w-full truncate px-3 py-2 text-left text-xs transition-colors hover:bg-white/10 hover:text-[#e8c690]',
                      option === model ? 'bg-white/10 text-[#e8c690]' : 'text-white/70'
                    )}
                    title={option}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-2 text-xs text-white/40">
                娌℃湁鍖归厤鐨勫彲鐢ㄦā鍨嬶紝鍙户缁墜鍔ㄨ緭鍏?
              </div>
            )}
          </div>
        )}
      </span>
    </label>
  )
}
