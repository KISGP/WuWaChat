import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Eye, EyeOff, Play, Square } from 'lucide-react'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { useAppSettingsStore } from '@renderer/stores/appSettingsStore'
import { Input } from '@renderer/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@renderer/components/ui/select'

const DEFAULT_TEST_TEXT = '你好，这是语音测试。'

/**
 * @description 渲染 TTS provider 配置、开关和文本合成测试功能。
 * @returns TTS 设置页内容。
 */
export function TtsTab(): ReactElement {
  const ttsEnabled = useAppSettingsStore((state) => state.settings.tts.enabled)
  const ttsSettings = useAppSettingsStore((state) => state.settings.tts)
  const setTtsEnabled = useAppSettingsStore((state) => state.setTtsEnabled)
  const updateTtsSettings = useAppSettingsStore((state) => state.updateTtsSettings)
  const [text, setText] = useState(DEFAULT_TEST_TEXT)
  const [phase, setPhase] = useState<'idle' | 'synthesizing' | 'playing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)

  /**
   * @description 停止当前音频播放并释放音频引用。
   */
  const stopPlayback = useCallback((): void => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    audioRef.current = null
  }, [])

  /**
   * @description 取消当前合成请求并停止正在播放的测试音频。
   */
  const stopSpeech = useCallback((): void => {
    const requestId = requestIdRef.current
    requestIdRef.current = null
    stopPlayback()
    setPhase('idle')
    if (requestId) {
      void window.tts.cancel(requestId).catch((reason: unknown) => {
        console.error('Failed to cancel TTS test synthesis', reason)
      })
    }
  }, [stopPlayback])

  /**
   * @description 合成并播放输入框中的测试文本。
   */
  const handleSynthesize = useCallback((): void => {
    const normalizedText = text.trim()
    if (!normalizedText) {
      setError('请输入要合成的文本。')
      return
    }

    stopSpeech()
    const requestId = globalThis.crypto.randomUUID()
    requestIdRef.current = requestId
    setError(null)
    setPhase('synthesizing')

    void window.tts
      .synthesize({ requestId, messageId: 'tts-settings-test', text: normalizedText })
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        requestIdRef.current = null
        const audio = new Audio(result.audioUrl)
        audioRef.current = audio
        setPhase('playing')
        audio.addEventListener(
          'ended',
          () => {
            if (audioRef.current === audio) {
              audioRef.current = null
              setPhase('idle')
            }
          },
          { once: true }
        )
        audio.addEventListener(
          'error',
          () => {
            if (audioRef.current !== audio) return
            audioRef.current = null
            setPhase('idle')
            setError('生成的音频无法播放。')
          },
          { once: true }
        )
        void audio.play().catch((reason: unknown) => {
          if (audioRef.current !== audio) return
          audioRef.current = null
          setPhase('idle')
          setError('音频播放失败。')
          console.error('Failed to play TTS test audio', reason)
        })
      })
      .catch((reason: unknown) => {
        if (requestIdRef.current !== requestId) return
        requestIdRef.current = null
        setPhase('idle')
        setError('语音生成失败，请检查语音服务配置。')
        console.error('Failed to synthesize TTS test audio', reason)
      })
  }, [stopSpeech, text])

  useEffect(() => stopSpeech, [stopSpeech])

  return (
    <div className="h-full overflow-y-auto px-4">
      <SectionCard title="语音播放">
        <SettingItem
          title="启用语音"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              启用后，已完成的角色消息会显示语音播放按钮。
            </p>
          ]}
        >
          <button
            type="button"
            role="switch"
            aria-label="启用语音"
            aria-checked={ttsEnabled}
            onClick={() => void setTtsEnabled(!ttsEnabled)}
            className={`relative h-6 w-11 shrink-0 appearance-none rounded-full border-0 p-0 transition-colors ${ttsEnabled ? 'bg-[#e8c690]' : 'bg-white/15'}`}
          >
            <span
              className={`absolute top-1 left-1 size-4 rounded-full bg-white transition-transform ${ttsEnabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </SettingItem>
      </SectionCard>
      <SectionCard title="语音服务">
        <div className="space-y-3 rounded border-2 border-[rgb(51,51,51)] bg-black/50 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/55">Provider</span>
            <Select
              value={ttsSettings.provider}
              onValueChange={(value) =>
                void updateTtsSettings({ provider: value === 'fish' ? 'fish' : 'local' })
              }
            >
              <SelectTrigger className="h-10 w-full rounded border-white/15 bg-black/35 px-3 text-sm text-white hover:bg-black/45 focus:border-[#e8c690]">
                <span data-slot="select-value">
                  {ttsSettings.provider === 'fish' ? 'Fish Audio' : '本地推理'}
                </span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="min-w-(--radix-select-trigger-width) rounded border-0"
              >
                <SelectItem value="fish">Fish Audio</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {ttsSettings.provider === 'fish' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/55">Fish Audio API Key</span>
                <span className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={ttsSettings.fishApiKey}
                    onChange={(event) =>
                      void updateTtsSettings({ fishApiKey: event.currentTarget.value })
                    }
                    className="w-full pr-10"
                    placeholder="输入 API Key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((value) => !value)}
                    className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center text-white/45 hover:text-white/80"
                    title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                  >
                    {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/55">音色 ID</span>
                <Input
                  value={ttsSettings.fishReferenceId}
                  onChange={(event) =>
                    void updateTtsSettings({ fishReferenceId: event.currentTarget.value })
                  }
                  placeholder="Fish Audio reference_id"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/55">模型</span>
                <Select
                  value={ttsSettings.fishModel}
                  onValueChange={(value) => void updateTtsSettings({ fishModel: value })}
                >
                  <SelectTrigger className="h-10 w-full rounded border-white/15 bg-black/35 px-3 text-sm text-white hover:bg-black/45 focus:border-[#e8c690]">
                    <span data-slot="select-value">{ttsSettings.fishModel}</span>
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
            </div>
          ) : (
            <p className="text-sm text-white/55">使用当前已安装的本地 TTS 运行时和默认音色。</p>
          )}
        </div>
      </SectionCard>
      <SectionCard title="测试输出">
        <div className="space-y-3 rounded border-2 border-[rgb(51,51,51)] bg-black/50 p-4">
          <textarea
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            placeholder="输入要合成的文本"
            aria-label="TTS 测试文本"
            rows={5}
            className="w-full resize-y border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-[#e8c690]"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-red-300/90">{error}</p>
            <button
              type="button"
              onClick={phase === 'idle' ? handleSynthesize : stopSpeech}
              className="inline-flex shrink-0 items-center gap-2 border border-[#e8c690]/70 bg-[#e8c690] px-4 py-2 text-sm font-medium text-[#1b1b1b] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === 'idle' ? <Play className="size-4" /> : <Square className="size-4" />}
              {phase === 'synthesizing'
                ? '生成中…'
                : phase === 'playing'
                  ? '停止播放'
                  : '生成并播放'}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
