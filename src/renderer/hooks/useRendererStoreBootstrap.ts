import { useEffect, useState } from 'react'
import type { ChatRunEvent } from '@shared/chat'
import { useMemoryStore } from '@renderer/stores/memoryStore'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useSessionStore } from '@renderer/stores/sessionStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useAppSettingsStore } from '@renderer/stores/appSettingsStore'
import { useAppearanceStore } from '@renderer/stores/appearanceStore'

/**
 * @description 在渲染进程启动时读取统一设置、恢复各个设置分区，并订阅运行事件与内存任务事件以保持状态同步。
 * @returns 设置启动状态；主界面应仅在状态为 `ready` 时显示，避免外观设置回退闪烁。
 */
export function useRendererStoreBootstrap(): 'loading' | 'ready' | 'error' {
  const [settingsBootstrapState, setSettingsBootstrapState] = useState<
    'loading' | 'ready' | 'error'
  >('loading')

  useEffect(() => {
    let isDisposed = false

    void window.settings
      .getUnifiedSettings()
      .then((settings) => {
        if (isDisposed) {
          return
        }

        useAppSettingsStore.getState().hydrate(settings.app)
        useSettingsStore.getState().hydrateProfiles(settings.profiles)
        useMemoryStore.getState().hydrateSettings(settings.memory)
        useAppearanceStore.getState().hydrate(settings.appearance)
        setSettingsBootstrapState('ready')
      })
      .catch((error) => {
        console.error('Failed to bootstrap unified settings', error)
        if (!isDisposed) {
          setSettingsBootstrapState('error')
        }
      })

    void useCharacterStore
      .getState()
      .refreshCharacters()
      .catch((error) => {
        console.error('Failed to load character resources', error)
      })

    window.ai
      ?.getSessions?.()
      .then((snapshot) => {
        useSessionStore.getState().setSessions(snapshot)
      })
      .catch((error) => {
        console.error('Failed to load session snapshot', error)
      })

    const unsubscribeRunEvent = window.ai?.onRunEvent?.((event: ChatRunEvent) => {
      useSessionStore.getState().mergeRunEventSession(event)
    })

    return () => {
      isDisposed = true
      unsubscribeRunEvent?.()
    }
  }, [])

  return settingsBootstrapState
}
