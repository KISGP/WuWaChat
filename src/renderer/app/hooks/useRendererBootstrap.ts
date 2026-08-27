import { useEffect, useState } from 'react'
import type { ChatRunEvent } from '@shared/chat'
import { useMemoryStore } from '@renderer/features/memory/store/memory'
import { useCharacterRegistryStore } from '@renderer/store/character-registry'
import { useSessionStore } from '@renderer/store/session'
import { useSettingsStore } from '@renderer/store/profiles'
import { useAppSettingsStore } from '@renderer/store/app-settings'
import { useAppearanceStore } from '@renderer/store/appearance'
import { getUnifiedSettings } from '@renderer/services/settings'
import { getSessions, onRunEvent } from '@renderer/services/ai'
import { onRegistryChanged } from '@renderer/services/characters'

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

    void getUnifiedSettings()
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

    const unsubscribeRegistryEvent = onRegistryChanged((registry) => {
      useCharacterRegistryStore.getState().setRegistry(registry)
    })

    void useCharacterRegistryStore
      .getState()
      .refreshRegistry()
      .catch((error) => {
        console.error('Failed to load character resources', error)
      })

    void getSessions()
      .then((snapshot) => {
        useSessionStore.getState().setSessions(snapshot)
      })
      .catch((error) => {
        console.error('Failed to load session snapshot', error)
      })

    const unsubscribeRunEvent = onRunEvent((event: ChatRunEvent) => {
      useSessionStore.getState().mergeRunEventSession(event)
    })

    return () => {
      isDisposed = true
      unsubscribeRunEvent()
      unsubscribeRegistryEvent()
    }
  }, [])

  return settingsBootstrapState
}
