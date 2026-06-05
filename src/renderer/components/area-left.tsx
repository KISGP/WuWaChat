import { type ReactElement } from 'react'
import bgLeft from '../assets/T_PhoneSystemBg01A.png'
import CharCard from './char-card'
import { useCharacterStore } from '../stores/characterStore'

export default function AreaLeft(): ReactElement {
  const characters = useCharacterStore((state) => state.characters)

  return (
    <div className="relative h-156 w-78 shrink-0">
      <img
        src={bgLeft}
        className="absolute top-0 -right-0.75 size-full object-contain drop-shadow-[0_0_0_#ffffff]"
        draggable="false"
      />

      <div className="absolute flex h-full w-full flex-col gap-1 overflow-y-auto py-4 pr-2 pl-4">
        {characters.map((char, index) => (
          <CharCard key={char.id || index} char={char} />
        ))}
      </div>
    </div>
  )
}
