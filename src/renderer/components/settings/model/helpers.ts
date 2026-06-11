import type { ModelProfile } from '@shared/chat'

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
