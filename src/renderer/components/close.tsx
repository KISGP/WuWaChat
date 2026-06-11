import Close from '@renderer/assets/SP_BtnBack.png'
import CloseBg from '@renderer/assets/SP_BtnBackBg.png'
import { cn } from '@renderer/utils'
import { type ReactElement } from 'react'

export default function CloseIcon({
  className,
  onClick
}: {
  className?: string
  onClick?: () => void
}): ReactElement {
  return (
    <div
      className={cn(
        'group no-drag pointer-events-auto z-10 size-10 scale-90 cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <div className="relative size-full">
        <img
          src={Close}
          alt="close"
          className="absolute -top-0.75 -right-0.75 size-6 object-contain transition-transform duration-200 group-hover:translate-x-px group-hover:-translate-y-px"
        />
        <img
          src={Close}
          alt="close"
          className="absolute -right-0.75 -bottom-0.75 size-6 rotate-90 object-contain transition-transform duration-200 group-hover:translate-x-px group-hover:translate-y-px"
        />
        <img
          src={Close}
          alt="close"
          className="absolute -bottom-0.75 -left-0.75 size-6 rotate-180 object-contain transition-transform duration-200 group-hover:-translate-x-px group-hover:translate-y-px"
        />
        <img
          src={Close}
          alt="close"
          className="absolute -top-0.75 -left-0.75 size-6 rotate-270 object-contain transition-transform duration-200 group-hover:-translate-x-px group-hover:-translate-y-px"
        />
        <img
          src={CloseBg}
          alt="close-bg"
          className="absolute top-0 left-0 size-full object-contain"
        />
      </div>
    </div>
  )
}
