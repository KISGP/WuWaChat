import { BrowserWindow, ipcMain } from 'electron'
import { logger } from '../logging'
import { getSenderContext } from './logged-handler'

export function registerWindowIpc(): void {
  ipcMain.on('window:minimize', (event) => {
    void logger.info('ipc', 'window-minimize', 'Renderer requested window minimize', {
      ...getSenderContext(event)
    })
    const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    window?.minimize()
  })
}
