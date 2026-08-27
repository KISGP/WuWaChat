import { type ReactElement, type ReactNode, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/common/components/collapsible'
import { useMotionPreference } from '@renderer/app/hooks/useMotionPreference'

gsap.registerPlugin(useGSAP)

type SettingItemProps = {
  title: string
  expandedItems?: ReactNode[]
  children?: ReactNode
}

/**
 * @description 渲染带有可选控制器和可折叠详情项的设置条目。
 * @param props 设置条目标题、展开内容及控制器。
 * @returns 设置条目。
 */
export function SettingItem({
  title,
  expandedItems = [],
  children
}: SettingItemProps): ReactElement {
  const [isOpenExpanded, setIsOpenExpanded] = useState(false)
  const hasExpandableContent = expandedItems.length > 0
  const contentRef = useRef<HTMLDivElement>(null)
  const previousOpenRef = useRef<boolean | null>(null)
  const { shouldAnimate } = useMotionPreference()

  useGSAP(
    () => {
      const content = contentRef.current
      if (!hasExpandableContent || !content) {
        previousOpenRef.current = isOpenExpanded
        return
      }

      const shouldPlayTransition =
        shouldAnimate &&
        previousOpenRef.current !== null &&
        previousOpenRef.current !== isOpenExpanded
      gsap.killTweensOf(content)

      if (!shouldPlayTransition) {
        gsap.set(content, {
          height: isOpenExpanded ? 'auto' : 0,
          autoAlpha: isOpenExpanded ? 1 : 0,
          pointerEvents: isOpenExpanded ? 'auto' : 'none',
          y: isOpenExpanded ? 0 : -6
        })
        previousOpenRef.current = isOpenExpanded
        return
      }

      previousOpenRef.current = isOpenExpanded
      if (isOpenExpanded) {
        gsap.set(content, { height: 0, autoAlpha: 0, pointerEvents: 'auto', y: -6 })
        gsap.to(content, {
          height: 'auto',
          autoAlpha: 1,
          duration: 0.22,
          ease: 'power2.out',
          overwrite: 'auto',
          y: 0
        })
        return
      }

      gsap.set(content, { pointerEvents: 'none' })
      gsap.to(content, {
        height: 0,
        autoAlpha: 0,
        duration: 0.16,
        ease: 'power2.in',
        overwrite: 'auto',
        y: -6
      })
    },
    { dependencies: [hasExpandableContent, isOpenExpanded, shouldAnimate], scope: contentRef }
  )

  return (
    <Collapsible
      open={hasExpandableContent ? isOpenExpanded : false}
      onOpenChange={hasExpandableContent ? setIsOpenExpanded : undefined}
    >
      <div className="relative rounded border-2 border-[rgb(51,51,51)] hover:border-[#e8c690] p-px">
        <div className="flex size-full items-center justify-between rounded bg-[rgb(4,4,4,0.5)] px-6 py-2">
          {hasExpandableContent ? (
            <CollapsibleTrigger asChild>
              <h3 className="block h-full min-w-0 flex-1 py-2 text-lg font-medium text-white">
                {title}
              </h3>
            </CollapsibleTrigger>
          ) : (
            <div className="min-w-0 flex-1">
              <h3 className="py-2 text-lg font-medium text-white">{title}</h3>
            </div>
          )}

          {children && <div className="relative z-10 shrink-0">{children}</div>}
        </div>
      </div>

      {hasExpandableContent && (
        <CollapsibleContent ref={contentRef} forceMount>
          <div className="mx-2 space-y-1">
            {expandedItems.map((item, index) => (
              <div
                key={index}
                className="rounded-xs bg-black/50 px-4 py-1 text-sm"
              >
                {item}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
