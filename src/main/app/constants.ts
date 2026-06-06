import { join } from 'path'
import icon from '../../../resources/icon.png?asset'

export const WINDOW_SIZE = { width: 1200, height: 720 }
export const IconPath = join(__dirname, '../../resources/icon.ico')
export const PRELOAD_PATH = join(__dirname, '../preload/index.js')
export const RENDERER_HTML = join(__dirname, '../renderer/index.html')
export const LINUX_ICON = process.platform === 'linux' ? { icon } : {}
