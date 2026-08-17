import { ChatDeepSeek } from '@langchain/deepseek'
import { ChatOpenAI } from '@langchain/openai'
import type { ModelProfile } from '@shared/chat'
import { requireValue } from '@main/utils/value'

/**
 * @description Creates the configured chat model and applies provider-supported generation options.
 * @param profile The persisted profile selected for the current model invocation.
 * @returns A LangChain model instance for OpenAI or DeepSeek.
 */
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
    },
    ...(profile.reasoningEffort === 'auto'
      ? {}
      : { reasoning: { effort: profile.reasoningEffort } })
  })
}
