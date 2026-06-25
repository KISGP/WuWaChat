import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { Send, StopCircle } from 'lucide-react'

type ChatInputAreaProps = {
  onSendMessage: (message: string) => void
  onStop?: () => void
  isLoading: boolean
  charId?: string
}

export default function ChatInputArea({
  onSendMessage,
  onStop,
  isLoading,
  charId
}: ChatInputAreaProps): ReactElement {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = (): void => {
    if (input.trim() && !isLoading && charId) {
      onSendMessage(input)
      setInput('')
      inputRef.current?.focus()
    }
  }

  const handleKeyPress = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="absolute right-10 bottom-8 left-14 z-100 flex h-14 items-center gap-2 rounded-xl border-2 border-[#e5e7eb] bg-white/40 px-2 backdrop-blur-sm transition-colors focus-within:bg-white/90 hover:bg-white/60">
      <input
        ref={inputRef}
        type="text"
        placeholder="发送消息..."
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyUp={handleKeyPress}
        disabled={isLoading || !charId}
        className="h-full flex-1 bg-transparent px-3 text-[#333] outline-none placeholder:text-gray-400 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={isLoading ? onStop : handleSend}
        disabled={(!input.trim() || !charId) && !isLoading}
        className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#333] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <div className="group relative flex size-10 items-center justify-center">
            <div className="absolute size-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 group-hover:opacity-0" />
            <StopCircle
              size={20}
              className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
        ) : (
          <Send size={20} />
        )}
      </button>
    </div>
  )
}
