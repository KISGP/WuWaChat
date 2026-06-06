import Close from '@renderer/assets/close.png'
import { cn } from '@renderer/utils'
import { type ReactElement } from 'react'

export default function MinIcon({
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
          className="absolute top-3 right-0 size-4 rotate-45 object-contain transition-transform duration-200 group-hover:translate-x-0.5"
        />
        <img
          src={Close}
          alt="close"
          className="absolute top-3 right-6 size-4 rotate-225 object-contain transition-transform duration-200 group-hover:-translate-x-0.5"
        />
      </div>
    </div>
  )
}
