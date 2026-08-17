import { lazy, Suspense, type ReactElement, useEffect, useState } from 'react'
import CloseIcon from '@renderer/components/close'
import { LogTab } from './LogTab'
import { ModelTab } from './ModelTab'
import { ToolsTab } from './tools'
import {
  Bot,
  Brain,
  Wrench,
  ScrollText,
  FileCode2,
  HardDrive,
  SlidersHorizontal,
  Volume2,
  RotateCcw
} from 'lucide-react'
import { cn } from '@renderer/utils'
import { Spinner } from '@renderer/components/ui/spinner'
import { GeneralTab } from './GeneralTab'
import { TtsTab } from './TtsTab'
import { useAppSettingsStore } from '@renderer/stores/appSettingsStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'

const ENABLE_DEBUG_TAB = import.meta.env.DEV

const MemoryTab = lazy(() =>
  import('./MemoryTab').then((module) => ({ default: module.MemoryTab }))
)
const CharacterTab = lazy(() =>
  import('./CharacterTab').then((module) => ({ default: module.CharacterTab }))
)
const StorageTab = lazy(() =>
  import('./StorageTab').then((module) => ({ default: module.StorageTab }))
)
const PromptPreviewTab = ENABLE_DEBUG_TAB ? lazy(() => import('./PromptPreviewTab')) : null

const TABS = [
  { id: 'general', label: '通用', icon: SlidersHorizontal },
  { id: 'tts', label: 'TTS', icon: Volume2 },
  { id: 'model', label: '模型', icon: Bot },
  { id: 'memory', label: '记忆与知识', icon: Brain },
  { id: 'character', label: '角色', icon: Bot },
  { id: 'storage', label: '存储', icon: HardDrive },
  { id: 'log', label: '日志', icon: ScrollText },
  { id: 'tools', label: '工具', icon: Wrench }
] as const

const ALL_TABS = PromptPreviewTab
  ? [...TABS, { id: 'prompt-preview', label: 'Prompt', icon: FileCode2 }]
  : TABS

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
  const appSaveError = useAppSettingsStore((state) => state.saveError)
  const retryAppSave = useAppSettingsStore((state) => state.retrySave)
  const profilesSaveError = useSettingsStore((state) => state.saveError)
  const retryProfilesSave = useSettingsStore((state) => state.retrySave)
  const activeTabItem = ALL_TABS.find((tab) => tab.id === activeTab) ?? ALL_TABS[0]
  const saveFailure = appSaveError
    ? { message: '通用设置保存失败', retry: retryAppSave }
    : profilesSaveError
      ? { message: '模型配置保存失败', retry: retryProfilesSave }
      : null

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
      case 'general':
        return <GeneralTab />
      case 'model':
        return <ModelTab />
      case 'tts':
        return <TtsTab />
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
      case 'storage':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <StorageTab />
          </Suspense>
        )
      case 'log':
        return <LogTab />
      case 'prompt-preview':
        return PromptPreviewTab ? (
          <Suspense fallback={<TabLoadingFallback />}>
            <PromptPreviewTab />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center rounded border border-white/10 bg-white/3 px-6 py-4 text-sm text-white/60">
            Prompt preview unavailable.
          </div>
        )
      case 'tools':
        return <ToolsTab />
      default:
        return <ModelTab />
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden font-sans">
      <div data-drag-region className="relative h-16 shrink-0 items-center justify-between">
        <div data-drag-region className="absolute bottom-4 left-6 flex items-center gap-1">
          <activeTabItem.icon className="text-background size-6" />
          <span className="text-background text-xl font-bold">{activeTabItem.label}</span>
        </div>
        <CloseIcon className="absolute right-6 bottom-2" onClick={onClose} />
      </div>

      <div className="min-h-0 flex-1">
        {saveFailure && (
          <div className="mx-5 mt-2 flex items-center justify-between gap-3 rounded border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            <span>{saveFailure.message}</span>
            <button
              type="button"
              onClick={() => void saveFailure.retry()}
              className="flex shrink-0 items-center gap-1.5 rounded border border-red-300/30 px-2.5 py-1.5 text-xs transition-colors hover:bg-red-500/15"
            >
              <RotateCcw className="size-3.5" />
              重试
            </button>
          </div>
        )}
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
