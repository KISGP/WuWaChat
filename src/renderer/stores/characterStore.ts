import { create } from 'zustand'

type CharacterStore = {
  characters: Char[]
  activateChar: Char | null
  setActivateChar: (char: Char | null) => void
  refreshCharacters: () => Promise<void>
}

export const useCharacterStore = create<CharacterStore>((set) => ({
  characters: [],
  activateChar: null,
  setActivateChar: (char) => set({ activateChar: char }),
  refreshCharacters: async () => {
    const loadedCharacters = await window.ai?.getCharacters?.()
    if (!loadedCharacters) {
      return
    }

    set((current) => ({
      characters: loadedCharacters,
      activateChar: current.activateChar
        ? loadedCharacters.find((char) => char.id === current.activateChar?.id) ||
          current.activateChar
        : current.activateChar
    }))
  }
}))

