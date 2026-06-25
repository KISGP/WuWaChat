import { type ReactElement, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw, RotateCcw, Save } from 'lucide-react'
import type { CharacterCatalog, LocalCharacterEntry, RemoteCharacterEntry } from '@shared/chat'
import { useAsyncAction } from '@renderer/hooks/useAsyncAction'
import { trackUiEvent } from '@renderer/logging'
import { useCharacterStore } from '@renderer/stores/characterStore'
import { cn } from '@renderer/utils'

type CharacterListItemOrigin = 'local-custom' | 'preset-downloaded' | 'remote-only'

type CharacterListItem = {
  id: string
  name: string
  description?: string
  avatar?: string
  cardBg?: string
  origin: CharacterListItemOrigin
  isDownloaded: boolean
  localEntry?: LocalCharacterEntry
  remoteEntry?: RemoteCharacterEntry
}

function formatRefreshTime(value: string | null): string {
  if (!value) {
    return '尚未刷新远端角色列表'
  }

  return `上次刷新: ${new Date(value).toLocaleString()}`
}

function getOriginLabel(origin: CharacterListItemOrigin): string[] {
  if (origin === 'preset-downloaded') {
    return ['已下载', '预设']
  }

  if (origin === 'remote-only') {
    return ['远端']
  }

  return ['本地']
}

function getOriginDescription(origin: CharacterListItemOrigin): string {
  if (origin === 'preset-downloaded') {
    return '预设角色'
  }

  if (origin === 'remote-only') {
    return '远端未下载'
  }

  return '本地角色'
}

function getStatusText(origin: CharacterListItemOrigin): string {
  return origin === 'remote-only' ? '未下载' : '已下载'
}

export function CharacterTab(): ReactElement {
  const refreshCharacters = useCharacterStore((state) => state.refreshCharacters)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [catalog, setCatalog] = useState<CharacterCatalog>({
    local: [],
    remote: [],
    refreshedAt: null
  })
  const [catalogError, setCatalogError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeActionId, setActiveActionId] = useState('')
  const [loadedPrompts, setLoadedPrompts] = useState<Record<string, string>>({})
  const [draftPrompts, setDraftPrompts] = useState<Record<string, string>>({})
  const [remotePromptPreviewById, setRemotePromptPreviewById] = useState<Record<string, string>>({})
  const [remotePromptLoadingId, setRemotePromptLoadingId] = useState('')

  const characters = useMemo(() => {
    const localItems: CharacterListItem[] = catalog.local.map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      avatar: character.avatar,
      cardBg: character.cardBg,
      origin: character.source === 'preset' ? 'preset-downloaded' : 'local-custom',
      isDownloaded: true,
      localEntry: character,
      remoteEntry: catalog.remote.find((remote) => remote.id === character.id)
    }))
    const localIds = new Set(localItems.map((character) => character.id))
    const remoteOnlyItems: CharacterListItem[] = catalog.remote
      .filter((character) => !localIds.has(character.id))
      .map((character) => ({
        id: character.id,
        name: character.name,
        description: character.description,
        origin: 'remote-only',
        isDownloaded: false,
        remoteEntry: character
      }))

    return [...localItems, ...remoteOnlyItems]
  }, [catalog.local, catalog.remote])

  const selectedCharacter = useMemo(() => {
    if (characters.length === 0) {
      return null
    }

    return characters.find((character) => character.id === selectedCharacterId) ?? characters[0]
  }, [characters, selectedCharacterId])

  const activePromptText =
    selectedCharacter && selectedCharacter.origin !== 'remote-only'
      ? (draftPrompts[selectedCharacter.id] ?? loadedPrompts[selectedCharacter.id] ?? '')
      : ''

  const remotePromptPreview =
    selectedCharacter && selectedCharacter.origin === 'remote-only'
      ? (remotePromptPreviewById[selectedCharacter.id] ?? '')
      : ''

  const loadCatalog = async (refreshRemote = false): Promise<void> => {
    setCatalogError('')
    setIsRefreshing(true)

    try {
      const nextCatalog = refreshRemote
        ? await window.characters.refreshRemoteCharacters()
        : await window.characters.getCharacterCatalog()

      setCatalog(nextCatalog)
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        setDetailError('')
        await refreshCharacters()
        await loadCatalog(true)
      })()
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [refreshCharacters])

  useEffect(() => {
    if (!selectedCharacter || selectedCharacter.origin === 'remote-only') {
      return
    }

    if (loadedPrompts[selectedCharacter.id] !== undefined) {
      return
    }

    let isMounted = true

    window.ai
      .getCharacterPrompt(selectedCharacter.id)
      .then((document) => {
        if (!isMounted) {
          return
        }

        setLoadedPrompts((current) => ({
          ...current,
          [selectedCharacter.id]: document.prompt
        }))
      })
      .catch((error) => {
        if (!isMounted) {
          return
        }

        setDetailError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      isMounted = false
    }
  }, [loadedPrompts, selectedCharacter])

  useEffect(() => {
    if (!selectedCharacter || selectedCharacter.origin !== 'remote-only') {
      return
    }

    if (remotePromptPreviewById[selectedCharacter.id] !== undefined) {
      return
    }

    let isMounted = true
    const loadRemotePrompt = async (): Promise<void> => {
      setRemotePromptLoadingId(selectedCharacter.id)
      setDetailError('')

      try {
        const prompt = await window.characters.getRemoteCharacterPrompt(selectedCharacter.id)
        if (!isMounted) {
          return
        }

        setRemotePromptPreviewById((current) => ({
          ...current,
          [selectedCharacter.id]: prompt
        }))
      } catch (error) {
        if (!isMounted) {
          return
        }

        setDetailError(error instanceof Error ? error.message : String(error))
      } finally {
        if (isMounted) {
          setRemotePromptLoadingId('')
        }
      }
    }

    void loadRemotePrompt()

    return () => {
      isMounted = false
    }
  }, [remotePromptPreviewById, selectedCharacter])

  const {
    loading: isSavingPrompt,
    status: saveStatus,
    run: handleSavePrompt,
    setStatus: setSaveStatus
  } = useAsyncAction(
    async () => {
      if (!selectedCharacter || selectedCharacter.origin === 'remote-only') {
        throw new Error('No local character selected')
      }

      trackUiEvent('character-prompt-save', 'User saved a character prompt', {
        characterId: selectedCharacter.id,
        promptLength: activePromptText.length
      })

      const savedDocument = await window.ai.saveCharacterPrompt(
        selectedCharacter.id,
        activePromptText
      )

      setLoadedPrompts((current) => ({
        ...current,
        [savedDocument.characterId]: savedDocument.prompt
      }))
      setDraftPrompts((current) => {
        const next = { ...current }
        delete next[savedDocument.characterId]
        return next
      })
    },
    {
      onSuccess: () => {
        window.setTimeout(() => setSaveStatus('idle'), 2000)
      }
    }
  )

  const handleDownloadOrReset = async (character: CharacterListItem): Promise<void> => {
    if (!character.remoteEntry) {
      return
    }

    setCatalogError('')
    setDetailError('')
    setActiveActionId(character.id)

    try {
      if (character.origin === 'preset-downloaded') {
        trackUiEvent('character-reset-preset', 'User reset a preset character', {
          characterId: character.id
        })
        await window.characters.resetPresetCharacter(character.id)
      } else {
        trackUiEvent('character-download', 'User downloaded a preset character', {
          characterId: character.id
        })
        await window.characters.downloadCharacter(character.id)
      }

      setLoadedPrompts((current) => {
        const next = { ...current }
        delete next[character.id]
        return next
      })
      setDraftPrompts((current) => {
        const next = { ...current }
        delete next[character.id]
        return next
      })

      setDetailError('')
      await refreshCharacters()
      await loadCatalog(false)
      setSelectedCharacterId(character.id)
      setSaveStatus('idle')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCatalogError(message)
      setDetailError(message)
    } finally {
      setActiveActionId('')
    }
  }

  return (
    <div className="flex h-full w-full gap-4 px-6 py-4">
      <div className="flex w-[22rem] shrink-0 flex-col rounded border border-white/10 bg-black/20 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-white/85">角色列表</div>
            <div className="mt-1 text-xs text-white/45">
              {formatRefreshTime(catalog.refreshedAt)}
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              void (async () => {
                setDetailError('')
                await refreshCharacters()
                await loadCatalog(true)
              })()
            }
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
          </button>
        </div>

        {catalogError && (
          <div className="mb-3 rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {catalogError}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {characters.map((character) => (
            <button
              key={character.id}
              type="button"
              onClick={() => {
                setSelectedCharacterId(character.id)
                setSaveStatus('idle')
                setDetailError('')
                trackUiEvent('character-selected', 'User selected a character in settings', {
                  characterId: character.id,
                  origin: character.origin
                })
              }}
              className={cn(
                'rounded border px-3 py-3 text-left transition-colors',
                selectedCharacter?.id === character.id
                  ? 'border-[#e8c690]/50 bg-white/10 text-[#e8c690]'
                  : 'border-white/10 text-white/70 hover:bg-white/5'
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {getOriginLabel(character.origin).map((label) => (
                  <span
                    key={label}
                    className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="mt-2 text-sm font-medium text-white/90">{character.name}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/45">
                {character.description || character.id}
              </div>
            </button>
          ))}

          {characters.length === 0 && !catalogError && (
            <div className="py-6 text-center text-sm text-white/50">
              当前还没有可用角色，先刷新远端列表或下载角色试试
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col rounded border border-white/10 bg-black/20 p-4">
        {selectedCharacter ? (
          <div className="flex h-full flex-col">
            <div className="mb-4 flex items-start gap-4">
              <div className="size-16 shrink-0 overflow-hidden rounded-full border border-white/20 bg-black/50">
                {selectedCharacter.avatar ? (
                  <img src={selectedCharacter.avatar} className="size-full object-cover" alt="" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-white/35">
                    No Image
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-lg font-medium text-white/90">{selectedCharacter.name}</div>
                <div className="mt-1 text-xs text-white/45">
                  来源: {getOriginDescription(selectedCharacter.origin)}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  状态: {getStatusText(selectedCharacter.origin)}
                </div>
              </div>
            </div>

            <div className="mb-3">
              <div className="text-xs tracking-[0.18em] text-white/45 uppercase">Description</div>
              <div className="mt-2 rounded border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 text-white/80">
                {selectedCharacter.description || '暂无描述'}
              </div>
            </div>

            {detailError && (
              <div className="mb-3 rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {detailError}
              </div>
            )}

            <div className="mb-2 text-xs tracking-[0.18em] text-white/45 uppercase">Prompt</div>

            {selectedCharacter.origin === 'remote-only' ? (
              <>
                <div className="flex-1 overflow-hidden rounded border border-white/10 bg-black/40">
                  <textarea
                    value={
                      remotePromptLoadingId === selectedCharacter.id && !remotePromptPreview
                        ? '正在加载远端 Prompt...'
                        : remotePromptPreview
                    }
                    readOnly
                    className="h-full w-full resize-none bg-transparent p-4 text-sm leading-relaxed text-white/85 outline-none"
                    placeholder="远端 Prompt 预览"
                  />
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => void handleDownloadOrReset(selectedCharacter)}
                    disabled={activeActionId === selectedCharacter.id}
                    className="flex items-center gap-2 rounded bg-[#e8c690]/90 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#e8c690] disabled:opacity-50"
                  >
                    <Download className="size-4" />
                    {activeActionId === selectedCharacter.id ? '下载中...' : '下载角色'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <textarea
                  value={activePromptText}
                  onChange={(event) => {
                    setDraftPrompts((current) => ({
                      ...current,
                      [selectedCharacter.id]: event.target.value
                    }))
                    setSaveStatus('idle')
                  }}
                  className="flex-1 resize-none rounded border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-white/90 transition-colors outline-none focus:border-[#e8c690]"
                  placeholder="在这里编辑本地角色 Prompt..."
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs">
                    {saveStatus === 'success' && <span className="text-green-400">保存成功</span>}
                    {saveStatus === 'error' && <span className="text-red-400">保存失败</span>}
                  </div>

                  <div className="flex items-center gap-3">
                    {selectedCharacter.origin === 'preset-downloaded' && (
                      <button
                        type="button"
                        onClick={() => void handleDownloadOrReset(selectedCharacter)}
                        disabled={activeActionId === selectedCharacter.id}
                        className="flex items-center gap-2 rounded border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
                      >
                        <RotateCcw className="size-4" />
                        {activeActionId === selectedCharacter.id ? '恢复中...' : '恢复初始设置'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleSavePrompt()}
                      disabled={isSavingPrompt}
                      className="flex items-center gap-2 rounded bg-[#e8c690]/90 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#e8c690] disabled:opacity-50"
                    >
                      <Save className="size-4" />
                      {isSavingPrompt ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-white/50">
            选择一个角色后，可以在这里查看详情、预览或编辑 Prompt
          </div>
        )}
      </div>
    </div>
  )
}
