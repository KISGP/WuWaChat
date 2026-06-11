import { type ReactElement } from 'react'
import SettingIcon from '@renderer/assets/settingIcon.png'
import CloseIcon from '@renderer/components/close'
import { BackgroundImagePanel } from './BackgroundImagePanel'

/**
 * @description Renders the display settings overlay that now only exposes background image options.
 * @param props.onClose Closes the display settings overlay.
 * @returns The display settings view.
 */
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

      <div className="h-148 overflow-hidden">
        <div className="h-full">
          <BackgroundImagePanel />
        </div>
      </div>
    </div>
  )
}
