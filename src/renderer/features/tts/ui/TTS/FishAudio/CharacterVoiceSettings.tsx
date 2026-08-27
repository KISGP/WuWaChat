import { useMemo, useState, type ReactElement } from 'react'
import { RotateCcw } from 'lucide-react'
import { Input } from '@renderer/common/components/input'
import { resolveFishCharacterReferenceId } from '@shared/tts/fish-audio'

export default function FishCharacterSettings({
  character,
  characterVoices,
  onChange,
  onReset
}: {
  character: Char
  characterVoices: Record<string, { fish?: { referenceId: string } }>
  onChange: (characterId: string, referenceId: string) => Promise<void>
  onReset: (characterId: string) => Promise<void>
}): ReactElement {
  const configuredReferenceId = characterVoices[character.id]?.fish?.referenceId || ''
  const defaultReferenceId = useMemo(
    () => resolveFishCharacterReferenceId(character.id, {}),
    [character.id]
  )
  const effectiveReferenceId = useMemo(
    () => resolveFishCharacterReferenceId(character.id, characterVoices),
    [character.id, characterVoices]
  )
  const [draft, setDraft] = useState(configuredReferenceId || effectiveReferenceId)
  const hasOverride = Boolean(configuredReferenceId)
  const canReset = hasOverride || draft !== defaultReferenceId
  return (
    <label>
      <span className="relative">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={() => void onChange(character.id, draft)}
          placeholder="输入 Fish Audio reference_id"
          aria-describedby="fish-character-voice-help"
          className="w-xs pr-10"
        />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setDraft(defaultReferenceId)
            void onReset(character.id)
          }}
          disabled={!canReset}
          aria-label="恢复默认音色"
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center text-white/45 hover:text-white/80"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </span>
    </label>
  )
}
