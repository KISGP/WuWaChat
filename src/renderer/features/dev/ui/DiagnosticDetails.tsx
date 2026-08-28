import { Braces } from 'lucide-react'
import type { ReactElement } from 'react'
import { JsonView } from 'react-json-view-lite'
import type { ChatDiagnosticRunEvent } from '@shared/chat'
import { CopyButton } from './CopyButton'
import { formatJson, getEventLabel, shouldExpandJsonNode } from '../lib/formatters'
import { jsonPreviewStyles } from './json-preview'

type DiagnosticDetailsProps = {
  selectedEvent: ChatDiagnosticRunEvent | null
  rawValue: unknown
  previewData: unknown
  selectedIndex: number
  copiedKey: string | null
  onCopy: (value: string, key: string) => void
}

/**
 * @description Renders the raw payload or assistant result for the selected diagnostic event.
 * @param props Selected event data and copy state.
 * @returns Diagnostic details panel.
 */
export function DiagnosticDetails({
  selectedEvent,
  rawValue,
  previewData,
  selectedIndex,
  copiedKey,
  onCopy
}: DiagnosticDetailsProps): ReactElement {
  return (
    <div className="flex min-h-96 min-w-0 flex-col overflow-hidden rounded border border-white/10 bg-[#0d0d0d]">
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
        <Braces className="size-4 text-[#e8c690]" />
        <span className="ml-auto text-[11px] text-white/35">
          {selectedEvent ? getEventLabel(selectedEvent) : '请选择时间线事件'}
        </span>
        {rawValue !== null && (
          <CopyButton
            value={formatJson(rawValue)}
            copiedKey={copiedKey}
            copyKey={'event-' + selectedIndex}
            onCopy={onCopy}
          />
        )}
      </div>
      <div className="json-preview-content min-h-0 flex-1 overflow-auto p-3">
        {selectedEvent?.type === 'completed' ? (
          <div className="text-sm leading-7 whitespace-pre-wrap text-white/85">
            {selectedEvent.assistantDraft || '模型未返回文本结果。'}
          </div>
        ) : rawValue !== null ? (
          <JsonView
            data={previewData as object}
            style={jsonPreviewStyles}
            shouldExpandNode={shouldExpandJsonNode}
            clickToExpandNode
          />
        ) : (
          <p className="text-sm text-white/35">等待诊断事件...</p>
        )}
      </div>
    </div>
  )
}
