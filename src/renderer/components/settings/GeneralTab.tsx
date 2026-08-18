import type { ReactElement } from 'react'
import {
  MAX_MESSAGE_COLLAPSE_LINE_COUNT,
  MIN_MESSAGE_COLLAPSE_LINE_COUNT,
  type AnimationPreference
} from '@shared/app-settings'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { useAppSettingsStore } from '@renderer/stores/appSettingsStore'

const ANIMATION_OPTIONS: { value: AnimationPreference; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'enabled', label: '开启' },
  { value: 'disabled', label: '关闭' }
]

/**
 * @description 渲染应用通用设置，包括全局动画播放策略。
 * @returns 通用设置页内容。
 */
export function GeneralTab(): ReactElement {
  const animationPreference = useAppSettingsStore((state) => state.settings.animationPreference)
  const setAnimationPreference = useAppSettingsStore((state) => state.setAnimationPreference)
  const messageCollapseLineCount = useAppSettingsStore(
    (state) => state.settings.messageCollapseLineCount
  )
  const setMessageCollapseLineCount = useAppSettingsStore(
    (state) => state.setMessageCollapseLineCount
  )

  return (
    <div className="h-full overflow-y-auto px-4">
      <SectionCard title="动效">
        <SettingItem
          title="界面动画"
          description="关闭后，界面会直接切换到目标状态。系统的减少动态效果偏好始终优先。"
        >
          <div
            role="radiogroup"
            aria-label="界面动画"
            className="flex overflow-hidden rounded border border-white/15"
          >
            {ANIMATION_OPTIONS.map((option) => {
              const isSelected = option.value === animationPreference
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => void setAnimationPreference(option.value)}
                  className={`min-w-20 border-r border-white/15 px-3 py-2 text-sm transition-colors last:border-r-0 ${isSelected ? 'bg-[#e8c690] text-[#1b1b1b]' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'}`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </SettingItem>
      </SectionCard>
      <SectionCard title="消息显示">
        <SettingItem title="自动折叠行数" description="消息超过设定行数时会折叠，并可按需展开。">
          <input
            type="number"
            min={MIN_MESSAGE_COLLAPSE_LINE_COUNT}
            max={MAX_MESSAGE_COLLAPSE_LINE_COUNT}
            value={messageCollapseLineCount}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber
              if (!Number.isNaN(value))
                void setMessageCollapseLineCount(
                  Math.min(
                    MAX_MESSAGE_COLLAPSE_LINE_COUNT,
                    Math.max(MIN_MESSAGE_COLLAPSE_LINE_COUNT, value)
                  )
                )
            }}
            className="w-20 border border-white/15 bg-black/35 px-3 py-2 text-center text-sm text-white transition-colors outline-none focus:border-[#e8c690]"
            aria-label="自动折叠行数"
          />
        </SettingItem>
      </SectionCard>
    </div>
  )
}
