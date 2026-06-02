/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

interface CharacterContextType {
  characters: Char[]
  activateChar: Char | null
  setActivateChar: (char: Char | null) => void
}

const CharacterContext = createContext<CharacterContextType | undefined>(undefined)

export function CharacterProvider({ children }: { children: ReactNode }): ReactElement {
  const [characters, setCharacters] = useState<Char[]>([])
  const [activateChar, setActivateChar] = useState<Char | null>(null)

  useEffect(() => {
    let isMounted = true

    window.ai
      ?.getCharacters?.()
      .then((loadedCharacters) => {
        if (!isMounted) return

        setCharacters(loadedCharacters)
        setActivateChar((current) => {
          if (!current) return current
          return loadedCharacters.find((char) => char.id === current.id) || current
        })
      })
      .catch((error) => {
        console.error('Failed to load character resources', error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <CharacterContext.Provider value={{ characters, activateChar, setActivateChar }}>
      {children}
    </CharacterContext.Provider>
  )
}

export function useCharacter(): CharacterContextType {
  const context = useContext(CharacterContext)
  if (!context) {
    throw new Error('useCharacter must be used within a CharacterProvider')
  }

  return context
}

export type { CharacterContextType }
