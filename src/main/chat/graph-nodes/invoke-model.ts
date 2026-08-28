import { splitStreamingAssistantMessageSegments } from '@main/chat/assistant-message-splitter'
import { getUserEmoticons } from '@main/chat/emoticons'
import type { GraphStateValue } from '@main/chat/graph-state'
import type { ChatGraphNodeContext } from '@main/chat/graph-node-context'

export function createInvokeModelNode(context: ChatGraphNodeContext) {
  return async (state: GraphStateValue) => {
    let assistantDraft = ''
    let streamedStructured = false
    let streamBuffer = ''
    const publishAssistantChunk = (text: string): void => {
      assistantDraft += text
      const assistantMessages = splitStreamingAssistantMessageSegments(
        assistantDraft,
        new Set(state.characterEmoticons.map((item) => item.id))
      )
      const emoticonDescriptions = new Map(
        state.characterEmoticons.map((item) => [item.id, item.description] as const)
      )
      const syncedSession = context.sessionStore.syncAssistantRunMessages(
        state.sessionId,
        state.assistantMessageId,
        assistantMessages,
        emoticonDescriptions,
        'streaming'
      )
      const message =
        [...syncedSession.messages].reverse().find((item) => item.role === 'assistant') ||
        syncedSession.messages[syncedSession.messages.length - 1]
      context.runRegistry.trackChunk(state.requestId, text)
      context.eventPublisher.publish({
        type: 'chunk', requestId: state.requestId, sessionId: state.sessionId,
        messageId: state.assistantMessageId, chunk: text
      })
      context.eventPublisher.publish({
        type: 'message-updated', requestId: state.requestId, sessionId: state.sessionId, message
      })
      context.eventPublisher.publish({ type: 'session-synced', requestId: state.requestId, session: syncedSession })
    }
    const result = await context.agent({
      profile: state.profile,
      history: state.llmMessages,
      systemPromptText:
        state.currentImages.length > 0
          ? state.systemPromptText +
            '\n\nFor a request containing new images, return strict JSON with an answer string and optional imageAnalyses array. Each imageAnalyses item must contain resourceId and one fused analysis.'
          : state.systemPromptText,
      context: {
        character: state.character,
        session: state.session,
        policy: await context.chatContext.getAgentPolicy(),
        accessedResourceIds: new Set(),
        abortSignal: state.abortSignal,
        imageResources: {
          read: (resourceId) => context.sessionStore.readAttachment(state.sessionId, resourceId),
          updateAnalysis: async (resourceId, analysis) => {
            const session = context.sessionStore.updateImageAnalysis(
              state.sessionId,
              resourceId,
              analysis
            )
            context.chatContext.syncSessions(context.sessionStore.getSessions())
            context.eventPublisher.publish({
              type: 'session-synced',
              requestId: state.requestId,
              session
            })
          }
        },
        emoticonCatalog: [
          ...(await getUserEmoticons()),
          ...state.characterEmoticons
        ],
        emoticonResources: {
          read: async (id) => {
            const user = (await getUserEmoticons()).find((item) => item.id === id)
            if (user) return user
            return state.characterEmoticons.find((item) => item.id === id) || null
          }
        }
      },
      abortSignal: state.abortSignal,
      onChunk: (text) => {
        context.debugRunStore.append(state.requestId, 'chunk', { text })
        if (!streamedStructured) {
          streamBuffer += text
          if (streamBuffer.trimStart().startsWith('{')) {
            streamedStructured = true
            return
          }
          publishAssistantChunk(text)
          return
        }
        streamBuffer += text
      },
      onProviderRequest: (body, phase) => {
        context.debugRunStore.append(state.requestId, 'llm-request', { phase, body })
      },
      onModelResponse: (response, phase) => {
        context.debugRunStore.append(state.requestId, 'llm-response', {
          phase,
          response: serializeModelResponse(response)
        })
      },
      onTrace: (trace) => {
        context.debugRunStore.append(state.requestId, 'tool-trace', trace)
      }
    })

    const structured = parseStructuredAssistantResponse(result.assistantDraft)
    if (structured) {
      assistantDraft = ''
      for (const item of structured.imageAnalyses) {
        try {
          const session = context.sessionStore.updateImageAnalysis(
            state.sessionId,
            item.resourceId,
            item.analysis
          )
          context.chatContext.syncSessions(context.sessionStore.getSessions())
          context.eventPublisher.publish({ type: 'session-synced', requestId: state.requestId, session })
        } catch (error) {
          context.eventPublisher.publish({
            type: 'run-error', requestId: state.requestId, sessionId: state.sessionId,
            messageId: state.assistantMessageId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
      if (structured.answer.trim()) publishAssistantChunk(structured.answer)
    } else if (!assistantDraft && result.assistantDraft) {
      if (streamedStructured) {
        publishAssistantChunk(result.assistantDraft)
      } else {
        assistantDraft = result.assistantDraft
      }
    }

    if (!assistantDraft.trim()) {
      throw new Error('Model returned no displayable text output.')
    }

    return { assistantDraft }
  }
}

/**
 * @description 将 LangChain 模型响应转换为可持久化的原始结构。
 * @param response 模型响应对象。
 * @returns 保留内容、工具调用和 provider 元数据的普通对象。
 */
function serializeModelResponse(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== 'object') return { value: response }
  return response as Record<string, unknown>
}

/**
 * @description 解析模型可选的结构化回复并提取用户可见答案。
 * @param content 模型返回的原始文本。
 * @returns 有效结构化回复的答案；格式不匹配时返回 null。
 */
function parseStructuredAssistantResponse(content: string): { answer: string; imageAnalyses: Array<{ resourceId: string; analysis: string }> } | null {
  const normalized = content.trim()
  if (!normalized.startsWith('{') || !normalized.endsWith('}')) return null
  try {
    const value: unknown = JSON.parse(normalized)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const answer = (value as { answer?: unknown }).answer
    if (typeof answer !== 'string') return null
    const imageAnalyses = Array.isArray((value as { imageAnalyses?: unknown }).imageAnalyses)
      ? ((value as { imageAnalyses: unknown[] }).imageAnalyses).filter((item): item is { resourceId: string; analysis: string } => {
          if (!item || typeof item !== 'object') return false
          const entry = item as { resourceId?: unknown; analysis?: unknown }
          return typeof entry.resourceId === 'string' && typeof entry.analysis === 'string' && entry.analysis.trim().length > 0
        }).map((item) => ({ resourceId: item.resourceId.trim(), analysis: item.analysis.trim() }))
      : []
    return { answer: answer.trim(), imageAnalyses }
  } catch {
    return null
  }
}
