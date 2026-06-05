import { useEffect } from 'react'

type UseMemoryTabLifecycleArgs = {
  activeCharacterId?: string | null
  buildLaunchNotice: unknown
  refreshStatus: (characterId?: string | null) => Promise<void>
  refreshLocalModels: () => Promise<void>
  clearBuildLaunchNotice: () => void
}

export function useMemoryTabLifecycle({
  activeCharacterId,
  buildLaunchNotice,
  refreshStatus,
  refreshLocalModels,
  clearBuildLaunchNotice
}: UseMemoryTabLifecycleArgs): void {
  useEffect(() => {
    void refreshStatus(activeCharacterId || null)
  }, [activeCharacterId, refreshStatus])

  useEffect(() => {
    void refreshLocalModels()
  }, [refreshLocalModels])

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
