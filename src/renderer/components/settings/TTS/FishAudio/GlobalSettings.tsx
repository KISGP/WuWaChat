import { useState, type ReactElement } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@renderer/components/ui/select'


export default function FishGlobalSettings({
  settings,
  onChange
}: {
  settings: { apiKey: string; model: string }
  onChange: (patch: Partial<{ apiKey: string; model: string }>) => Promise<void>
}): ReactElement {
  const [showApiKey, setShowApiKey] = useState(false)
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-white/55">Fish Audio API Key</span>
        <span className="relative">
          <Input
            type={showApiKey ? 'text' : 'password'}
            value={settings.apiKey}
            onChange={(event) => void onChange({ apiKey: event.currentTarget.value })}
            className="w-full pr-10"
            placeholder="输入 API Key"
            autoComplete="off"
          />
          <button
            type="button"
            aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
            onClick={() => setShowApiKey((value) => !value)}
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center text-white/45 hover:text-white/80"
          >
            {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-white/55">模型</span>
        <Select value={settings.model} onValueChange={(value) => void onChange({ model: value })}>
          <SelectTrigger className="h-10 w-full rounded border-white/15 bg-black/35 px-3 text-sm text-white">
            <span data-slot="select-value">{settings.model}</span>
          </SelectTrigger>
          <SelectContent
            position="popper"
            className="min-w-(--radix-select-trigger-width) rounded border-0"
          >
            <SelectItem value="s2.1-pro-free">s2.1-pro-free</SelectItem>
            <SelectItem value="s2.1-pro">s2.1-pro</SelectItem>
            <SelectItem value="s2-pro">s2-pro</SelectItem>
            <SelectItem value="s1">s1</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <p className="text-xs leading-5 text-white/45 md:col-span-2">
        全局 Fish Audio 配置不包含音色 ID；音色由每个角色单独设置。
      </p>
    </div>
  )
}