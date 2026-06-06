import { useEffect } from 'react'
import type { ChatRunEvent } from '@shared/ai'
import {
  clearScheduledMemoryStatusRefresh,
  isTaskActive,
  scheduleMemoryStatusRefresh,
  useMemoryStore
} from '@renderer/stores/memoryStore'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useSessionStore } from '@renderer/stores/sessionStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'

export function useRendererStoreBootstrap(): void {
  useEffect(() => {
    void useSettingsStore.getState().hydrateProfiles()

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

    const memoryBootstrapTimeout = window.setTimeout(() => {
      Promise.all([
        useMemoryStore.getState().refreshStatus(null),
        useMemoryStore.getState().refreshLocalModels()
      ])
        .catch((error) => {
          console.error('Failed to load memory status', error)
        })
        .finally(() => {
          useMemoryStore.getState().setIsLoaded(true)
        })
    }, 0)

    const unsubscribeRunEvent = window.ai?.onRunEvent?.((event: ChatRunEvent) => {
      useSessionStore.getState().mergeRunEventSession(event)
    })

    const unsubscribeMemoryTaskEvent = window.memory.onTaskEvent((event) => {
      useMemoryStore.getState().reconcileTask(event.task)

      if (isTaskActive(event.task)) {
        scheduleMemoryStatusRefresh(120)
      } else {
        scheduleMemoryStatusRefresh(0)
        if (event.task.taskType === 'local-model-download') {
          void useMemoryStore
            .getState()
            .refreshLocalModels()
            .catch((error) => {
              console.error('Failed to refresh local embedding models', error)
            })
        }
      }
    })

    return () => {
      window.clearTimeout(memoryBootstrapTimeout)
      clearScheduledMemoryStatusRefresh()
      unsubscribeRunEvent?.()
      unsubscribeMemoryTaskEvent()
    }
  }, [])
}
