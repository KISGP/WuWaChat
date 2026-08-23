import { useState, type ReactElement } from 'react'
import Header from '@renderer/components/header'
import AreaLeft from '@renderer/components/area-left'
import AreaRight from '@renderer/components/area-right'
import Settings from '@renderer/components/settings'
import Display from '@renderer/components/display'
import { useRendererStoreBootstrap } from '@renderer/hooks/useRendererStoreBootstrap'
import { Spinner } from '@renderer/components/ui/spinner'

/**
 * @description Renders the main application shell and coordinates modal-style settings overlays.
 * @returns The root renderer application view.
 */
function App(): ReactElement {
  const [isDisplayOpen, setIsDisplayOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const isOverlayOpen = isSettingsOpen || isDisplayOpen
  const settingsBootstrapState = useRendererStoreBootstrap()

  if (settingsBootstrapState !== 'ready') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-neutral-950 text-sm text-white/70">
        {settingsBootstrapState === 'loading' ? <Spinner className="mr-2" /> : null}
        <span>{settingsBootstrapState === 'loading' ? '正在加载设置...' : '设置加载失败'}</span>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div
        className={`absolute inset-0 transition-all duration-300 ease-in-out ${
          isOverlayOpen
            ? 'pointer-events-none translate-y-4 opacity-0'
            : 'translate-y-0 opacity-100'
        }`}
      >
        <Header
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenDisplay={() => setIsDisplayOpen(true)}
        />
        <div className="flex justify-center pb-5">
          <AreaLeft />
          <AreaRight />
        </div>
      </div>

      {isSettingsOpen && (
        <div
          className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            isSettingsOpen
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-4 opacity-0'
          }`}
        >
          <div className="flex h-full w-full overflow-hidden bg-black/60 backdrop-blur-md">
            <Settings onClose={() => setIsSettingsOpen(false)} />
          </div>
        </div>
      )}

      {isDisplayOpen && (
        <div
          className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            isDisplayOpen
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-4 opacity-0'
          }`}
        >
          <div className="flex h-full w-full overflow-hidden bg-black/60 backdrop-blur-md">
            <Display onClose={() => setIsDisplayOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
