import { useEffect, useState, type ReactElement } from 'react'
import { Download, RefreshCw } from 'lucide-react'

type IndexTtsCharacterVoiceSettingsProps = {
  characterId: string
}

/**
 * @description 渲染一个角色的 index-tts 参考音色下载或重新下载控制。
 * @param props 需要管理音色的已安装角色标识。
 * @returns 角色音色资源操作区域。
 */
export function IndexTtsCharacterVoiceSettings({
  characterId
}: IndexTtsCharacterVoiceSettingsProps): ReactElement {
  const [isDownloaded, setIsDownloaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    /** @description 读取当前角色固定音色文件的本地下载状态。 */
    const loadStatus = async (): Promise<void> => {
      setIsLoading(true)
      setError(null)
      try {
        const status = await window.tts.getCharacterVoiceStatus(characterId)
        if (!disposed) setIsDownloaded(status.isDownloaded)
      } catch (statusError) {
        if (!disposed) {
          setError(statusError instanceof Error ? statusError.message : String(statusError))
        }
      } finally {
        if (!disposed) setIsLoading(false)
      }
    }

    void loadStatus()
    return () => {
      disposed = true
    }
  }, [characterId])

  /** @description 下载角色音色并在成功后更新本地资源状态。 */
  const handleDownload = async (): Promise<void> => {
    setIsDownloading(true)
    setError(null)
    try {
      const status = await window.tts.downloadCharacterVoice(characterId)
      setIsDownloaded(status.isDownloaded)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError))
    } finally {
      setIsDownloading(false)
    }
  }

  if (isLoading) {
    return <span className="text-xs text-white/45">正在检查音色...</span>
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={isDownloading}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded border border-[#e8c690]/45 bg-[#e8c690]/8 px-3 text-xs font-medium text-[#f1d9af] transition-colors hover:border-[#e8c690]/75 hover:bg-[#e8c690]/16 hover:text-[#fff1cf] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/30"
      >
        {isDownloaded ? (
          <RefreshCw className="size-3.5" aria-hidden="true" />
        ) : (
          <Download className="size-3.5" aria-hidden="true" />
        )}
        {isDownloading ? '下载中...' : isDownloaded ? '重新下载' : '下载音色'}
      </button>
      {error && (
        <span aria-live="polite" className="basis-full text-right text-xs text-red-300">
          {error}
        </span>
      )}
    </div>
  )
}
