import { useState, type ReactElement } from 'react'
import { SectionCard } from '@renderer/components/settings/section'
import { useAppSettingsStore } from '@renderer/stores/appSettingsStore'
import { useCharacterRegistryStore } from '@renderer/stores/characterRegistryStore'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@renderer/components/ui/select'
import type { TtsSettings } from '@shared/app-settings'
import { cn } from '@renderer/utils'
import FishGlobalSettings from './FishAudio/GlobalSettings'
import FishCharacterSettings from './FishAudio/CharacterVoiceSettings'
import { IndexTtsCharacterVoiceSettings, IndexTtsGlobalSettings } from './local/index-tts'

/**
 * @description 渲染语音开关、独立的全局 TTS 服务配置和角色声音配置。
 * @returns TTS 设置页内容。
 */
export function TtsTab(): ReactElement {
  const characters = useCharacterRegistryStore((state) => state.registry.local)
  const ttsSettings = useAppSettingsStore((state) => state.settings.tts)
  const setTtsEnabled = useAppSettingsStore((state) => state.setTtsEnabled)
  const updateTtsSettings = useAppSettingsStore((state) => state.updateTtsSettings)
  const updateTtsProviderSettings = useAppSettingsStore((state) => state.updateTtsProviderSettings)
  const updateTtsCharacterVoice = useAppSettingsStore((state) => state.updateTtsCharacterVoice)
  const resetTtsCharacterVoice = useAppSettingsStore((state) => state.resetTtsCharacterVoice)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)

  return (
    <div className="h-full overflow-y-auto px-4 pb-6">
      <SectionCard title="语音播放">
        <div className="flex items-center justify-between rounded border-2 border-[rgb(51,51,51)] bg-black/50 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-white/90">启用语音</div>
            <div className="mt-1 text-xs text-white/55">已完成的角色消息会显示语音播放按钮。</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="启用语音"
            aria-checked={ttsSettings.enabled}
            onClick={() => void setTtsEnabled(!ttsSettings.enabled)}
            className={
              'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
              (ttsSettings.enabled ? 'bg-[#e8c690]' : 'bg-white/15')
            }
          >
            <span
              className={
                'absolute top-1 left-1 size-4 rounded-full bg-white transition-transform ' +
                (ttsSettings.enabled ? 'translate-x-5' : 'translate-x-0')
              }
            />
          </button>
        </div>
      </SectionCard>
      <GlobalTtsSettings
        provider={ttsSettings.provider}
        providers={ttsSettings.providers}
        onProviderChange={(provider) => void updateTtsSettings({ provider })}
        onProviderSettingsChange={updateTtsProviderSettings}
      />
      <SectionCard title="角色配置">
        <div className="space-y-2">
          {characters.map((character) => (
            <div
              key={character.id}
              onClick={() => setSelectedCharacterId(character.id)}
              aria-pressed={selectedCharacterId === character.id}
              className={cn(
                'group relative flex w-full items-center justify-between rounded border px-3 py-3 text-left transition-colors',
                selectedCharacterId === character.id
                  ? 'border-[#e8c690]/55 bg-[#e8c690]/10'
                  : 'border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/5'
              )}
            >
              <img
                src={character.cardBg}
                alt={character.name}
                className={cn(
                  'absolute top-0 left-0 h-full object-cover opacity-30',
                  selectedCharacterId === character.id ? 'opacity-100' : 'group-hover:opacity-50'
                )}
                draggable={false}
              />

              <div className="z-100 ml-30 w-fit truncate text-sm font-medium text-white/90">
                {character.name}
              </div>

              <div className="w-fit">
                {ttsSettings.provider === 'fish' ? (
                  <FishCharacterSettings
                    key={
                      character.id +
                      ':' +
                      (ttsSettings.characterVoices[character.id]?.fish?.referenceId || '')
                    }
                    character={character}
                    characterVoices={ttsSettings.characterVoices}
                    onChange={updateTtsCharacterVoice}
                    onReset={resetTtsCharacterVoice}
                  />
                ) : (
                  <IndexTtsCharacterVoiceSettings characterId={character.id} />
                )}
              </div>
            </div>
          ))}
          {!characters.length && (
            <p className="px-2 py-4 text-xs leading-5 text-white/45">暂无可配置的本地角色。</p>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

function GlobalTtsSettings({
  provider,
  providers,
  onProviderChange,
  onProviderSettingsChange
}: {
  provider: 'local' | 'fish'
  providers: TtsSettings['providers']
  onProviderChange: (provider: 'local' | 'fish') => void
  onProviderSettingsChange: <P extends keyof TtsSettings['providers']>(
    provider: P,
    patch: Partial<TtsSettings['providers'][P]>
  ) => Promise<void>
}): ReactElement {
  return (
    <SectionCard title="TTS 配置">
      <div className="space-y-4 rounded border-2 border-[rgb(51,51,51)] bg-black/50 p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-white/55">Provider</span>
          <Select
            value={provider}
            onValueChange={(value) => onProviderChange(value === 'fish' ? 'fish' : 'local')}
          >
            <SelectTrigger className="h-10 w-full rounded border-white/15 bg-black/35 px-3 text-sm text-white">
              <span data-slot="select-value">
                {provider === 'fish' ? 'Fish Audio' : '本地推理'}
              </span>
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="min-w-(--radix-select-trigger-width) rounded border-0"
            >
              <SelectItem value="local">本地推理</SelectItem>
              <SelectItem value="fish">Fish Audio</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {provider === 'fish' ? (
          <FishGlobalSettings
            settings={providers.fish}
            onChange={(patch) => onProviderSettingsChange('fish', patch)}
          />
        ) : (
          <IndexTtsGlobalSettings
            settings={{
              engine: providers.local.engine,
              baseUrl: providers.local.engineConfigs.indexTts.baseUrl
            }}
            onEngineChange={(engine) => onProviderSettingsChange('local', { engine })}
            onChange={(patch) =>
              onProviderSettingsChange('local', {
                engineConfigs: {
                  ...providers.local.engineConfigs,
                  indexTts: { ...providers.local.engineConfigs.indexTts, ...patch }
                }
              })
            }
          />
        )}
      </div>
    </SectionCard>
  )
}
