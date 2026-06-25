import { ReactElement, useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'

export function SettingItem({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children?: React.ReactNode
}): ReactElement {
  const [isOpenDescription, setIsOpenDescription] = useState(false)

  return (
    <Collapsible open={isOpenDescription} onOpenChange={setIsOpenDescription}>
      <div className="rounded border-2 border-[rgb(51,51,51)] p-px">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between rounded bg-[rgb(4,4,4,0.5)] px-6 py-4">
            <h3 className="text-lg font-medium text-white">{title}</h3>
            {children}
          </div>
        </CollapsibleTrigger>
      </div>

      {description && (
        <CollapsibleContent>
          <div className="mx-1 rounded-xs bg-black/50 px-4 py-1 text-sm">
            <p className="text-muted-foreground">{description}</p>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
