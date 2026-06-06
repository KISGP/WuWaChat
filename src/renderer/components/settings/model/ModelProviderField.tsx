import { ChevronDown } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ModelProfile } from '@shared/ai'
import { PROVIDER_LABELS } from '@shared/model-settings'
import { cn } from '@renderer/utils'
import { PROVIDER_OPTIONS } from './helpers'

export function ModelProviderField({
  profile,
  providerDropdownOpen,
  onToggleDropdown,
  onCloseDropdown,
  onOpenDropdown,
  onSelectProvider
}: {
  profile: ModelProfile
  providerDropdownOpen: boolean
  onToggleDropdown: () => void
  onCloseDropdown: () => void
  onOpenDropdown: () => void
  onSelectProvider: (provider: ModelProfile['provider']) => void
}): ReactElement {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-white/55">Provider</span>
      <span className="relative">
        <input
          type="text"
          readOnly
          value={PROVIDER_LABELS[profile.provider]}
          onFocus={onOpenDropdown}
          onBlur={() => window.setTimeout(onCloseDropdown, 120)}
          className="h-9 w-full rounded border border-white/15 bg-black/35 px-3 pr-10 text-sm text-white transition-colors outline-none placeholder:text-white/30 focus:border-[#e8c690]"
        />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleDropdown}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center text-white/45 transition-colors hover:text-white/80"
          title="閫夋嫨 Provider"
        >
          <ChevronDown
            className={cn('size-4 transition-transform', providerDropdownOpen && 'rotate-180')}
          />
        </button>

        {providerDropdownOpen && (
          <div className="absolute top-10 right-0 left-0 z-10 overflow-hidden rounded border border-white/15 bg-[#171717] shadow-xl">
            <div className="py-1">
              {PROVIDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectProvider(option.value as ModelProfile['provider'])}
                  className={cn(
                    'block w-full truncate px-3 py-2 text-left text-xs transition-colors hover:bg-white/10 hover:text-[#e8c690]',
                    option.value === profile.provider
                      ? 'bg-white/10 text-[#e8c690]'
                      : 'text-white/70'
                  )}
                  title={option.label}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </span>
    </label>
  )
}
