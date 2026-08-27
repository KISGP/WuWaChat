import { useState, type ReactElement } from 'react'
import { PlugZap } from 'lucide-react'
import { Input } from '@renderer/common/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from '@renderer/common/components/select'
import type { LocalTtsEngine } from '@shared/app-settings'
import { testLocalTtsConnection } from '@renderer/services/tts'

type IndexTtsGlobalSettingsProps = {
  settings: { engine: LocalTtsEngine; baseUrl: string }
  onEngineChange: (engine: LocalTtsEngine) => Promise<void>
  onChange: (patch: { baseUrl: string }) => Promise<void>
}

/**
 * @description 渲染 index-tts 的本地服务地址与连接测试控制。
 * @param props 当前 index-tts 配置和保存回调。
 * @returns index-tts 全局设置区域。
 */
export function IndexTtsGlobalSettings({
  settings,
  onEngineChange,
  onChange
}: IndexTtsGlobalSettingsProps): ReactElement {
  const [isTesting, setIsTesting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** @description 请求主进程测试当前保存的 index-tts 服务地址。 */
  const handleTestConnection = async (): Promise<void> => {
    setIsTesting(true)
    setNotice(null)
    setError(null)
    try {
      const result = await testLocalTtsConnection()
      setNotice(result.message)
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError))
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-white/55">本地引擎</span>
          <Select
            value={settings.engine}
            onValueChange={(value) => {
              if (value === 'index-tts') void onEngineChange(value)
            }}
          >
            <SelectTrigger className="h-10 w-full rounded border-white/15 bg-black/35 px-3 text-sm text-white">
              <span data-slot="select-value">index-tts</span>
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="min-w-(--radix-select-trigger-width) rounded border-0"
            >
              <SelectItem value="index-tts">index-tts</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-white/55">index-tts 服务地址</span>
          <Input
            value={settings.baseUrl}
            onChange={(event) => void onChange({ baseUrl: event.currentTarget.value })}
            placeholder="http://127.0.0.1:7860"
            inputMode="url"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => void handleTestConnection()}
          disabled={isTesting}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded border border-[#e8c690]/45 bg-[#e8c690]/8 px-3 text-xs font-medium text-[#f1d9af] transition-colors hover:border-[#e8c690]/75 hover:bg-[#e8c690]/16 hover:text-[#fff1cf] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/30"
        >
          <PlugZap className="size-3.5" aria-hidden="true" />
          {isTesting ? '测试中...' : '测试连接'}
        </button>
        {notice && (
          <span aria-live="polite" className="text-xs text-[#e8c690]/80">
            {notice}
          </span>
        )}
        {error && (
          <span aria-live="polite" className="text-xs text-red-300">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
