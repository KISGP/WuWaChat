import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { CharacterSummary, ConversationMessage, ModelProfile } from '@shared/chat'
import type {
  LoreRetrievalTarget,
  LoreRouteDecision,
  LoreRouteDisposition,
  LoreRouteReason
} from '@shared/lore'
import { createChatModel } from '@main/chat/model-factory'
import { contentToText } from '@main/chat/message-content'
import { logger } from '@main/logging'

const ROUTER_TIMEOUT_MS = 8_000
const MINIMUM_CONFIDENT_SKIP_SCORE = 0.75

const ROUTE_REASONS = new Set<LoreRouteReason>([
  'past-event',
  'character-history',
  'lore-term',
  'conversation-follow-up',
  'daily-freeform',
  'ambiguous'
])
const RETRIEVAL_TARGETS = new Set<LoreRetrievalTarget>(['story', 'glossary'])

const ROUTING_INSTRUCTION = `You route an immersive character-chat turn. Decide whether the final answer needs original-story knowledge from the Lore archive.

The archive is the only source of original-story facts. Do not answer the user, infer facts, name tasks, or claim what exists in the archive. Judge only the need to search it.

Return exactly one JSON object with no Markdown:
{
  "disposition": "retrieve" | "skip" | "uncertain",
  "confidence": number from 0 to 1,
  "retrievalQuery": "a concise Chinese search query",
  "targets": ["story"] | ["glossary"] | ["story", "glossary"] | [],
  "reason": "past-event" | "character-history" | "lore-term" | "conversation-follow-up" | "daily-freeform" | "ambiguous"
}

Use "story" for original events, prior relationships, known locations, identities, chronology, and consequences. Use "glossary" only when the answer needs an original term's definition. Use both only when both the event context and the term definition are needed. Use [] only with skip. Use skip only for clearly freeform daily companionship that does not require original-story facts. Use uncertain for pronouns, follow-up questions, emotion questions tied to an unknown past, or insufficient context. When uncertain, write the best possible search query and select the minimally sufficient target. A low-confidence skip is unsafe and should be uncertain.`

type LoreRouterInput = {
  character: CharacterSummary
  userMessage: string
  history: ConversationMessage[]
  profile: ModelProfile
  abortSignal?: AbortSignal
}

type ParsedRouteDecision = Omit<LoreRouteDecision, 'routerProfileId' | 'fallbackReason'>

/**
 * @description 从模型文本中提取单个 JSON 对象，兼容少量代码围栏包装。
 * @param content 模型返回的文本内容。
 * @returns 可解析的 JSON 文本；无有效对象时返回 `null`。
 */
function extractJsonObject(content: string): string | null {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : null
}

/**
 * @description 校验路由模型输出，拒绝缺失字段或不在受限枚举中的决定。
 * @param value 已解析的 JSON 值。
 * @param fallbackQuery 原始用户消息，用于补足空检索查询。
 * @returns 可执行的路由决定；无效时返回 `null`。
 */
function parseRouteDecision(value: unknown, fallbackQuery: string): ParsedRouteDecision | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as Partial<ParsedRouteDecision>
  const disposition: LoreRouteDisposition | null =
    raw.disposition === 'retrieve' || raw.disposition === 'skip' || raw.disposition === 'uncertain'
      ? raw.disposition
      : null
  const confidence = Number(raw.confidence)
  if (!disposition || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return null
  }

  const reason =
    typeof raw.reason === 'string' && ROUTE_REASONS.has(raw.reason as LoreRouteReason)
      ? (raw.reason as LoreRouteReason)
      : null
  if (!reason) {
    return null
  }

  const retrievalQuery =
    typeof raw.retrievalQuery === 'string' && raw.retrievalQuery.trim()
      ? raw.retrievalQuery.trim()
      : fallbackQuery
  if (!retrievalQuery.trim()) {
    return null
  }

  const targets = Array.isArray(raw.targets)
    ? [
        ...new Set(
          raw.targets.filter(
            (target): target is LoreRetrievalTarget =>
              typeof target === 'string' && RETRIEVAL_TARGETS.has(target as LoreRetrievalTarget)
          )
        )
      ]
    : null
  const normalizedDisposition =
    disposition === 'skip' && confidence < MINIMUM_CONFIDENT_SKIP_SCORE ? 'uncertain' : disposition
  if (
    !targets ||
    (normalizedDisposition === 'skip' ? targets.length !== 0 : targets.length === 0)
  ) {
    return null
  }

  return {
    disposition: normalizedDisposition,
    confidence,
    retrievalQuery,
    targets: normalizedDisposition === 'skip' ? [] : targets,
    reason:
      disposition === 'skip' && confidence < MINIMUM_CONFIDENT_SKIP_SCORE ? 'ambiguous' : reason
  }
}

/**
 * @description 为不可用、超时或无效输出构造保守的 Lore 路由决定。
 * @param input 当前路由输入。
 * @param fallbackReason 可观测的降级原因。
 * @returns 强制进入原作检索的降级决定。
 */
function createFallbackDecision(input: LoreRouterInput, fallbackReason: string): LoreRouteDecision {
  const historyText = input.history
    .slice(-4)
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n')

  return {
    disposition: 'uncertain',
    confidence: 0,
    retrievalQuery: [input.userMessage.trim(), historyText].filter(Boolean).join('\n'),
    targets: ['story', 'glossary'],
    reason: 'router-fallback',
    routerProfileId: input.profile.id,
    fallbackReason
  }
}

/**
 * @description 调用指定模型，将用户消息与近期上下文分类为 Lore 检索决策。
 * @remarks 路由器不接触原作 Markdown；调用失败、输出无效或低置信度跳过时均保守地返回 `uncertain`。
 */
export class LoreRouter {
  /**
   * @description 使用小型模型生成受约束的 Lore 路由决定。
   * @param input 当前角色、消息、上下文和已解析的路由模型。
   * @returns 可供 Lore 检索服务执行的路由决定。
   */
  async route(input: LoreRouterInput): Promise<LoreRouteDecision> {
    const timeoutController = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      timeoutController.abort()
    }, ROUTER_TIMEOUT_MS)
    const abortFromCaller = (): void => timeoutController.abort()
    input.abortSignal?.addEventListener('abort', abortFromCaller, { once: true })

    try {
      const model = createChatModel({
        ...input.profile,
        temperature: 0,
        maxTokens: Math.min(input.profile.maxTokens, 320)
      })
      const result = await model.invoke(
        [
          new SystemMessage(ROUTING_INSTRUCTION),
          new HumanMessage(
            JSON.stringify({
              character: input.character.name,
              userMessage: input.userMessage,
              recentConversation: input.history.slice(-6).map((message) => ({
                role: message.role,
                content: message.content
              }))
            })
          )
        ],
        { signal: timeoutController.signal }
      )
      const json = extractJsonObject(contentToText(result.content))
      const parsed = json ? parseRouteDecision(JSON.parse(json), input.userMessage.trim()) : null
      if (!parsed) {
        throw new Error('Lore router returned an invalid decision.')
      }

      const decision = { ...parsed, routerProfileId: input.profile.id }
      void logger.info('ai', 'lore-router-decided', 'Lore router completed a decision', {
        characterId: input.character.id,
        routerProfileId: input.profile.id,
        disposition: decision.disposition,
        confidence: decision.confidence,
        targets: decision.targets,
        reason: decision.reason
      })
      return decision
    } catch (error) {
      if (input.abortSignal?.aborted) {
        throw error
      }

      const fallbackReason = timedOut
        ? `Lore router timed out after ${ROUTER_TIMEOUT_MS}ms.`
        : error instanceof Error
          ? error.message
          : String(error)
      void logger.warn(
        'ai',
        'lore-router-fallback',
        'Lore router fell back to uncertain retrieval',
        {
          characterId: input.character.id,
          routerProfileId: input.profile.id,
          timedOut,
          error: fallbackReason
        }
      )
      return createFallbackDecision(input, fallbackReason)
    } finally {
      clearTimeout(timeout)
      input.abortSignal?.removeEventListener('abort', abortFromCaller)
    }
  }
}
