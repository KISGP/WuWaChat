import { BrowserWindow } from 'electron'
import type { ChatRunEvent } from '@shared/chat'

export class RunEventPublisher {
  publish(event: ChatRunEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('ai:run:event', event)
    }
  }
}
