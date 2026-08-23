import { useEffect, useState } from 'react'
import { useAppSettingsStore } from '@renderer/stores/appSettingsStore'

/**
 * @description 读取系统的减少动态效果偏好。
 * @returns 系统是否请求减少动态效果。
 */
function getSystemReducedMotionPreference(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * @description 合并用户动画设置与系统无障碍偏好，供业务组件决定是否播放动画。
 * @returns 当前动画策略及其最终播放结果。
 * @remarks 系统的减少动态效果偏好始终优先于用户的启用设置。
 */
export function useMotionPreference(): {
  shouldAnimate: boolean
  prefersReducedMotion: boolean
} {
  const animationPreference = useAppSettingsStore((state) => state.settings.animationPreference)
  const isLoaded = useAppSettingsStore((state) => state.isLoaded)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getSystemReducedMotionPreference)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = (event: MediaQueryListEvent): void => {
      setPrefersReducedMotion(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return {
    shouldAnimate: isLoaded && animationPreference !== 'disabled' && !prefersReducedMotion,
    prefersReducedMotion
  }
}
