import { useState, type ReactElement } from 'react'
import { useMemoryStore } from '@renderer/stores/memoryStore'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { Switch } from '@renderer/components/ui/switch'

/**
 * @description 渲染长期记忆读取范围设置。
 * @returns 长期记忆设置页面。
 */
export function MemoryTab(): ReactElement {
  const settings = useMemoryStore((state) => state.settings)
  const saveSettings = useMemoryStore((state) => state.saveSettings)
  const [error, setError] = useState<string | null>(null)

  /**
   * @description 保存跨会话读取范围变更。
   * @param checked 是否允许读取当前角色的其他会话。
   */
  async function updateCrossSessionScope(checked: boolean): Promise<void> {
    setError(null)
    try {
      await saveSettings({ ...settings, crossSessionCharacterMemory: checked })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="mx-auto h-full overflow-y-auto px-4 pb-4">
      <SectionCard title="长期记忆">
        <SettingItem
          title="读取同角色全部会话"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              关闭后，Agent 只能读取当前会话派生的长期记忆。不会创建索引，也不会下载模型。
            </p>
          ]}
        >
          <Switch
            id="cross-session-character-memory"
            checked={settings.crossSessionCharacterMemory}
            onCheckedChange={(checked) => void updateCrossSessionScope(checked)}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        {error && <p className="px-4 pb-3 text-xs text-red-200">保存失败：{error}</p>}
      </SectionCard>
    </div>
  )
}
