import { useState, type ReactElement } from 'react'
import SettingIcon from '@renderer/assets/settingIcon.png'
import CloseIcon from '@renderer/app/components/Close'
import { Separator } from '@renderer/common/components/separator'
import Bg from '@renderer/assets/T_VisionEditDescBg.png'
import { cn } from '@renderer/common/lib/cn'
import BubbleSelector from '@renderer/features/appearance/ui/BubbleSelector'
import BackgroundSelector from '@renderer/features/appearance/ui/BackgroundSelector'
import { RotateCcw } from 'lucide-react'
import { useAppearanceStore } from '@renderer/store/appearance'

type DisplayTabId = 'bubble' | 'background'

export default function DisplayPage({ onClose }: { onClose: () => void }): ReactElement {
  const [activeTab, setActiveTab] = useState<DisplayTabId>('background')
  const saveError = useAppearanceStore((state) => state.saveError)
  const retrySave = useAppearanceStore((state) => state.retrySave)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden font-sans">
      <div data-drag-region className="relative h-16 shrink-0 items-center justify-between">
        <div data-drag-region className="absolute bottom-4 left-6 flex items-center gap-1">
          <img src={SettingIcon} className="size-8 object-contain" alt="" />
          <span className="tracking-wider text-white">界面设置</span>
        </div>
        <CloseIcon className="absolute right-6 bottom-2" onClick={onClose} />
      </div>

      <div className="flex h-full w-full flex-col overflow-hidden px-8 py-1">
        {saveError && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            <span>界面设置保存失败</span>
            <button
              type="button"
              onClick={() => void retrySave()}
              className="flex shrink-0 items-center gap-1.5 rounded border border-red-300/30 px-2.5 py-1.5 text-xs transition-colors hover:bg-red-500/15"
            >
              <RotateCcw className="size-3.5" />
              重试
            </button>
          </div>
        )}
        <div
          role="tablist"
          aria-label="界面设置标签页"
          className="relative flex h-fit w-full items-center gap-2 rounded-full bg-[#333]/20 text-xl text-white/60"
        >
          <img src={Bg} className="h-10 w-135" />
          <button
            type="button"
            disabled
            className={cn(
              'absolute left-0 h-10 cursor-not-allowed rounded-full px-20',
              activeTab === 'bubble'
                ? 'bg-neutral-50 text-black'
                : 'text-white/60 hover:bg-[#585858]/60 hover:text-white'
            )}
          >
            聊天气泡
          </button>

          <button
            onClick={() => setActiveTab('background')}
            className={cn(
              'absolute left-62 h-10 rounded-full px-20',
              activeTab === 'background'
                ? 'bg-neutral-50 text-black'
                : 'text-white/60 hover:bg-[#585858]/60 hover:text-white'
            )}
          >
            聊天背景
          </button>
        </div>
        <Separator className="my-4 opacity-10" />
        <div
          id={`display-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`display-tab-${activeTab}`}
          className="h-full"
        >
          {activeTab === 'bubble' ? <BubbleSelector /> : <BackgroundSelector />}
        </div>
      </div>
    </div>
  )
}
