import { Bot, Wrench } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ChatDiagnosticRunEvent } from '@shared/chat'
import { getEventLabel } from '../lib/formatters'

type TimelineEventProps = {
  event: ChatDiagnosticRunEvent
  selected: boolean
  onSelect: () => void
}

/**
 * @description Renders one selectable event in the diagnostic timeline.
 * @param props Event data and selection callback.
 * @returns Timeline event button.
 */
function TimelineEvent({ event, selected, onSelect }: TimelineEventProps): ReactElement {
  const modelEvent = event.type === 'llm-request' || event.type === 'llm-response'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'flex w-full items-center gap-2 rounded border px-3 py-2 text-left transition-colors ' +
        (selected
          ? 'border-[#e8c690]/45 bg-[#e8c690]/10'
          : 'border-white/8 bg-black/15 hover:bg-white/5')
      }
    >
      <span className={modelEvent ? 'text-sky-300' : 'text-violet-200'}>
        {modelEvent ? <Bot className="size-4" /> : <Wrench className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/78">
        {getEventLabel(event)}
      </span>
    </button>
  )
}

type DiagnosticTimelineProps = {
  events: ChatDiagnosticRunEvent[]
  selectedIndex: number
  onSelect: (index: number) => void
}

/**
 * @description Renders the selectable event list for a diagnostic run.
 * @param props Timeline events and selection state.
 * @returns Diagnostic timeline panel.
 */
export function DiagnosticTimeline({
  events,
  selectedIndex,
  onSelect
}: DiagnosticTimelineProps): ReactElement {
  return (
    <div className="min-h-96 overflow-y-auto rounded border border-white/10 bg-[#0d0d0d] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-white/65">
        <Bot className="size-4 text-[#e8c690]" />
        操作
      </div>
      <div className="space-y-1.5">
        {events.map((event, index) => (
          <TimelineEvent
            key={event.type + '-' + index}
            event={event}
            selected={selectedIndex === index}
            onSelect={() => onSelect(index)}
          />
        ))}
      </div>
    </div>
  )
}
