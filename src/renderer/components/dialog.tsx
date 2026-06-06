import * as DialogPrimitive from '@radix-ui/react-dialog'
import CloseIcon from './close'
import { cn } from '@renderer/utils'
import BG2 from '@renderer/assets/T_CommonPopupBg2.png'
import Github from '@renderer/assets/github.png'
import { type ReactElement } from 'react'

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  className?: string
}

export default function Dialog({ isOpen, onClose, className }: DialogProps): ReactElement {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-md duration-300 ease-in-out" />

        {/* Wrap the content in a fixed inset container to center it like the original portal approach */}
        <div className="pointer-events-none fixed inset-0 z-100 flex items-center justify-center">
          <DialogPrimitive.Content
            className={cn(
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4 pointer-events-auto relative flex h-fit w-186 flex-col gap-0.25 rounded-sm border-r-3 border-b-3 border-l-8 border-white pr-0.5 duration-300 ease-in-out outline-none focus:outline-none',
              className
            )}
            onPointerDownOutside={() => {
              // Radix handles clicking outside to close
            }}
          >
            {/* 顶部拖拽区域 & 关闭按钮 */}
            <div data-drag-region className="relative h-14 w-full shrink-0 rounded-br-3xl bg-white">
              <span className="absolute top-3 left-3 z-100 scale-90 text-2xl font-semibold">
                飞讯说明
              </span>
              <CloseIcon className="absolute top-2 right-4 z-100 scale-90" onClick={onClose} />

              <img
                src={BG2}
                draggable="false"
                className="absolute right-0 z-50 h-14 object-cover invert"
              />
            </div>

            {/* 内容区域 */}
            <div className="relative min-h-96 w-full flex-1 rounded-tr-3xl rounded-br-3xl bg-[#FCFCFC] p-6 px-12">
              <span className="text-lg text-neutral-700">
                飞讯是先行公约为终端开发的远程通讯程序，生活在索拉里斯的人们可以用飞讯互相联系。
              </span>

              <div className="absolute bottom-4 flex items-center gap-2">
                <img src={Github} className="size-5" />
                <span>项目链接：</span>
                <span
                  className="cursor-pointer hover:text-[#e8c690]"
                  onClick={() =>
                    window.open(
                      'https://github.com/wuwachat/wuwacha',
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  https://github.com/wuwachat/wuwacha
                </span>
              </div>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
