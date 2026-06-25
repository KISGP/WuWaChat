import { useState, type ReactElement } from 'react'
import SettingIcon from '@renderer/assets/settingIcon.png'
import CloseIcon from '@renderer/components/close'
import { Separator } from '@renderer/components/ui/separator'
import Bg from '@renderer/assets/T_VisionEditDescBg.png'
import { cn } from '@renderer/utils'
import Bubble from './bubble'
import BackgroundImage from './background-image'

const DISPLAY_TABS = [
  { id: 'bubble', label: '聊天气泡' },
  { id: 'background', label: '聊天背景' }
] as const

type DisplayTabId = (typeof DISPLAY_TABS)[number]['id']

export default function Display({ onClose }: { onClose: () => void }): ReactElement {
  const [activeTab, setActiveTab] = useState<DisplayTabId>('background')

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
        <div
          role="tablist"
          aria-label="界面设置标签页"
          className="relative flex h-fit w-full items-center gap-2 rounded-full bg-[#333]/20 text-xl text-white/60"
        >
          <img src={Bg} className="h-10 w-135" />
          <button
            onClick={() => false && setActiveTab('bubble')}
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
          {activeTab === 'bubble' ? <Bubble /> : <BackgroundImage />}
        </div>
      </div>
    </div>
  )
}
