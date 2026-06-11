import { lazy, Suspense, type ReactElement, useEffect, useState } from 'react'
import CloseIcon from '@renderer/components/close'
import { LogTab } from './LogTab'
import { ModelTab } from './ModelTab'
import { Bot, Brain, Wrench, ScrollText, BugPlay } from 'lucide-react'
import { cn } from '@renderer/utils'
import { Spinner } from '@renderer/components/ui/spinner'

const ENABLE_DEBUG_TAB = import.meta.env.DEV

const MemoryTab = lazy(() =>
  import('./MemoryTab').then((module) => ({ default: module.MemoryTab }))
)
const CharacterTab = lazy(() =>
  import('./CharacterTab').then((module) => ({ default: module.CharacterTab }))
)
const DebugTab = ENABLE_DEBUG_TAB ? lazy(() => import('./DebugTab')) : null

const TABS = [
  { id: 'model', label: '模型', icon: Bot },
  { id: 'memory', label: '记忆', icon: Brain },
  { id: 'character', label: '角色', icon: Bot },
  { id: 'log', label: '日志', icon: ScrollText },
  { id: 'tools', label: '工具', icon: Wrench }
] as const

const ALL_TABS = DebugTab ? [...TABS, { id: 'debug', label: 'Debug', icon: BugPlay }] : TABS

type SettingsTabId = (typeof ALL_TABS)[number]['id']

function TabLoadingFallback(): ReactElement {
  return (
    <div className="flex h-full items-center justify-center text-[#e8c690]">
      <Spinner className="mr-2" />
    </div>
  )
}

export default function Settings({ onClose }: { onClose: () => void }): ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(ALL_TABS[0].id)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [])

  const renderActiveTab = (): ReactElement => {
    switch (activeTab) {
      case 'model':
        return <ModelTab />
      case 'memory':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <MemoryTab isActive />
          </Suspense>
        )
      case 'character':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <CharacterTab />
          </Suspense>
        )
      case 'log':
        return <LogTab />
      case 'debug':
        return DebugTab ? (
          <Suspense fallback={<TabLoadingFallback />}>
            <DebugTab />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center rounded border border-white/10 bg-white/3 px-6 py-4 text-sm text-white/60">
            Debug tools unavailable.
          </div>
        )
      case 'tools':
        return (
          <div className="flex h-full items-center justify-center rounded border border-white/10 bg-white/3 px-4 py-4 text-sm text-white/60">
            工具正在开发中，敬请期待！
          </div>
        )
      default:
        return <ModelTab />
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden font-sans">
      <div data-drag-region className="relative h-16 shrink-0 items-center justify-between">
        <div data-drag-region className="absolute bottom-4 left-6 flex items-center gap-1">
          {ALL_TABS.map(
            (tab) =>
              tab.id === activeTab && (
                <>
                  <tab.icon className="text-background size-8" />
                  <span className="text-background text-lg">{tab.label}</span>
                </>
              )
          )}
        </div>
        <CloseIcon className="absolute right-6 bottom-2" onClick={onClose} />
      </div>

      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-0">
          <aside
            className={`flex w-fit shrink-0 flex-col border-r border-white/8 px-4 py-5 transition-all duration-300 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
            }`}
          >
            <div className="flex h-full flex-col gap-10">
              {ALL_TABS.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="">
                  <tab.icon
                    className={cn(
                      'text-background size-8 hover:text-yellow-300',
                      activeTab === tab.id ? 'text-yellow-300' : 'text-background/70'
                    )}
                  />
                </button>
              ))}
            </div>
          </aside>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <div
              key={activeTab}
              className={`h-full p-1 transition-all duration-200 ${
                mounted ? 'animate-in fade-in-0 slide-in-from-bottom-2' : ''
              }`}
            >
              {renderActiveTab()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
