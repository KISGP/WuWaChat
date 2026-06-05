import { useEffect } from 'react'

type UseMemoryTabLifecycleArgs = {
  isActive: boolean
  activeCharacterId?: string | null
  buildLaunchNotice: unknown
  refreshStatus: (characterId?: string | null) => Promise<void>
  refreshLocalModels: () => Promise<void>
  clearBuildLaunchNotice: () => void
}

export function useMemoryTabLifecycle({
  isActive,
  activeCharacterId,
  buildLaunchNotice,
  refreshStatus,
  refreshLocalModels,
  clearBuildLaunchNotice
}: UseMemoryTabLifecycleArgs): void {
  useEffect(() => {
    if (!isActive) {
      return
    }

    void refreshStatus(activeCharacterId || null)
  }, [activeCharacterId, isActive, refreshStatus])

  useEffect(() => {
    if (!isActive) {
      return
    }

    void refreshLocalModels()
  }, [isActive, refreshLocalModels])

  useEffect(() => {
    if (!buildLaunchNotice) {
      return
    }

    const timeout = window.setTimeout(() => {
      clearBuildLaunchNotice()
    }, 10000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [buildLaunchNotice, clearBuildLaunchNotice])
}
