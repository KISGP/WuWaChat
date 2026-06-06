import type { ModelProfile } from '@shared/chat'
import { cn } from '@renderer/utils'

export const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' }
] as const

export const PARAMETER_FIELDS: {
  key: keyof Pick<ModelProfile, 'temperature' | 'maxTokens'>
  label: string
  min: number
  max: number
  step: number
}[] = [
  { key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.1 },
  { key: 'maxTokens', label: 'Max Tokens', min: 1, max: 200000, step: 1 }
]

export type ModelOptionsCache = {
  fingerprint: string
  models: string[]
}

export function isValidUrl(value: string): boolean {
  if (!value.trim()) return false

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function connectionFingerprint(profile: ModelProfile): string {
  return [profile.provider, profile.baseUrl.trim(), profile.apiKey.trim()].join('\n')
}

export function inputClassName(hasError = false): string {
  return cn(
    'h-9 rounded border bg-black/35 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/30',
    hasError ? 'border-red-400/70 focus:border-red-300' : 'border-white/15 focus:border-[#e8c690]'
  )
}
