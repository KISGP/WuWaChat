// CharacterContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getSupportedChars } from "../api";

interface CharacterContextType {
  characters: Char[];
  activateChar: Char | null;
  setActivateChar: (char: Char | null) => void;
}

const CharacterContext = createContext<CharacterContextType | undefined>(
  undefined,
);

export function CharacterProvider({ children }: { children: ReactNode }) {
  const [characters, setCharacters] = useState<Char[]>([]);
  const [activateChar, setActivateChar] = useState<Char | null>(null);

  useEffect(() => {
    getSupportedChars()
      .then((data) => {
        const mapped: Char[] = data.map((c) => ({
          id: c.id,
          name: c.name,
          avatar: c.avatar,
          card_bg: c.card_bg,
        }));
        setCharacters(mapped);
      })
      .catch((err) => console.error("Failed to load characters:", err));
  }, []);

  return (
    <CharacterContext.Provider
      value={{ characters, activateChar, setActivateChar }}
    >
      {children}
    </CharacterContext.Provider>
  );
}

export function useCharacter() {
  const context = useContext(CharacterContext);
  if (!context) {
    throw new Error("useCharacter must be used within a CharacterProvider");
  }
  return context;
}

export type { CharacterContextType };
