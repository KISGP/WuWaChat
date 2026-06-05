import deactivateTab from '../assets/settingTab1.png'
import activateTab from '../assets/settingTab2.png'
import { cn } from '../utils'
import { type ReactElement } from 'react'

export default function Tab({
  active,
  onClick,
  children
}: {
  active: boolean
  children?: React.ReactNode
  onClick: () => void
}): ReactElement {
  return (
    <div className="relative w-46" onClick={onClick}>
      <img src={active ? activateTab : deactivateTab} className="object-contain" />

      <span
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'font-semibold',
          active ? 'text-white' : 'text-black'
        )}
      >
        {children}
      </span>
    </div>
  )
}
