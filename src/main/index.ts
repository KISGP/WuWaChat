import { app } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { registerAppEvents } from './app-events'
import { initializeAi } from './ai'
import { registerIpc } from './ipc'
import { logger } from './logger'
import { createMainWindow } from './window'

function registerProcessErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    void logger.error('main', 'uncaught-exception', 'Unhandled exception in main process', {
      error: error.message,
      stack: error.stack
    })
  })

  process.on('unhandledRejection', (reason) => {
    void logger.error('main', 'unhandled-rejection', 'Unhandled promise rejection in main process', {
      reason: reason instanceof Error ? reason.message : String(reason)
    })
  })
}

registerProcessErrorHandlers()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  void logger.info('main', 'app-ready', 'Electron app is ready')
  registerAppEvents()
  void logger.info('main', 'ai-initialize-start', 'Starting AI initialization')
  void initializeAi()
    .then(() => {
      void logger.info('main', 'ai-initialize-success', 'AI initialization completed')
      registerIpc()
      void logger.info('main', 'ipc-registered', 'IPC handlers registered')
      void logger.info('main', 'window-create-start', 'Creating main window')
      createMainWindow()
      void logger.info('main', 'window-create-success', 'Main window created')
    })
    .catch((error) => {
      void logger.error('main', 'ai-initialize-failed', 'AI initialization failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    })
})
