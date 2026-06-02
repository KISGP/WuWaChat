import { ReactElement, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useCharacter } from '../../context/CharacterContext'
import { cn } from '../../utils'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { trackUiEvent } from '../../logging'

export function PromptTab(): ReactElement {
  const { characters: chars } = useCharacter()
  const [selectedCharId, setSelectedCharId] = useState<string>('')
  const [draftPrompts, setDraftPrompts] = useState<Record<string, string>>({})
  const [loadedPrompts, setLoadedPrompts] = useState<Record<string, string>>({})
  const selectedChar = chars.find((char) => char.id === selectedCharId) || chars[0]
  const activePromptText = selectedChar
    ? (draftPrompts[selectedChar.id] ?? loadedPrompts[selectedChar.id] ?? '')
    : ''

  useEffect(() => {
    if (!selectedChar || loadedPrompts[selectedChar.id] !== undefined) {
      return
    }

    let isMounted = true

    window.ai
      ?.getCharacterPrompt?.(selectedChar.id)
      .then((document) => {
        if (!isMounted) return

        setLoadedPrompts((current) => ({
          ...current,
          [selectedChar.id]: document.prompt
        }))
      })
      .catch((error) => {
        console.error('Failed to load character prompt', error)
      })

    return () => {
      isMounted = false
    }
  }, [loadedPrompts, selectedChar])

  const {
    loading: isSaving,
    status: saveStatus,
    run: handleSave,
    setStatus: setSaveStatus
  } = useAsyncAction(
    async () => {
      if (!selectedChar) throw new Error('No character selected')

      trackUiEvent('character-prompt-save', 'User saved a character prompt', {
        characterId: selectedChar.id,
        promptLength: activePromptText.length
      })
      const savedDocument = await window.ai?.saveCharacterPrompt?.(selectedChar.id, activePromptText)
      if (!savedDocument) throw new Error('Character prompt save API is unavailable')

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
        setTimeout(() => setSaveStatus('idle'), 2000)
      }
    }
  )

  return (
    <div className="flex h-full w-full px-6">
      <div className="flex w-1/3 flex-col gap-1 border-r border-white/10 p-2">
        <div className="flex flex-1  flex-col gap-1 overflow-y-auto pr-1">
          {chars.map((char) => (
            <button
              key={char.id}
              onClick={() => {
                trackUiEvent('prompt-character-selected', 'User selected a character in the prompt editor', {
                  characterId: char.id
                })
                setSelectedCharId(char.id)
                setSaveStatus('idle')
              }}
              className={cn(
                'relative flex h-13 items-center justify-between overflow-hidden rounded border px-3 py-2 text-left transition-colors',
                selectedChar?.id === char.id
                  ? 'bg-white/10 text-[#e8c690]'
                  : 'text-white/70 hover:bg-white/5'
              )}
            >
              <span className="z-10 ml-24 capitalize">{char.name}</span>
              {selectedChar?.id === char.id && <Check className="z-10 size-4" />}
              {char.cardBg && (
                <img
                  src={char.cardBg}
                  className="absolute top-0 bottom-0 left-0 z-0 object-contain"
                  alt=""
                />
              )}
            </button>
          ))}
          {chars.length === 0 && (
            <div className="py-4 text-center text-sm text-white/50">暂无角色</div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        {selectedChar ? (
          <div className="group relative flex h-full flex-col">
            <div className="mb-3 flex items-center gap-4 px-1">
              <div className="size-14 shrink-0 overflow-hidden rounded-full border border-white/20 bg-black/50">
                <img src={selectedChar.avatar} className="size-full object-cover" alt="" />
              </div>

              <div className="flex flex-1 flex-col justify-center gap-1.5">
                <span className="text-sm font-medium text-white/80">{selectedChar.name}</span>
                <span className="font-mono text-xs text-white/40">角色提示词</span>
              </div>
            </div>

            <textarea
              value={activePromptText}
              onChange={(event) => {
                setDraftPrompts((current) => ({
                  ...current,
                  [selectedChar.id]: event.target.value
                }))
                setSaveStatus('idle')
              }}
              className="w-full flex-1 resize-none  rounded border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-white/90 transition-colors outline-none focus:border-[#e8c690]"
              placeholder="在这里编写角色的设定 Prompt..."
            />

            <div className="absolute right-4 bottom-4 flex items-center gap-3">
              {saveStatus === 'success' && <span className="text-xs text-green-400">保存成功</span>}
              {saveStatus === 'error' && <span className="text-xs text-red-400">保存失败</span>}

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded bg-[#e8c690]/90 px-4 py-1.5 text-sm font-medium text-black shadow-lg transition-colors hover:bg-[#e8c690] disabled:opacity-50"
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-white/50">
            请选择一个角色
          </div>
        )}
      </div>
    </div>
  )
}
