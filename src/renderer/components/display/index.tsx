import { type ReactElement } from 'react'
import SettingIcon from '@renderer/assets/settingIcon.png'
import CloseIcon from '@renderer/components/close'
import { BackgroundImagePanel } from './BackgroundImagePanel'
import { Separator } from '@renderer/components/ui/separator'
import Bg from '@renderer/assets/T_VisionEditDescBg.png'

export default function Display({ onClose }: { onClose: () => void }): ReactElement {
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
        <div className="relative flex h-fit w-full items-center gap-2 rounded-full text-xl text-white/60">
          <img
            src={Bg}
            className="absolute left-0 h-9 w-full rounded-full object-cover object-left"
          />
          <div className="z-10 rounded-full bg-[#585858] px-16 py-1">聊天气泡</div>

          <div className="text-foreground z-10 cursor-pointer rounded-full bg-[#b8b8b8] px-16 py-1">
            聊天背景
          </div>
        </div>
        <Separator className="my-4 opacity-10" />
        <div className="h-full">
          <BackgroundImagePanel />
        </div>
      </div>
    </div>
  )
}
