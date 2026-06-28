import { type ReactElement, type ReactNode, useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'

type SettingItemProps = {
  title: string
  description?: string
  children?: ReactNode
}

export function SettingItem({ title, description, children }: SettingItemProps): ReactElement {
  const [isOpenDescription, setIsOpenDescription] = useState(false)
  const hasDescription = Boolean(description)

  return (
    <Collapsible
      open={hasDescription ? isOpenDescription : false}
      onOpenChange={hasDescription ? setIsOpenDescription : undefined}
    >
      <div className="relative rounded border-2 border-[rgb(51,51,51)] p-px">
        <div className="flex size-full items-center justify-between rounded bg-[rgb(4,4,4,0.5)] px-6 py-2">
          {hasDescription ? (
            <CollapsibleTrigger asChild>
              <h3 className="block h-full min-w-0 flex-1 py-5 text-lg font-medium text-white">
                {title}
              </h3>
            </CollapsibleTrigger>
          ) : (
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-medium text-white">{title}</h3>
            </div>
          )}

          {children && <div className="relative z-10 shrink-0">{children}</div>}
        </div>
      </div>

      {hasDescription && (
        <CollapsibleContent>
          <div className="mx-1 rounded-xs bg-black/50 px-4 py-1 text-sm">
            <p className="text-muted-foreground">{description}</p>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
