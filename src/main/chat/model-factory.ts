import { ChatDeepSeek } from '@langchain/deepseek'
import { ChatOpenAI } from '@langchain/openai'
import type { ModelProfile } from '@shared/chat'
import type { AgentModelFactoryOptions } from '@main/agent'
import { requireValue } from '@main/utils/value'

/**
 * @description Creates the configured chat model and applies provider-supported generation options.
 * @param profile The persisted profile selected for the current model invocation.
 * @param options Optional provider request observer used by the diagnostic page.
 * @returns A LangChain model instance for OpenAI or DeepSeek.
 */
export function createChatModel(
  profile: ModelProfile,
  options?: AgentModelFactoryOptions
): ChatOpenAI | ChatDeepSeek {
  const baseURL = requireValue(profile.baseUrl, 'Base URL')
  const diagnosticFetch = options?.onProviderRequest
    ? createDiagnosticFetch(options.onProviderRequest)
    : undefined
  const configuration = {
    baseURL,
    ...(diagnosticFetch ? { fetch: diagnosticFetch } : {})
  }

  if (profile.provider === 'deepseek') {
    return new ChatDeepSeek({
      model: requireValue(profile.model, 'Model'),
      apiKey: profile.apiKey.trim() || undefined,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
      configuration
    })
  }

  return new ChatOpenAI({
    model: requireValue(profile.model, 'Model'),
    apiKey: profile.apiKey.trim() || undefined,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens,
    configuration,
    ...(profile.reasoningEffort === 'auto'
      ? {}
      : { reasoning: { effort: profile.reasoningEffort } })
  })
}

/**
 * @description 创建一个只观察 JSON 请求体的 fetch 包装器，并将请求原样转发。
 * @param onProviderRequest provider 请求体回调。
 * @returns 保持原始 fetch 行为的请求函数。
 * @remarks 只上报请求 body，不读取或记录认证 header、URL 或响应内容。
 */
function createDiagnosticFetch(
  onProviderRequest: (body: Record<string, unknown>) => void
): typeof fetch {
  return async (input, init): Promise<Response> => {
    const body = parseJsonRequestBody(init?.body)
    if (body) {
      onProviderRequest(body)
    }

    return fetch(input, init)
  }
}

/**
 * @description 从 fetch 请求中读取最终序列化的 JSON body。
 * @param body fetch 请求体。
 * @returns JSON 对象；请求不是 JSON 对象时返回 `null`。
 */
function parseJsonRequestBody(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'string') {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(body)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
