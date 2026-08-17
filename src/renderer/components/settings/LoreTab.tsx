import { useEffect, useState, type ReactElement } from 'react'
import { Database, Download, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react'
import type { LoreStatus } from '@shared/lore'
import { useMemorySettingsDraft } from '@renderer/hooks/useMemorySettingsDraft'
import { useMemoryStore } from '@renderer/stores/memoryStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { cn } from '@renderer/utils'
import { formatDateTime } from '@renderer/components/settings/memory/helpers'
import { SectionCard } from '@renderer/components/settings/section'
import { SettingItem } from '@renderer/components/settings/setting-item'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'

/**
 * @description Renders the Lore retrieval policy, router profile, and source maintenance controls.
 * @returns The Lore settings page.
 */
export function LoreTab(): ReactElement {
  const settings = useMemoryStore((state) => state.settings)
  const localModels = useMemoryStore((state) => state.localModels)
  const refreshLocalModels = useMemoryStore((state) => state.refreshLocalModels)
  const saveSettings = useMemoryStore((state) => state.saveSettings)
  const profiles = useSettingsStore((state) => state.store.profiles)
  const loreRouterProfileId = useSettingsStore((state) => state.store.loreRouterProfileId)
  const setLoreRouterProfileId = useSettingsStore((state) => state.setLoreRouterProfileId)
  const { draft, autosaveState, updateDraft, retryAutosave } = useMemorySettingsDraft(
    settings,
    saveSettings
  )
  const [loreStatus, setLoreStatus] = useState<LoreStatus | null>(null)
  const [loreBusy, setLoreBusy] = useState(false)
  const [loreError, setLoreError] = useState<string | null>(null)
  const selectedLocalModel = localModels.find((model) => model.isSelected) || null

  useEffect(() => {
    let cancelled = false

    void Promise.all([window.lore.getStatus(), refreshLocalModels()])
      .then(([status]) => {
        if (!cancelled) {
          setLoreStatus(status)
          setLoreError(status.message || null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoreError(error instanceof Error ? error.message : String(error))
        }
        console.error('Failed to load Lore settings', error)
      })

    return () => {
      cancelled = true
    }
  }, [refreshLocalModels])

  /**
   * @description Runs a Lore source maintenance action and refreshes the displayed package status.
   * @param action The Lore IPC operation to run.
   */
  async function runLoreAction(action: () => Promise<LoreStatus>): Promise<void> {
    setLoreBusy(true)
    setLoreError(null)
    try {
      const status = await action()
      setLoreStatus(status)
      setLoreError(status.message || null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setLoreError(message)
      console.error('Failed to update Lore knowledge', error)
    } finally {
      setLoreBusy(false)
    }
  }

  const saveMessage =
    autosaveState === 'error'
      ? 'Lore 知识设置保存失败'
      : autosaveState === 'saving'
        ? '正在保存 Lore 知识设置...'
        : 'Lore 知识设置会自动保存'

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 overflow-y-auto px-4 pb-3">
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded border px-4 py-3 text-sm',
          autosaveState === 'error'
            ? 'border-red-400/30 bg-red-500/10 text-red-100'
            : 'border-white/10 bg-black/20 text-white/65'
        )}
      >
        <span>{saveMessage}</span>
        {autosaveState === 'error' && (
          <button
            type="button"
            onClick={() => void retryAutosave()}
            className="flex shrink-0 items-center gap-1.5 rounded border border-red-300/30 px-2.5 py-1.5 text-xs hover:bg-red-500/15"
          >
            <RotateCcw className="size-3.5" />
            重试
          </button>
        )}
      </div>

      <SectionCard title="Lore 检索">
        <SettingItem
          title="启用 Lore 知识检索"
          description="按本轮路由检索原作剧情与术语，并追加到提示词上下文。"
        >
          <Switch
            id="switch-lore"
            checked={draft.loreSearchEnabled}
            onCheckedChange={(checked) => updateDraft({ loreSearchEnabled: checked })}
            className="data-unchecked:bg-input/20 data-checked:bg-[#e8c690]"
          />
        </SettingItem>
        <SettingItem title="剧情场景上限" description="限制每轮最多注入多少条原作剧情场景。">
          <Input
            value={draft.loreTopK}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isInteger(value) && value > 0) {
                updateDraft({ loreTopK: value })
              }
            }}
          />
        </SettingItem>
        <SettingItem
          title="Lore 路由模型"
          description="判断本轮是否需要检索原作；默认跟随当前聊天模型。"
        >
          <Select
            value={loreRouterProfileId || 'current-chat'}
            onValueChange={(value) =>
              setLoreRouterProfileId(value === 'current-chat' ? null : value)
            }
          >
            <SelectTrigger className="w-60 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="current-chat">跟随当前聊天模型</SelectItem>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </SectionCard>

      <SectionCard title="Lore 知识包">
        <div className="space-y-3 rounded border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
            <span
              className={cn(
                'rounded border px-2 py-1',
                loreStatus?.available
                  ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
                  : 'border-amber-300/30 bg-amber-500/10 text-amber-100'
              )}
            >
              {loreStatus?.available ? '可用' : '未就绪'}
            </span>
            <span>任务：{loreStatus?.taskCount ?? '-'}</span>
            <span>场景：{loreStatus?.sceneCount ?? '-'}</span>
            <span>术语：{loreStatus?.termCount ?? '-'}</span>
            <span>语义索引：{formatDateTime(loreStatus?.semanticIndexBuiltAt)}</span>
          </div>
          <p className="text-xs leading-5 text-white/55">
            剧情优先按任务和场景定位；缺少原文锚点时才使用任务级语义索引，术语只精确匹配原文定义。
          </p>
          {loreError && <p className="text-xs leading-5 text-amber-200/85">{loreError}</p>}
          <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
            <LoreActionButton
              icon={Download}
              label="更新 Lore 知识"
              busy={loreBusy}
              onClick={() => runLoreAction(() => window.lore.updateSource())}
            />
            <LoreActionButton
              icon={RefreshCw}
              label="重建 Lore 知识包"
              busy={loreBusy}
              onClick={() => runLoreAction(() => window.lore.rebuild())}
            />
            <LoreActionButton
              icon={Database}
              label="构建任务语义索引"
              busy={loreBusy}
              disabled={!selectedLocalModel}
              disabledReason="请先下载并选择一个本地语义模型。"
              onClick={() => runLoreAction(() => window.lore.buildSemanticIndex())}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

/**
 * @description Renders a Lore package maintenance command with its pending and disabled states.
 * @param props The command icon, label, state, and action.
 * @returns A Lore package maintenance command.
 */
function LoreActionButton({
  icon: Icon,
  label,
  busy,
  disabled,
  disabledReason,
  onClick
}: {
  icon: typeof Download
  label: string
  busy: boolean
  disabled?: boolean
  disabledReason?: string
  onClick: () => Promise<void>
}): ReactElement {
  return (
    <div>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => void onClick()}
        className="flex w-full items-center justify-center gap-2 rounded border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/75 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Icon className="size-4" />}
        {busy ? '处理中...' : label}
      </button>
      {disabledReason && (
        <p className="mt-1 text-xs leading-5 text-amber-200/85">{disabledReason}</p>
      )}
    </div>
  )
}
