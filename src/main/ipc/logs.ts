import type { RendererLogEventPayload } from '../../shared/logging'
import { logger } from '../logging'
import { handleLogged } from './logged-handler'

export function registerLogIpc(): void {
  handleLogged(
    'log:track',
    (_event, payload: RendererLogEventPayload) => logger.trackRendererEvent(payload),
    (payload) => ({ event: payload.event })
  )
  handleLogged('log:getViewerState', () => logger.getViewerState())
  handleLogged('log:readLogs', () => logger.readLogs())
  handleLogged('log:openDirectory', () => logger.openDirectory())
  handleLogged('log:clearLogs', () => logger.clearLogs())
}
