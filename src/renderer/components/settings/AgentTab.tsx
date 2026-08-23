import { useEffect, useState, type ReactElement } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { createDefaultAgentSettingsStore, type AgentSettingsStore } from '@shared/agent-settings'
import type { AgentToolPackageId } from '@shared/agent'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'

/**
 * @description 渲染聊天 Agent 的工具策略设置。
 * @returns Agent 设置页面。
 */
export function AgentTab(): ReactElement {
  const [settings, setSettings] = useState<AgentSettingsStore>(createDefaultAgentSettingsStore)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBotPassword, setShowBotPassword] = useState(false)
  const [moegirlpediaTestState, setMoeGirlpediaTestState] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle')
  const [moegirlpediaTestMessage, setMoeGirlpediaTestMessage] = useState<string | null>(null)
  const [moegirlpediaDraft, setMoeGirlpediaDraft] = useState(
    createDefaultAgentSettingsStore().moegirlpedia
  )

  useEffect(() => {
    if (loaded) {
      return
    }
    void window.settings
      .getUnifiedSettings()
      .then((unified) => {
        setSettings(unified.agent)
        setMoeGirlpediaDraft(unified.agent.moegirlpedia)
        setLoaded(true)
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause))
        setLoaded(true)
      })
  }, [loaded])

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
   * @description 更新并保存 Agent 工具循环最大轮次。
   * @param value 输入框提供的候选轮次数值。
   */
  async function updateMaxToolRounds(value: number): Promise<void> {
    if (Number.isNaN(value)) {
      return
    }
    const maxToolRounds = Math.round(value)
    await saveSettings({ ...settings, maxToolRounds })
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

  /**
   * @description 更新萌娘百科配置草稿，避免每次按键都触发磁盘写入。
   * @param patch 需要变更的萌娘百科配置字段。
   */
  function updateMoeGirlpediaDraft(patch: Partial<AgentSettingsStore['moegirlpedia']>): void {
    setMoeGirlpediaDraft((current) => ({ ...current, ...patch }))
  }

  /**
   * @description 保存萌娘百科配置草稿，并在失败时保留当前输入。
   */
  async function saveMoeGirlpediaSettings(): Promise<void> {
    await saveSettings({ ...settings, moegirlpedia: moegirlpediaDraft })
  }

  /**
   * @description 使用当前萌娘百科配置测试登录和 API 会话。
   */
  async function testMoeGirlpediaConnection(): Promise<void> {
    setMoeGirlpediaTestState('testing')
    setMoeGirlpediaTestMessage(null)
    try {
      await saveMoeGirlpediaSettings()
      const result = await window.settings.testMoeGirlpedia({
        requestId: `moegirlpedia-test-${Date.now()}`,
        settings: moegirlpediaDraft
      })
      setMoeGirlpediaTestState(result.ok ? 'success' : 'error')
      setMoeGirlpediaTestMessage(
        result.ok && result.username
          ? `${result.message} 当前用户：${result.username}（${result.latencyMs} ms）`
          : `${result.message}（${result.latencyMs} ms）`
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setMoeGirlpediaTestState('error')
      setMoeGirlpediaTestMessage(message)
    }
  }

  return (
    <div className="mx-auto h-full overflow-y-auto px-4 pb-4">
      <SectionCard title="回答与工具">
        <SettingItem
          title="工具循环最大轮次"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              一次回答中 Agent 最多连续调用工具的轮次。
            </p>
          ]}
        >
          <input
            type="number"
            step={1}
            value={settings.maxToolRounds}
            onChange={(event) => void updateMaxToolRounds(event.currentTarget.valueAsNumber)}
            disabled={!loaded}
            className="w-20 border border-white/15 bg-black/35 px-3 py-2 text-center text-sm text-white transition-colors outline-none focus:border-[#e8c690]"
            aria-label="工具循环最大轮次"
          />
        </SettingItem>
        <SettingItem
          title="允许读取背景资料"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              关闭后，模型不会看到当前角色参与的场景。
            </p>
          ]}
        >
          <Switch
            id="agent-story"
            checked={settings.enabledToolPackageIds.includes('story')}
            disabled={!loaded}
            onCheckedChange={(checked) => void updateToolPackage('story', checked)}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="允许查询世界观词典"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              关闭后，模型不会看到本地名词解释查询工具。
            </p>
          ]}
        >
          <Switch
            id="agent-glossary"
            checked={settings.enabledToolPackageIds.includes('glossary')}
            disabled={!loaded}
            onCheckedChange={(checked) => void updateToolPackage('glossary', checked)}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="允许查询长期记忆"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              关闭后，模型不会看到会话长期记忆查询工具。
            </p>
          ]}
        >
          <Switch
            id="agent-memory"
            checked={settings.enabledToolPackageIds.includes('memory')}
            disabled={!loaded}
            onCheckedChange={(checked) => void updateToolPackage('memory', checked)}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="允许查询当前时间"
          expandedItems={[
            <p key="description" className="text-muted-foreground">
              关闭后，模型不会看到当前日期和时间查询工具。
            </p>
          ]}
        >
          <Switch
            id="agent-datetime"
            checked={settings.enabledToolPackageIds.includes('datetime')}
            disabled={!loaded}
            onCheckedChange={(checked) => void updateToolPackage('datetime', checked)}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem
          title="允许查询萌娘百科"
          expandedItems={[
            <p key="moegirlpedia-description" className="text-white/55">
              使用萌娘百科 Bot Password 登录
              API。用户名填写“用户@机器人名称”。https://zh.moegirl.org.cn/Special:机器人密码
            </p>,
            <label key="username" className="flex items-center justify-between">
              <span className="text-md text-white/55">用户名</span>
              <Input
                value={moegirlpediaDraft.username}
                onChange={(event) =>
                  updateMoeGirlpediaDraft({ username: event.currentTarget.value })
                }
                onBlur={() => void saveMoeGirlpediaSettings()}
                disabled={!loaded}
                className="w-md"
              />
            </label>,
            <label key="bot-password" className="flex items-center justify-between">
              <span className="text-xs text-white/55">Bot Password</span>
              <span className="relative">
                <Input
                  type={showBotPassword ? 'text' : 'password'}
                  value={moegirlpediaDraft.botPassword}
                  onChange={(event) =>
                    updateMoeGirlpediaDraft({ botPassword: event.currentTarget.value })
                  }
                  onBlur={() => void saveMoeGirlpediaSettings()}
                  placeholder="输入萌娘百科机器人密码"
                  className="w-md pr-8"
                  disabled={!loaded}
                />
                <button
                  type="button"
                  onClick={() => setShowBotPassword((value) => !value)}
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center text-white/45 hover:text-white/80"
                  title={showBotPassword ? '隐藏 Bot Password' : '显示 Bot Password'}
                >
                  {showBotPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </label>,
            <div key="connection-test" className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void testMoeGirlpediaConnection()}
                disabled={!loaded || moegirlpediaTestState === 'testing'}
                className="rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {moegirlpediaTestState === 'testing' ? '测试中…' : '测试连接'}
              </button>
              {moegirlpediaTestMessage && (
                <p
                  className={
                    moegirlpediaTestState === 'success'
                      ? 'text-sm text-emerald-200'
                      : 'text-sm text-red-200'
                  }
                >
                  {moegirlpediaTestMessage}
                </p>
              )}
            </div>
          ]}
        >
          <Switch
            id="agent-moegirlpedia"
            checked={settings.enabledToolPackageIds.includes('moegirlpedia')}
            disabled={!loaded}
            onCheckedChange={(checked) => void updateToolPackage('moegirlpedia', checked)}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        {error && <p className="px-4 pb-3 text-xs text-red-200">保存失败：{error}</p>}
      </SectionCard>
    </div>
  )
}
