import { AlertCircle, Check, Plus, Server } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ModelProfile } from '@shared/ai'
import type { OpenAIProfileConnectionTestResult } from '@shared/model-settings'
import { cn } from '@renderer/utils'

export function ModelProfileList({
  profiles,
  currentProfileId,
  testResults,
  onAddProfile,
  onSelectProfile
}: {
  profiles: ModelProfile[]
  currentProfileId?: string
  testResults: Record<string, OpenAIProfileConnectionTestResult>
  onAddProfile: () => void
  onSelectProfile: (profileId: string) => void
}): ReactElement {
  return (
    <div className="flex w-1/3 flex-col border-r border-white/10 p-2 pr-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm text-white/70">模型配置</span>
        <button
          type="button"
          onClick={onAddProfile}
          className="flex size-8 items-center justify-center rounded border border-white/15 bg-white/5 text-white/80 transition-colors hover:border-[#e8c690]/60 hover:text-[#e8c690]"
          title="新增模型配置"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {profiles.map((profile) => {
          const result = testResults[profile.id]

          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onSelectProfile(profile.id)}
              className={cn(
                'flex min-h-16 items-center gap-3 rounded border px-3 py-2 text-left transition-colors',
                currentProfileId === profile.id
                  ? 'border-[#e8c690]/60 bg-white/10 text-[#e8c690]'
                  : 'border-white/10 text-white/70 hover:bg-white/5'
              )}
            >
              <Server className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{profile.name}</span>
                <span className="block truncate text-xs text-white/40">
                  {profile.model || '未设置模型'}
                </span>
              </span>
              {result?.ok && <Check className="size-4 shrink-0 text-green-400" />}
              {result && !result.ok && <AlertCircle className="size-4 shrink-0 text-red-400" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
