import { lazy, Suspense, type ReactElement, useState } from 'react'
import SettingIcon from '@renderer/assets/settingIcon.png'
import CloseIcon from '@renderer/components/close'
import Tab from '@renderer/components/tab'
import { BackgroundTab } from './BackgroundTab'
import { LogTab } from './LogTab'
import { ModelTab } from './ModelTab'

const ENABLE_DEBUG_TAB = import.meta.env.DEV
const MemoryTab = lazy(() =>
  import('./MemoryTab').then((module) => ({ default: module.MemoryTab }))
)
const CharacterTab = lazy(() =>
  import('./CharacterTab').then((module) => ({ default: module.CharacterTab }))
)
const DebugTab = ENABLE_DEBUG_TAB ? lazy(() => import('./DebugTab')) : null

const TABS = [
  { id: 'model', label: '模型' },
  { id: 'memory', label: '记忆' },
  { id: 'character', label: '角色' },
  { id: 'bg', label: '背景图像' },
  { id: 'log', label: '日志' }
] as const

const ALL_TABS = DebugTab ? [...TABS, { id: 'debug', label: 'Debug' }] : TABS

type SettingsTabId = (typeof ALL_TABS)[number]['id']

function TabLoadingFallback({ label }: { label: string }): ReactElement {
  return (
    <div className="flex h-full items-center justify-center px-6 py-4 text-sm text-white/60">
      Loading {label}...
    </div>
  )
}

export default function Settings({ onClose }: { onClose: () => void }): ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(ALL_TABS[0].id)

  const renderActiveTab = (): ReactElement => {
    switch (activeTab) {
      case 'model':
        return <ModelTab />
      case 'memory':
        return (
          <Suspense fallback={<TabLoadingFallback label="memory settings" />}>
            <MemoryTab isActive />
          </Suspense>
        )
      case 'character':
        return (
          <Suspense fallback={<TabLoadingFallback label="character settings" />}>
            <CharacterTab />
          </Suspense>
        )
      case 'bg':
        return <BackgroundTab />
      case 'log':
        return <LogTab />
      case 'debug':
        return DebugTab ? (
          <Suspense fallback={<TabLoadingFallback label="debug tools" />}>
            <DebugTab />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center px-6 py-4 text-sm text-white/60">
            Debug tools unavailable.
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
          <img src={SettingIcon} className="size-8 object-contain" alt="" />
          <span className="tracking-wider text-white">设置</span>
        </div>
        <CloseIcon className="absolute right-6 bottom-2" onClick={onClose} />
      </div>

      <div className="mx-8 mt-2 flex gap-2 border-b border-white/20 pb-2">
        {ALL_TABS.map((tab) => (
          <Tab key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </Tab>
        ))}
      </div>

      <div className="h-148 overflow-hidden">
        <div className="h-full">{renderActiveTab()}</div>
      </div>
    </div>
  )
}
