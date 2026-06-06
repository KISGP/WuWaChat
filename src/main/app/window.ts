import { BrowserWindow, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { PRELOAD_PATH, RENDERER_HTML, WINDOW_SIZE, IconPath } from './constants'
import { logger } from '@main/logging'

function loadRenderer(window: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(RENDERER_HTML)
  }
}

function registerWindowHandlers(window: BrowserWindow): void {
  window.on('ready-to-show', () => {
    void logger.info('window', 'ready-to-show', 'Main window is ready to show', {
      windowId: window.id
    })
    window.show()
  })

  window.webContents.setWindowOpenHandler((details) => {
    void logger.info('window', 'external-link-opened', 'Opening external URL from renderer', {
      url: details.url
    })
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    show: true,
    autoHideMenuBar: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    // only on windows
    backgroundMaterial: 'acrylic',
    icon: IconPath,
    webPreferences: {
      preload: PRELOAD_PATH,
      sandbox: false
    }
  })

  registerWindowHandlers(mainWindow)
  loadRenderer(mainWindow)

  return mainWindow
}
