import BG1 from '@renderer/assets/T_PhoneSystemPanelS.png'
import BG1Pre from '@renderer/assets/T_PhoneSystemIconBg00Small.png'
import { type ReactElement } from 'react'

/**
 * @description Renders the background image settings content shown in the display panel.
 * @returns The background image settings panel.
 */
export function BackgroundImagePanel(): ReactElement {
  return (
    <div className="flex h-full w-full gap-2 px-8 py-4">
      <div className="grid shrink-0 grid-cols-2 gap-2">
        {[BG1Pre].map((bg, idx) => (
          <img
            key={idx}
            src={bg}
            className="w-46 rounded-md border-2 border-white/20 object-contain hover:border-amber-200"
            alt=""
          />
        ))}
      </div>
      <div className="flex-1 text-white">
        <p className="my-2">默认背景</p>
        <img src={BG1} className="h-96 object-contain" alt="" />
        <p className="mb-2 border-b border-white/20 pt-2 pb-1">飞讯默认聊天背景</p>
        <p className="text-xs text-gray-300/80">默认获得</p>
      </div>
    </div>
  )
}
