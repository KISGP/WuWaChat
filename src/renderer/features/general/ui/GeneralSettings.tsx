import type { ReactElement } from 'react'
import {
  GITHUB_PROXY_OPTIONS,
  MAX_MESSAGE_COLLAPSE_LINE_COUNT,
  MIN_MESSAGE_COLLAPSE_LINE_COUNT,
  CHAT_IMAGE_QUALITY_MIN,
  CHAT_IMAGE_QUALITY_MAX,
  CHAT_IMAGE_PRESETS,
  type ChatImagePreset,
  type AnimationPreference
} from '@shared/app-settings'
import { Switch } from '@renderer/common/components/switch'
import { SectionCard } from '@renderer/common/components/SectionCard'
import { SettingItem } from '@renderer/common/components/SettingItem'
import { useAppSettingsStore } from '@renderer/store/app-settings'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/common/components/select'

const ANIMATION_OPTIONS: { value: AnimationPreference; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'enabled', label: '开启' },
  { value: 'disabled', label: '关闭' }
]

/**
 * @description 渲染应用通用设置，包括界面动画、消息显示和 GitHub 资源代理策略。
 * @returns 通用设置页内容。
 */
export function GeneralTab(): ReactElement {
  const animationPreference = useAppSettingsStore((state) => state.settings.animationPreference)
  const setAnimationPreference = useAppSettingsStore((state) => state.setAnimationPreference)
  const developerToolsEnabled = useAppSettingsStore(
    (state) => state.settings.developerToolsEnabled
  )
  const setDeveloperToolsEnabled = useAppSettingsStore((state) => state.setDeveloperToolsEnabled)
  const agentRunRecordingEnabled = useAppSettingsStore(
    (state) => state.settings.agentRunRecordingEnabled
  )
  const setAgentRunRecordingEnabled = useAppSettingsStore(
    (state) => state.setAgentRunRecordingEnabled
  )
  const messageCollapseLineCount = useAppSettingsStore(
    (state) => state.settings.messageCollapseLineCount
  )
  const setMessageCollapseLineCount = useAppSettingsStore(
    (state) => state.setMessageCollapseLineCount
  )
  const githubProxy = useAppSettingsStore((state) => state.settings.githubProxy)
  const updateGithubProxySettings = useAppSettingsStore((state) => state.updateGithubProxySettings)
  const chatImageProcessing = useAppSettingsStore((state) => state.settings.chatImageProcessing)
  const updateChatImageProcessing = useAppSettingsStore((state) => state.updateChatImageProcessing)
  const chatSendMerge = useAppSettingsStore((state) => state.settings.chatSendMerge)
  const updateChatSendMerge = useAppSettingsStore((state) => state.updateChatSendMerge)

  return (
    <div className="h-full overflow-y-auto px-4">
      <SectionCard title="界面">
        <SettingItem
          title="界面动画"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              关闭后，界面会直接切换到目标状态。系统的减少动态效果偏好始终优先。
            </p>
          ]}
        >
          <div
            role="radiogroup"
            aria-label="界面动画"
            className="flex overflow-hidden rounded border border-white/15"
          >
            {ANIMATION_OPTIONS.map((option) => {
              const isSelected = option.value === animationPreference
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => void setAnimationPreference(option.value)}
                  className={`min-w-20 border-r border-white/15 px-3 py-2 text-sm transition-colors last:border-r-0 ${isSelected ? 'bg-[#e8c690] text-[#1b1b1b]' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'}`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </SettingItem>
      <SettingItem
        title="自动折叠行数"
        expandedItems={[
          <p key="description" className="text-muted-foreground">
            消息超过设定行数时会折叠，并可按需展开。
          </p>
        ]}
      >
        <input
          type="number"
          min={MIN_MESSAGE_COLLAPSE_LINE_COUNT}
          max={MAX_MESSAGE_COLLAPSE_LINE_COUNT}
          value={messageCollapseLineCount}
          onChange={(event) => {
            const value = event.currentTarget.valueAsNumber
            if (!Number.isNaN(value))
              void setMessageCollapseLineCount(
                Math.min(
                  MAX_MESSAGE_COLLAPSE_LINE_COUNT,
                  Math.max(MIN_MESSAGE_COLLAPSE_LINE_COUNT, value)
                )
              )
          }}
          className="w-20 border border-white/15 bg-black/35 px-3 py-2 text-center text-sm text-white transition-colors outline-none focus:border-[#e8c690]"
          aria-label="自动折叠行数"
        />
      </SettingItem>
      </SectionCard>
      <SectionCard title="聊天">
        <SettingItem
          title="合并连续发送"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              在短时间内连续发送的消息会显示为独立气泡，并合并为一次模型请求。
            </p>,
            <label key="delay" className="flex items-center justify-between">
              <span className="text-md text-white/55">等待秒数</span>
              <input
                type="number"
                defaultValue={chatSendMerge.delaySeconds}
                disabled={!chatSendMerge.enabled}
                onBlur={(event) => {
                  const value = Number(event.currentTarget.value)
                  if (Number.isFinite(value)) {
                    const delaySeconds = value
                    event.currentTarget.value = String(delaySeconds)
                    void updateChatSendMerge({ delaySeconds })
                  } else {
                    event.currentTarget.value = String(chatSendMerge.delaySeconds)
                  }
                }}
                className="w-20 border border-white/15 bg-black/35 px-3 py-2 text-center text-sm text-white outline-none focus:border-[#e8c690] disabled:opacity-50"
              />
            </label>
          ]}
        >
          <Switch
            checked={chatSendMerge.enabled}
            onCheckedChange={(enabled) => void updateChatSendMerge({ enabled })}
            aria-label="合并连续发送"
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="请求时处理图片"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              关闭时按原图发送；质量 100 表示不压缩，“保持原尺寸”表示不缩放，长边 1024 是 token 与画质的平衡档。
            </p>,
            <label key="quality" className="flex items-center justify-between">
              <span className="text-md text-white/55">压缩质量</span>
              <input
                type="number"
                min={CHAT_IMAGE_QUALITY_MIN}
                max={CHAT_IMAGE_QUALITY_MAX}
                defaultValue={chatImageProcessing.compression.quality}
                disabled={!chatImageProcessing.enabled}
                onBlur={(event) => {
                  const value = Number(event.currentTarget.value)
                  if (Number.isFinite(value)) {
                    const quality = Math.min(
                      CHAT_IMAGE_QUALITY_MAX,
                      Math.max(CHAT_IMAGE_QUALITY_MIN, Math.round(value))
                    )
                    event.currentTarget.value = String(quality)
                    void updateChatImageProcessing({
                      compression: { ...chatImageProcessing.compression, quality }
                    })
                  } else {
                    event.currentTarget.value = String(chatImageProcessing.compression.quality)
                  }
                }}
                className="w-20 border border-white/15 bg-black/35 px-3 py-2 text-center text-sm text-white outline-none focus:border-[#e8c690] disabled:opacity-50"
              />
            </label>,
            <label key="preset" className="flex items-center justify-between">
              <span className="text-md text-white/55">预设尺寸</span>
              <Select
                value={String(chatImageProcessing.resize.preset)}
                disabled={!chatImageProcessing.enabled}
                onValueChange={(value) => {
                  const preset: ChatImagePreset = value === 'original' ? 'original' : (Number(value) as ChatImagePreset)
                  void updateChatImageProcessing({ resize: { ...chatImageProcessing.resize, preset } })
                }}
              >
                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHAT_IMAGE_PRESETS.map((preset) => (
                    <SelectItem key={String(preset)} value={String(preset)}>
                      {preset === 'original' ? '保持原尺寸' : `长边 ${preset}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ]}
        >
          <Switch
            checked={chatImageProcessing.enabled}
            onCheckedChange={(enabled) => void updateChatImageProcessing({ enabled })}
            aria-label="请求时处理图片"
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
      </SectionCard>
      <SectionCard title="高级">
        <SettingItem
          title="使用 GitHub 代理设置"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              仅用于角色和背景资料的 GitHub
              资源请求。关闭代理时会保留当前选择，代理请求失败后不会自动切换来源。
            </p>,
            ...GITHUB_PROXY_OPTIONS.map((option) => (
              <label key={option.id} className="flex items-center justify-between">
                <span className="text-md text-white/55">{option.label}</span>
                <Switch
                  id={`github-proxy-${option.id}`}
                  checked={githubProxy.selectedOptionId === option.id}
                  disabled={!githubProxy.enabled || githubProxy.selectedOptionId === option.id}
                  onCheckedChange={(checked) => {
                    if (checked) void updateGithubProxySettings({ selectedOptionId: option.id })
                  }}
                  className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
                />
              </label>
            ))
          ]}
        >
          <Switch
            id="github-proxy-enabled"
            checked={githubProxy.enabled}
            onCheckedChange={(enabled) => void updateGithubProxySettings({ enabled })}
            aria-label="使用 GitHub 代理设置"
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="开发者工具"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              开启后，在设置侧边栏显示 Agent 运行记录和 Agent 调试。默认关闭。
            </p>
          ]}
        >
          <Switch
            id="developer-tools-enabled"
            checked={developerToolsEnabled}
            onCheckedChange={(enabled) => void setDeveloperToolsEnabled(enabled)}
            aria-label="开发者工具"
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="保存 Agent 运行记录"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              开启后保存新的 Agent 原始运行事件到对应会话；关闭后不会删除已有记录。
            </p>
          ]}
        >
          <Switch
            id="agent-run-recording-enabled"
            checked={agentRunRecordingEnabled}
            onCheckedChange={(enabled) => void setAgentRunRecordingEnabled(enabled)}
            aria-label="保存 Agent 运行记录"
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
      </SectionCard>
    </div>
  )
}
