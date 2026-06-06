import Close from '@renderer/assets/close.png'
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
          className="absolute top-0.75 right-0.75 size-4 object-contain transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
        <img
          src={Close}
          alt="close"
          className="absolute right-0.75 bottom-0.75 size-4 rotate-90 object-contain transition-transform duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
        />
        <img
          src={Close}
          alt="close"
          className="absolute bottom-0.75 left-0.75 size-4 rotate-180 object-contain transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:translate-y-0.5"
        />
        <img
          src={Close}
          alt="close"
          className="absolute top-0.75 left-0.75 size-4 rotate-270 object-contain transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5"
        />
      </div>
    </div>
  )
}
