import { ChatDeepSeek } from '@langchain/deepseek'
import { ChatOpenAI } from '@langchain/openai'
import type { ModelProfile } from '@shared/chat'
import { requireValue } from '@main/utils/value'

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
