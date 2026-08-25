import { type ReactElement, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, Download, LoaderCircle, Save } from 'lucide-react'
import type { CharacterCatalog, LocalCharacterEntry, RemoteCharacterEntry } from '@shared/chat'
import { useAsyncAction } from '@renderer/hooks/useAsyncAction'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { cn } from '@renderer/utils'

type ListItem = {
  id: string
  name: string
  description?: string
  avatar?: string
  cardBg?: string
  local?: LocalCharacterEntry
  remote?: RemoteCharacterEntry
}

/** @description 渲染自动同步的统一角色列表，并提供失败重试与 Prompt 更新确认。 */
export function CharacterTab(): ReactElement {
  const refreshCharacters = useCharacterStore((state) => state.refreshCharacters)
  const [catalog, setCatalog] = useState<CharacterCatalog>({
    local: [],
    remote: [],
    refreshedAt: null,
    isSyncing: false
  })
  const [selectedId, setSelectedId] = useState('')
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState('')
  const [remotePrompt, setRemotePrompt] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const load = async (): Promise<void> => {
    try {
      const next = await window.characters.getCharacterCatalog()
      setCatalog(next)
      setError(next.syncError || '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!catalog.isSyncing) return
    const timer = window.setInterval(() => void load(), 800)
    return () => window.clearInterval(timer)
  }, [catalog.isSyncing])
  const items = useMemo(
    () =>
      [
        ...catalog.local.map(
          (local): ListItem => ({
            id: local.id,
            name: local.name,
            description: local.description,
            avatar: local.avatar,
            cardBg: local.cardBg,
            local
          })
        ),
        ...catalog.remote.map(
          (remote): ListItem => ({
            id: remote.id,
            name: remote.name,
            description: remote.description,
            avatar: remote.avatar,
            cardBg: remote.cardBg,
            remote
          })
        )
      ].sort((left, right) =>
        Boolean(left.remote?.syncError) === Boolean(right.remote?.syncError)
          ? left.name.localeCompare(right.name, 'zh-CN')
          : left.remote?.syncError
            ? 1
            : -1
      ),
    [catalog]
  )
  const selected = items.find((item) => item.id === selectedId) || items[0] || null
  const local = selected?.local
  const prompt = local ? (drafts[local.id] ?? prompts[local.id] ?? '') : ''
  useEffect(() => {
    if (!local || prompts[local.id] !== undefined) return
    let mounted = true
    window.ai
      .getCharacterPrompt(local.id)
      .then((document) => {
        if (mounted) setPrompts((current) => ({ ...current, [local.id]: document.prompt }))
      })
      .catch((cause) => {
        if (mounted) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      mounted = false
    }
  }, [local, prompts])
  const { loading: saving, run: save } = useAsyncAction(async () => {
    if (!local) throw new Error('No installed character selected')
    const document = await window.ai.saveCharacterPrompt(local.id, prompt)
    setPrompts((current) => ({ ...current, [document.characterId]: document.prompt }))
    setDrafts((current) => {
      const next = { ...current }
      delete next[document.characterId]
      return next
    })
  })
  const retry = async (): Promise<void> => {
    if (!selected?.remote) return
    setRetrying(selected.id)
    try {
      setCatalog(await window.characters.retryCharacterSync(selected.id))
      await refreshCharacters()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRetrying('')
    }
  }
  const openUpdate = async (): Promise<void> => {
    if (!local) return
    try {
      setRemotePrompt(await window.characters.getPendingRemoteCharacterPrompt(local.id))
      setDialogOpen(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const applyUpdate = async (): Promise<void> => {
    if (!local) return
    setApplying(true)
    try {
      await window.characters.applyPendingRemoteCharacterPrompt(local.id)
      setPrompts((current) => ({ ...current, [local.id]: remotePrompt }))
      setDrafts((current) => {
        const next = { ...current }
        delete next[local.id]
        return next
      })
      await refreshCharacters()
      await load()
      setDialogOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setApplying(false)
    }
  }
  return (
    <div className="h-full overflow-y-auto px-4">
      <div className="mx-auto flex h-full gap-4 pb-6">
        <aside className="flex w-66 shrink-0 flex-col rounded border border-white/10 bg-black/20 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white/85">角色列表</div>
              <div className="mt-1 text-xs text-white/45">
                {catalog.isSyncing
                  ? '正在同步角色...'
                  : catalog.refreshedAt
                    ? '上次检查: ' + new Date(catalog.refreshedAt).toLocaleString()
                    : '等待角色同步'}
              </div>
            </div>
            {catalog.isSyncing && <LoaderCircle className="size-4 animate-spin text-[#e8c690]" />}
          </div>
          {error && (
            <div className="mb-3 rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedId(item.id)
                  setError('')
                }}
                className={cn(
                  'relative flex items-center overflow-hidden rounded border px-3 py-6 text-left',
                  selected?.id === item.id
                    ? 'border-[#e8c690]/50 bg-white/10'
                    : 'border-white/10 hover:bg-white/5'
                )}
              >
                {item.cardBg && (
                  <img
                    src={item.cardBg}
                    className={cn(
                      'pointer-events-none absolute right-0 h-full object-cover',
                      selected?.id === item.id ? 'opacity-100' : 'opacity-30'
                    )}
                  />
                )}
                <div className="relative text-sm font-medium text-white/90">{item.name}</div>
                {item.remote?.syncState === 'downloading' && (
                  <div className="relative mt-1 flex items-center gap-1 text-xs text-[#e8c690]">
                    <LoaderCircle className="size-3 animate-spin" />
                    下载中
                  </div>
                )}
                {item.remote?.syncError && (
                  <div className="relative mt-1 text-xs text-red-300">下载失败</div>
                )}
                {item.local?.syncStatus?.promptUpdateAvailable && (
                  <div className="relative mt-1 text-xs text-[#e8c690]">Prompt 有更新</div>
                )}
                {item.local?.syncStatus?.remoteUnavailable && (
                  <div className="relative mt-1 text-xs text-white/45">远端已下架</div>
                )}
              </button>
            ))}
            {!items.length && (
              <div className="py-6 text-center text-sm text-white/50">正在准备角色...</div>
            )}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col rounded border border-white/10 bg-black/20 p-4">
          {selected ? (
            local ? (
              <div className="flex h-full flex-col">
                <div className="mb-4 flex items-start gap-4">
                  <div className="size-16 shrink-0 overflow-hidden rounded-full border border-white/20 bg-black/50">
                    {selected.avatar && (
                      <img src={selected.avatar} alt="" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-medium text-white/90">{local.name}</div>
                    <div className="mt-1 text-sm leading-6 text-white/55">
                      {selected.description || '暂无描述'}
                    </div>
                  </div>
                </div>
                {local.syncStatus?.promptUpdateAvailable && (
                  <div className="mb-3 flex items-center justify-between rounded border border-[#e8c690]/35 bg-[#e8c690]/10 px-3 py-2 text-sm text-[#f1d9af]">
                    <span>远端 Prompt 有更新</span>
                    <button
                      type="button"
                      onClick={() => void openUpdate()}
                      className="rounded border border-[#e8c690]/50 px-3 py-1 text-xs"
                    >
                      查看并更新
                    </button>
                  </div>
                )}
                <textarea
                  value={prompt}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [local.id]: event.target.value }))
                  }
                  className="flex-1 resize-none rounded border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-white/90 outline-none focus:border-[#e8c690]"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                    className="flex items-center gap-2 rounded bg-[#e8c690]/90 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                  >
                    <Save className="size-4" />
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-white/60">
                <div>
                  {selected.remote?.syncState === 'downloading' ? '角色正在下载中' : '角色下载失败'}
                </div>
                {selected.remote?.syncState === 'failed' && (
                  <button
                    type="button"
                    onClick={() => void retry()}
                    disabled={retrying === selected.id}
                    className="flex items-center gap-2 rounded bg-[#e8c690]/90 px-4 py-2 text-sm font-medium text-black"
                  >
                    <Download className="size-4" />
                    {retrying ? '重试中...' : '重试下载'}
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-white/50">
              正在准备角色...
            </div>
          )}
        </main>
      </div>
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-100 bg-black/70" />
          <Dialog.Content className="fixed inset-8 z-101 flex flex-col rounded border border-white/15 bg-[#171717] p-5 outline-none">
            <Dialog.Title className="text-lg font-medium text-white">更新角色 Prompt</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-white/55">
              确认覆盖前，请查看本地与远端 Prompt 的全文差异。
            </Dialog.Description>
            <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-4">
              <textarea
                readOnly
                value={prompt}
                className="min-h-0 resize-none rounded border border-white/10 bg-black/35 p-3 text-sm text-white/85 outline-none"
              />
              <textarea
                readOnly
                value={remotePrompt}
                className="min-h-0 resize-none rounded border border-[#e8c690]/30 bg-black/35 p-3 text-sm text-white/85 outline-none"
              />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded border border-white/15 px-4 py-2 text-sm text-white/75"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void applyUpdate()}
                disabled={applying}
                className="flex items-center gap-2 rounded bg-[#e8c690]/90 px-4 py-2 text-sm font-medium text-black"
              >
                <Check className="size-4" />
                {applying ? '更新中...' : '覆盖并更新'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
