import { useEffect } from 'react'
import type { ChatRunEvent } from '@shared/chat'
import {
  clearScheduledMemoryStatusRefresh,
  isTaskActive,
  scheduleMemoryStatusRefresh,
  useMemoryStore
} from '@renderer/stores/memoryStore'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { useSessionStore } from '@renderer/stores/sessionStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'

/**
 * @description 在渲染进程启动时引导相关 store：加载设置、刷新角色与会话，并订阅运行事件与内存任务事件以保持状态同步。
 */
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
      clearScheduledMemoryStatusRefresh()
      unsubscribeRunEvent?.()
      unsubscribeMemoryTaskEvent()
    }
  }, [])
}
