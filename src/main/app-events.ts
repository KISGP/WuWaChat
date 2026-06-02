import { app, BrowserWindow } from 'electron'
import { optimizer } from '@electron-toolkit/utils'
import { logger } from './logger'
import { createMainWindow } from './window'

export function registerAppEvents(): void {
  app.on('browser-window-created', (_, window) => {
    void logger.info('window', 'browser-window-created', 'Browser window created', {
      webContentsId: window.webContents.id
    })
    optimizer.watchWindowShortcuts(window)
  })

  app.on('activate', () => {
    void logger.info('main', 'activate', 'Application activate event received', {
      windowCount: BrowserWindow.getAllWindows().length
    })
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })

  app.on('window-all-closed', () => {
    void logger.info('main', 'window-all-closed', 'All application windows were closed', {
      platform: process.platform
    })
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
