import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { ImagePlus, Send, StopCircle, X } from 'lucide-react'
import type { ChatImageInput } from '@shared/chat'

const MAX_IMAGE_COUNT = 4
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const IMAGE_MIME_TYPES = new Set<ChatImageInput['mimeType']>([
  'image/png',
  'image/jpeg',
  'image/webp'
])

type ChatComposerProps = {
  onSendMessage: (message: string, images: ChatImageInput[]) => void
  onStop?: () => void
  isLoading: boolean
  charId?: string
}

/**
 * @description 将图片文件读取为可直接展示和提交给模型的数据 URL。
 * @param file 待读取的图片文件。
 * @returns 包含图片数据 URL 的 Promise。
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('无法读取图片文件'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片文件'))
    reader.readAsDataURL(file)
  })
}

/**
 * @description 判断文件是否符合当前聊天图片上传限制。
 * @param file 待校验的文件。
 * @returns 校验失败时返回中文提示，否则返回 null。
 */
function validateImageFile(file: File): string | null {
  if (!IMAGE_MIME_TYPES.has(file.type as ChatImageInput['mimeType'])) {
    return '不支持的图片格式：' + file.name
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return '图片不能超过 10 MB：' + file.name
  }
  return null
}

export default function ChatComposer({
  onSendMessage,
  onStop,
  isLoading,
  charId
}: ChatComposerProps): ReactElement {
  const [input, setInput] = useState('')
  const [images, setImages] = useState<ChatImageInput[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * @description 将选中的图片加入当前待发送列表，并生成稳定的资源标识。
   * @param files 用户选择、粘贴或拖入的文件列表。
   * @returns 无返回值。
   */
  const addFiles = async (files: FileList | File[]): Promise<void> => {
    const selected = Array.from(files)
    const remaining = MAX_IMAGE_COUNT - images.length
    if (remaining <= 0) {
      setError('单次最多上传 ' + MAX_IMAGE_COUNT + ' 张图片')
      return
    }

    const nextFiles = selected.slice(0, remaining)
    const errors: string[] = []
    const nextImages: ChatImageInput[] = []
    for (const file of nextFiles) {
      const validationError = validateImageFile(file)
      if (validationError) {
        errors.push(validationError)
        continue
      }
      try {
        const dataUrl = await readFileAsDataUrl(file)
        nextImages.push({
          resourceId: globalThis.crypto.randomUUID(),
          fileName: file.name,
          mimeType: file.type as ChatImageInput['mimeType'],
          sizeBytes: file.size,
          analysis: '',
          dataUrl
        })
      } catch (readError) {
        console.error('Failed to read chat image', readError)
        errors.push('无法读取图片：' + file.name)
      }
    }

    if (selected.length > remaining) {
      errors.push('单次最多上传 ' + MAX_IMAGE_COUNT + ' 张图片')
    }
    setError(errors.length > 0 ? errors.join('；') : null)
    if (nextImages.length > 0) {
      setImages((current) => [...current, ...nextImages].slice(0, MAX_IMAGE_COUNT))
    }
  }

  /**
   * @description 发送当前文本和图片，并清空待发送草稿。
   */
  const handleSend = (): void => {
    if ((!input.trim() && images.length === 0) || isLoading || !charId) {
      return
    }
    onSendMessage(input.trim(), images)
    setInput('')
    setImages([])
    setError(null)
    inputRef.current?.focus()
  }

  /**
   * @description 处理文本框的回车发送快捷键。
   * @param event 键盘事件。
   */
  const handleKeyPress = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  /**
   * @description 处理文件选择控件的图片输入。
   * @param event 文件输入变化事件。
   */
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    if (event.target.files) {
      void addFiles(event.target.files)
    }
    event.target.value = ''
  }

  /**
   * @description 从剪贴板提取图片并加入待发送列表。
   * @param event 剪贴板粘贴事件。
   */
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith('image/')
    )
    if (files.length > 0) {
      event.preventDefault()
      void addFiles(files)
    }
  }

  /**
   * @description 处理拖拽释放图片文件的交互状态。
   * @param event 拖拽事件。
   */
  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setIsDragging(false)
    if (!isLoading && event.dataTransfer.files.length > 0) {
      void addFiles(event.dataTransfer.files)
    }
  }

  const containerClassName =
    'absolute right-10 bottom-8 left-14 z-100 rounded-xl border-2 px-2 backdrop-blur-sm transition-colors focus-within:bg-white/90 hover:bg-white/60 ' +
    (isDragging ? 'border-[#393C4B] bg-white/90' : 'border-[#e5e7eb] bg-white/40')

  return (
    <div
      className={containerClassName}
      onDragEnter={(event) => {
        event.preventDefault()
        if (!isLoading) setIsDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false)
      }}
      onDrop={handleDrop}
    >
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-1 pt-2">
          {images.map((image) => (
            <div
              key={image.resourceId}
              className="relative size-12 shrink-0 overflow-hidden rounded-md border border-white/70 bg-gray-100"
            >
              <img src={image.dataUrl} alt={image.fileName} className="size-full object-cover" />
              <button
                type="button"
                onClick={() =>
                  setImages((current) =>
                    current.filter((item) => item.resourceId !== image.resourceId)
                  )
                }
                className="absolute top-0 right-0 flex size-5 items-center justify-center bg-black/55 text-white"
                title="移除图片"
                aria-label={'移除图片 ' + image.fileName}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex h-14 items-center gap-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={isLoading || !charId}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || !charId || images.length >= MAX_IMAGE_COUNT}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#333] disabled:cursor-not-allowed disabled:opacity-50"
          title="添加图片"
          aria-label="添加图片"
        >
          <ImagePlus size={20} />
        </button>
        <input
          ref={inputRef}
          type="text"
          placeholder="发送消息..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyUp={handleKeyPress}
          onPaste={handlePaste}
          disabled={isLoading || !charId}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-[#333] outline-none placeholder:text-gray-400 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={isLoading ? onStop : handleSend}
          disabled={((!input.trim() && images.length === 0) || !charId) && !isLoading}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#333] disabled:cursor-not-allowed disabled:opacity-50"
          title={isLoading ? '停止生成' : '发送消息'}
          aria-label={isLoading ? '停止生成' : '发送消息'}
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
      {error && <p className="truncate px-2 pb-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
