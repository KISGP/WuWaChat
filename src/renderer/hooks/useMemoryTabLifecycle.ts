import { useEffect, useRef } from 'react'

type UseMemoryTabLifecycleArgs = {
  isActive: boolean
  isLoaded: boolean
  activeCharacterId?: string | null
  buildLaunchNotice: unknown
  refreshStatus: (characterId?: string | null) => Promise<void>
  refreshLocalModels: () => Promise<void>
  setIsLoaded: (isLoaded: boolean) => void
  clearBuildLaunchNotice: () => void
}

/**
 * @description 在 Memory 选项卡首次激活时加载并刷新内存状态与本地模型列表；在选项卡激活且已加载时持续刷新，并在出现 `buildLaunchNotice` 时在 10 秒后自动清除提示。
 */
export function useMemoryTabLifecycle({
  isActive,
  isLoaded,
  activeCharacterId,
  buildLaunchNotice,
  refreshStatus,
  refreshLocalModels,
  setIsLoaded,
  clearBuildLaunchNotice
}: UseMemoryTabLifecycleArgs): void {
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!isActive || hasInitializedRef.current) {
      return
    }

    let cancelled = false
    hasInitializedRef.current = true

    Promise.all([refreshStatus(activeCharacterId || null), refreshLocalModels()])
      .catch((error) => {
        console.error('Failed to load memory status', error)
      })
      .finally(() => {
        if (cancelled) {
          return
        }

        setIsLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [activeCharacterId, isActive, refreshLocalModels, refreshStatus, setIsLoaded])

  useEffect(() => {
    if (!isActive || !hasInitializedRef.current || !isLoaded) {
      return
    }

    void refreshStatus(activeCharacterId || null)
  }, [activeCharacterId, isActive, isLoaded, refreshStatus])

  useEffect(() => {
    if (!isActive || !hasInitializedRef.current || !isLoaded) {
      return
    }

    void refreshLocalModels()
  }, [isActive, isLoaded, refreshLocalModels])

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
