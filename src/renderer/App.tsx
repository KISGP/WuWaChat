import { useState, type ReactElement } from 'react'
import Header from '@renderer/components/header'
import AreaLeft from '@renderer/components/area-left'
import AreaRight from '@renderer/components/area-right'
import Settings from '@renderer/components/settings'
import Display from '@renderer/components/display'
import { useRendererStoreBootstrap } from '@renderer/hooks/useRendererStoreBootstrap'

/**
 * @description Renders the main application shell and coordinates modal-style settings overlays.
 * @returns The root renderer application view.
 */
function App(): ReactElement {
  const [isDisplayOpen, setIsDisplayOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const isOverlayOpen = isSettingsOpen || isDisplayOpen
  useRendererStoreBootstrap()

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
