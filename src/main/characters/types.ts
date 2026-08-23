import type { CharacterInfo, CharacterSource, LocalCharacterEntry } from '@shared/chat'

export const CHARACTER_REMOTE_FILE_NAMES = [
  'info.json',
  'prompt.md',
  'avatar.png',
  'cardBg.png'
] as const

export type CharacterRemoteFileName = (typeof CHARACTER_REMOTE_FILE_NAMES)[number]

export type LocalCharacterManifest = {
  source: CharacterSource
  remoteEtags?: Partial<Record<CharacterRemoteFileName, string>>
  pendingRemotePrompt?: string
  remoteUnavailable?: boolean
  syncError?: string
}

export type LocalCharacterRecord = LocalCharacterEntry & {
  prompt: string
  promptFileName: string
}

export type RemoteCharacterRecord = {
  id: string
  info: CharacterInfo
  syncError?: string
}

export type RemoteCharacterCacheDocument = {
  updatedAt: string | null
  characters: RemoteCharacterRecord[]
}
