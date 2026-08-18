import { useEffect, useState, type ReactElement } from 'react'
import { createDefaultAgentSettingsStore, type AgentSettingsStore } from '@shared/agent-settings'
import type { AgentToolPackageId } from '@shared/agent'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { Switch } from '@renderer/components/ui/switch'

/**
 * @description 渲染聊天 Agent 的工具策略设置。
 * @returns Agent 设置页面。
 */
export function AgentTab(): ReactElement {
  const [settings, setSettings] = useState<AgentSettingsStore>(createDefaultAgentSettingsStore)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loaded) {
      return
    }
    void window.settings
      .getUnifiedSettings()
      .then((unified) => {
        setSettings(unified.agent)
        setLoaded(true)
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause))
        setLoaded(true)
      })
  }, [loaded])

  /**
   * @description 保存 Agent 是否允许综合多个资源来源的设置。
   * @param allow 是否允许跨资源综合。
   */
  async function updateCrossResourcePolicy(allow: boolean): Promise<void> {
    await saveSettings({ ...settings, allowCrossResourceContext: allow })
  }

  /**
   * @description 切换一个工具包是否会暴露给聊天模型。
   * @param toolPackageId 需要更新的工具包标识。
   * @param enabled 是否启用该工具包。
   */
  async function updateToolPackage(
    toolPackageId: AgentToolPackageId,
    enabled: boolean
  ): Promise<void> {
    const enabledToolPackageIds = enabled
      ? [...new Set([...settings.enabledToolPackageIds, toolPackageId])]
      : settings.enabledToolPackageIds.filter((id) => id !== toolPackageId)
    await saveSettings({ ...settings, enabledToolPackageIds })
  }

  /**
   * @description 保存完整的 Agent 设置快照并在失败时保留错误信息。
   * @param next 待保存的 Agent 设置。
   */
  async function saveSettings(next: AgentSettingsStore): Promise<void> {
    setSettings(next)
    setError(null)
    try {
      setSettings(await window.settings.saveAgent(next))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="mx-auto h-full overflow-y-auto px-4 pb-4">
      <SectionCard title="回答与工具">
        <SettingItem
          title="允许综合多个信息来源"
          description="关闭后，一次回答只能使用 Lore、长期记忆或其他单一资源来源；同一来源的多个工具调用仍可并行。"
        >
          <Switch
            id="agent-cross-resource"
            checked={settings.allowCrossResourceContext}
            disabled={!loaded}
            onCheckedChange={(checked) => void updateCrossResourcePolicy(checked)}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="允许查询原作与长期记忆"
          description="关闭后，模型不会看到原作资料和长期记忆查询工具。"
        >
          <Switch
            id="agent-resource-query"
            checked={settings.enabledToolPackageIds.includes('resource-query')}
            disabled={!loaded}
            onCheckedChange={(checked) => void updateToolPackage('resource-query', checked)}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="允许查询当前时间"
          description="关闭后，模型不会看到当前日期和时间查询工具。"
        >
          <Switch
            id="agent-datetime"
            checked={settings.enabledToolPackageIds.includes('datetime')}
            disabled={!loaded}
            onCheckedChange={(checked) => void updateToolPackage('datetime', checked)}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <p className="px-4 py-3 text-xs text-white/55">工具循环上限：3 轮。所有工具均为只读。</p>
        {error && <p className="px-4 pb-3 text-xs text-red-200">保存失败：{error}</p>}
      </SectionCard>
    </div>
  )
}
