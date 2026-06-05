import type { CharacterInfo } from '../../shared/ai'

export function normalizeCharacterVersion(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const normalizedDate = new Date(value)
  if (Number.isNaN(normalizedDate.getTime())) {
    return null
  }

  return normalizedDate.toISOString()
}

export function pickDisplayText(
  value: CharacterInfo['name'] | CharacterInfo['description'],
  fallback = ''
): string {
  return value.cn?.trim() || value.en?.trim() || value.jp?.trim() || fallback
}
