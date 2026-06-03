/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

interface CharacterContextType {
  characters: Char[]
  activateChar: Char | null
  setActivateChar: (char: Char | null) => void
  refreshCharacters: () => Promise<void>
}

const CharacterContext = createContext<CharacterContextType | undefined>(undefined)

export function CharacterProvider({ children }: { children: ReactNode }): ReactElement {
  const [characters, setCharacters] = useState<Char[]>([])
  const [activateChar, setActivateChar] = useState<Char | null>(null)

  const refreshCharacters = useCallback(async (): Promise<void> => {
    const loadedCharacters = await window.ai?.getCharacters?.()
    if (!loadedCharacters) {
      return
    }

    setCharacters(loadedCharacters)
    setActivateChar((current) => {
      if (!current) return current
      return loadedCharacters.find((char) => char.id === current.id) || current
    })
  }, [])

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

  const contextValue = useMemo(
    () => ({ characters, activateChar, setActivateChar, refreshCharacters }),
    [characters, activateChar, refreshCharacters]
  )

  return <CharacterContext.Provider value={contextValue}>{children}</CharacterContext.Provider>
}

export function useCharacter(): CharacterContextType {
  const context = useContext(CharacterContext)
  if (!context) {
    throw new Error('useCharacter must be used within a CharacterProvider')
  }

  return context
}

export type { CharacterContextType }
