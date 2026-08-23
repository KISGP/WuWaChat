import { BrowserWindow } from 'electron'
import type { ChatDiagnosticRunEvent, ChatRunEvent } from '@shared/chat'
import { CHAT_DIAGNOSTIC_EVENT_CHANNEL, CHAT_RUN_EVENT_CHANNEL } from '@shared/chat-events'

export class RunEventPublisher {
  publish(event: ChatRunEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(CHAT_RUN_EVENT_CHANNEL, event)
    }
  }

  /**
   * @description 向全部渲染进程窗口广播诊断运行的实时事件。
   * @param event 当前诊断运行事件。
   */
  publishDiagnostic(event: ChatDiagnosticRunEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(CHAT_DIAGNOSTIC_EVENT_CHANNEL, event)
    }
  }
}
