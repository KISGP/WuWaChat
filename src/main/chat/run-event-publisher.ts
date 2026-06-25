import { BrowserWindow } from 'electron'
import type { ChatRunEvent } from '@shared/chat'
import { CHAT_RUN_EVENT_CHANNEL } from '@shared/chat-events'

export class RunEventPublisher {
  publish(event: ChatRunEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(CHAT_RUN_EVENT_CHANNEL, event)
    }
  }
}
