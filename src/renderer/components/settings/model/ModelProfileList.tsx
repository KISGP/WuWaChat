import { AlertCircle, Check, Plus, Server, Trash2 } from 'lucide-react'
import type { MouseEvent, ReactElement } from 'react'
import type { ModelProfile } from '@shared/chat'
import type { OpenAIProfileConnectionTestResult } from '@shared/model-settings'
import { cn } from '@renderer/utils'

/**
 * @description 渲染模型配置页中的 Profile 切换列表。
 * @param props.profiles 可选的模型配置集合。
 * @param props.currentProfileId 当前激活的配置 ID。
 * @param props.testResults 各配置最近一次连通性测试结果。
 * @param props.onAddProfile 新增配置时触发。
 * @param props.onSelectProfile 切换配置时触发。
 * @param props.onDeleteProfile 点击删除按钮时触发。
 * @returns 模型 Profile 列表。
 */
export function ModelProfileList({
  profiles,
  currentProfileId,
  testResults,
  onAddProfile,
  onSelectProfile,
  onDeleteProfile
}: {
  profiles: ModelProfile[]
  currentProfileId?: string
  testResults: Record<string, OpenAIProfileConnectionTestResult>
  onAddProfile: () => void
  onSelectProfile: (profileId: string) => void
  onDeleteProfile: (profile: ModelProfile) => void
}): ReactElement {
  /**
   * @description 处理删除按钮点击，阻止冒泡触发卡片选中。
   * @param event 当前按钮点击事件。
   * @param profile 需要删除的模型配置。
   */
  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>, profile: ModelProfile): void => {
    event.stopPropagation()
    onDeleteProfile(profile)
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {profiles.map((profile) => {
        const result = testResults[profile.id]

        return (
          <div key={profile.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelectProfile(profile.id)}
              className={cn(
                'flex min-h-20 w-full items-center gap-3 rounded border px-3 py-3 pr-10 text-left transition-colors',
                currentProfileId === profile.id
                  ? 'border-[#e8c690]/60 bg-[#f5e8cd]/10 text-[#f2dfbd] shadow-[0_8px_24px_rgba(232,198,144,0.08)]'
                  : 'border-white/10 bg-black/20 text-white/70 hover:bg-white/5'
              )}
            >
              <Server className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{profile.name}</span>
                <span className="mt-1 block truncate text-xs text-white/40">
                  {profile.model || '未设置模型'}
                </span>
              </span>
              {result?.ok && <Check className="size-4 shrink-0 text-green-400" />}
              {result && !result.ok && <AlertCircle className="size-4 shrink-0 text-red-400" />}
            </button>

            <button
              type="button"
              onClick={(event) => handleDeleteClick(event, profile)}
              className="absolute top-2 right-2 flex size-7 items-center justify-center rounded border border-red-400/20 bg-black/35 text-red-200 opacity-0 transition group-hover:opacity-100 hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-100 focus-visible:opacity-100"
              title="删除模型配置"
              aria-label={`删除模型配置 ${profile.name}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={onAddProfile}
        className={cn(
          'flex min-h-20 w-fit items-center gap-3 rounded border border-white/10 bg-black/20 px-3 py-3 text-left text-white/70 transition-colors hover:bg-white/5'
        )}
      >
        <span className="min-w-0 flex-1">
          <Plus className="size-6" />
        </span>
      </button>
    </div>
  )
}
