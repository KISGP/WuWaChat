import type { CharacterInfo, CharacterSource, LocalCharacterEntry } from '../../shared/ai'

export type LocalCharacterManifest = {
  source: CharacterSource
}

export type LocalCharacterRecord = LocalCharacterEntry & {
  prompt: string
  promptFileName: string
}

export type RemoteCharacterRecord = {
  id: string
  info: CharacterInfo
}

export type RemoteCharacterCacheDocument = {
  updatedAt: string | null
  characters: RemoteCharacterRecord[]
}
