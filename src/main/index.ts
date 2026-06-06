import { app } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { registerAppEvents } from '@main/app/events'
import { initializeAi } from '@main/ai'
import { bootstrapAppData } from '@main/app/bootstrap-data'
import { registerIpc } from '@main/ipc'
import { logger } from '@main/logging'
import { createMainWindow } from '@main/app/window'
import { captureError } from '@main/observability/error-monitor'

function registerProcessErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    void captureError({
      scope: 'main',
      action: 'uncaught-exception',
      message: 'Unhandled exception in main process',
      code: 'PROCESS_ERROR',
      error
    })
  })

  process.on('unhandledRejection', (reason) => {
    void captureError({
      scope: 'main',
      action: 'unhandled-rejection',
      message: 'Unhandled promise rejection in main process',
      code: 'PROCESS_ERROR',
      error: reason
    })
  })
}

registerProcessErrorHandlers()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  void bootstrapAppData()
    .then(() => {
      void logger.info('main', 'app-ready', 'Electron app is ready')
      registerAppEvents()
      void logger.info('main', 'ai-initialize-start', 'Starting AI initialization')
      return initializeAi()
    })
    .then(() => {
      void logger.info('main', 'ai-initialize-success', 'AI initialization completed')
      registerIpc()
      void logger.info('main', 'ipc-registered', 'IPC handlers registered')
      void logger.info('main', 'window-create-start', 'Creating main window')
      createMainWindow()
      void logger.info('main', 'window-create-success', 'Main window created')
    })
    .catch((error) => {
      void captureError({
        scope: 'main',
        action: 'ai-initialize-failed',
        message: 'AI initialization failed',
        code: 'PROCESS_ERROR',
        error
      })
      throw error
    })
})
