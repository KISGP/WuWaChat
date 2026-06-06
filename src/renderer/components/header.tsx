import BgHeader from '@renderer/assets/T_PhoneSystemModel02.png'
import Icon1 from '@renderer/assets/T_TPI_UiPhoneSystem_Main1_UIAtlas_1.png'
import Icon2 from '@renderer/assets/T_TPI_UiPhoneSystem_Main1_UIAtlas_2.png'
import CloseIcon from './close'
import MinIcon from './min'
import Info from '@renderer/assets/T_BtnHelpInfoNor.png'
import Dialog from './dialog'
import { useState, type ReactElement } from 'react'

export default function Header({ onOpenSettings }: { onOpenSettings?: () => void }): ReactElement {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const openSettings = (): void => {
    if (onOpenSettings) {
      onOpenSettings()
    }
  }

  const openDialog = (): void => {
    setIsDialogOpen(true)
  }

  const handleMinimize = (): void => {
    if (window.api?.minimize) {
      window.api.minimize()
      return
    }
  }

  const handleClose = (): void => {
    window.close()
  }

  return (
    <div className="relative ml-2">
      <img
        data-drag-region
        src={BgHeader}
        className="-z-10 drop-shadow-[0_0_0_#fff]"
        draggable="false"
      />
      <img src={Icon1} className="absolute top-4 left-8 z-10 size-10" draggable="false" />
      <div className="absolute top-7.5 left-26 size-1.5 rounded-full bg-neutral-300/80"></div>
      <span className="absolute top-5 left-38 text-lg font-semibold text-neutral-500/80">飞讯</span>

      <div className="no-drag pointer-events-auto absolute top-3.5 right-6 z-100 flex gap-6">
        <img
          src={Icon2}
          className="no-drag pointer-events-auto z-10 size-10 scale-90 cursor-pointer transition-transform duration-200 hover:scale-95"
          draggable="false"
          onClick={openSettings}
        />
        <img
          src={Info}
          className="no-drag pointer-events-auto z-10 size-10 cursor-pointer transition-transform duration-200 hover:scale-106"
          draggable="false"
          onClick={openDialog}
        />

        <MinIcon onClick={handleMinimize} />
        <CloseIcon onClick={handleClose} />
      </div>

      <Dialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </div>
  )
}
