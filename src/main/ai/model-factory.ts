import { ChatDeepSeek } from '@langchain/deepseek'
import { ChatOpenAI } from '@langchain/openai'
import type { ModelProfile } from '@shared/ai'

function requireValue(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }

  return trimmed
}

export function createChatModel(profile: ModelProfile): ChatOpenAI | ChatDeepSeek {
  if (profile.provider === 'deepseek') {
    return new ChatDeepSeek({
      model: requireValue(profile.model, 'Model'),
      apiKey: profile.apiKey.trim() || undefined,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
      configuration: {
        baseURL: requireValue(profile.baseUrl, 'Base URL')
      }
    })
  }

  return new ChatOpenAI({
    model: requireValue(profile.model, 'Model'),
    apiKey: profile.apiKey.trim() || undefined,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens,
    configuration: {
      baseURL: requireValue(profile.baseUrl, 'Base URL')
    }
  })
}
