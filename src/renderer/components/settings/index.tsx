import { lazy, Suspense, type ReactElement, useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import CloseIcon from '@renderer/components/close'
import { LogTab } from './LogTab'
import { ModelTab } from './ModelTab'
import { ToolsTab } from './tools'
import {
  Bot,
  Workflow,
  Brain,
  Wrench,
  HardDrive,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  UserRound,
  Volume2,
  RotateCcw,
  ClipboardList,
  Braces,
  BookOpen,
  type LucideIcon
} from 'lucide-react'
import { AgentTab } from './AgentTab'
import { cn } from '@renderer/utils'
import { Spinner } from '@renderer/components/ui/spinner'
import { GeneralTab } from './GeneralTab'
import { TtsTab } from './TTS'
import { useAppSettingsStore } from '@renderer/stores/appSettingsStore'
import { useMotionPreference } from '@renderer/hooks/useMotionPreference'
import { useSettingsStore } from '@renderer/stores/settingsStore'

gsap.registerPlugin(useGSAP)

const MemoryTab = lazy(() =>
  import('./MemoryTab').then((module) => ({ default: module.MemoryTab }))
)
const CharacterTab = lazy(() =>
  import('./CharacterTab').then((module) => ({ default: module.CharacterTab }))
)
const StorageTab = lazy(() =>
  import('./StorageTab').then((module) => ({ default: module.StorageTab }))
)
const PromptPreviewTab = lazy(() => import('./PromptPreviewTab'))
const WorldTab = lazy(() => import('./WorldTab').then((module) => ({ default: module.WorldTab })))

type SettingsTabId =
  | 'general'
  | 'tts'
  | 'model'
  | 'memory'
  | 'character'
  | 'storage'
  | 'log'
  | 'tools'
  | 'agent'
  | 'prompt-preview'
  | 'world'

type SettingsTabDefinition = {
  id: SettingsTabId
  label: string
  icon: LucideIcon
}

const SETTINGS_TABS: readonly SettingsTabDefinition[] = [
  { id: 'general', label: '通用', icon: SlidersHorizontal },
  { id: 'model', label: '模型', icon: Bot },
  { id: 'character', label: '角色', icon: UserRound },
  { id: 'agent', label: '工具', icon: Workflow },
  { id: 'memory', label: '记忆', icon: Brain },
  { id: 'world', label: '资料', icon: BookOpen },
  { id: 'tts', label: '语音', icon: Volume2 },
  { id: 'storage', label: '存储', icon: HardDrive },
  { id: 'log', label: '日志', icon: ClipboardList },
  { id: 'tools', label: '抽卡链接', icon: Wrench },
  { id: 'prompt-preview', label: '请求预览', icon: Braces }
]

/**
 * @description Renders the lazy settings page loading indicator.
 * @returns A centered loading indicator.
 */
function TabLoadingFallback(): ReactElement {
  return (
    <div className="flex h-full items-center justify-center text-[#e8c690]">
      <Spinner className="mr-2" />
    </div>
  )
}

/**
 * @description Renders the settings overlay, its navigable pages, and the expandable navigation rail.
 * @param props The overlay close handler.
 * @returns The settings overlay content.
 */
export default function Settings({ onClose }: { onClose: () => void }): ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(SETTINGS_TABS[0].id)
  const [mounted, setMounted] = useState(false)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)
  const sidebarRef = useRef<HTMLElement>(null)
  const { shouldAnimate } = useMotionPreference()
  const appSaveError = useAppSettingsStore((state) => state.saveError)
  const retryAppSave = useAppSettingsStore((state) => state.retrySave)
  const profilesSaveError = useSettingsStore((state) => state.saveError)
  const retryProfilesSave = useSettingsStore((state) => state.retrySave)
  const activeTabItem = SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0]
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

  useGSAP(
    () => {
      const sidebar = sidebarRef.current
      const labels = sidebar?.querySelectorAll<HTMLElement>('[data-settings-sidebar-label]')
      if (!sidebar || !labels) {
        return
      }

      const width = isSidebarExpanded ? 168 : 70
      const labelOpacity = isSidebarExpanded ? 1 : 0
      gsap.killTweensOf([sidebar, labels])
      if (!shouldAnimate) {
        gsap.set(sidebar, { width })
        gsap.set(labels, { autoAlpha: labelOpacity })
        return
      }

      gsap.to(sidebar, { duration: 0.24, ease: 'power2.out', overwrite: 'auto', width })
      gsap.to(labels, {
        autoAlpha: labelOpacity,
        duration: isSidebarExpanded ? 0.18 : 0.1,
        ease: 'power1.out',
        overwrite: 'auto'
      })
    },
    { dependencies: [isSidebarExpanded, shouldAnimate], scope: sidebarRef }
  )

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
            <MemoryTab />
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
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <PromptPreviewTab />
          </Suspense>
        )
      case 'tools':
        return <ToolsTab />
      case 'world':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <WorldTab />
          </Suspense>
        )
      case 'agent':
        return <AgentTab />
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
            ref={sidebarRef}
            className={`flex w-18 shrink-0 flex-col overflow-hidden border-r border-white/8 px-4 py-5 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
            }`}
          >
            <div className="flex h-full min-h-0 flex-col">
              <nav
                className="min-h-0 flex-1 flex-col items-center overflow-hidden"
                aria-label="设置导航"
              >
                <div className="space-y-4 pb-2">
                  {SETTINGS_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      title={tab.label}
                      aria-label={tab.label}
                      onClick={() => setActiveTab(tab.id)}
                      className="flex w-42 items-center gap-3 text-left"
                    >
                      <tab.icon
                        className={cn(
                          'text-background ml-1 size-8 hover:text-yellow-300',
                          activeTab === tab.id ? 'text-yellow-300' : 'text-background/70'
                        )}
                      />
                      <span
                        data-settings-sidebar-label
                        className={cn(
                          'text-sm whitespace-nowrap opacity-0',
                          activeTab === tab.id ? 'text-yellow-300' : 'text-background/70'
                        )}
                      >
                        {tab.label}
                      </span>
                    </button>
                  ))}
                </div>
              </nav>
              <button
                type="button"
                onClick={() => setIsSidebarExpanded((expanded) => !expanded)}
                className="text-background/70 mt-4 ml-1 flex size-8 shrink-0 items-center justify-center hover:text-yellow-300"
                title={isSidebarExpanded ? '收起设置导航' : '展开设置导航'}
                aria-label={isSidebarExpanded ? '收起设置导航' : '展开设置导航'}
                aria-expanded={isSidebarExpanded}
              >
                {isSidebarExpanded ? (
                  <PanelLeftClose className="size-6" />
                ) : (
                  <PanelLeftOpen className="size-6" />
                )}
              </button>
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
