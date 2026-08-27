import { type ReactElement } from 'react'
import bgLeft from '@renderer/assets/T_PhoneSystemBg01A.png'
import CharacterCard from './CharacterCard'
import { useCharacterRegistryStore } from '@renderer/store/character-registry'

export default function CharacterRail(): ReactElement {
  const characters = useCharacterRegistryStore((state) => state.registry.local)

  return (
    <div className="relative h-156 w-78 shrink-0">
      <img
        src={bgLeft}
        className="absolute top-0 -right-0.75 size-full object-contain drop-shadow-[0_0_0_#ffffff]"
        draggable="false"
      />

      <div className="absolute flex h-full w-full flex-col gap-1 overflow-y-auto py-4 pr-2 pl-4">
        {characters.map((char, index) => (
          <CharacterCard key={char.id || index} char={char} />
        ))}
      </div>
    </div>
  )
}
