import type { RendererLogEventPayload } from '@shared/logging'

export function trackUiEvent(
  event: string,
  message: string,
  context?: RendererLogEventPayload['context']
): void {
  void window.logs?.track({
    source: 'renderer',
    event,
    message,
    context
  })
}
