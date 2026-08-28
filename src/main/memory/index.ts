import type { AgentResourcePage } from '@shared/agent'
import type { ConversationSession, MemoryEntry } from '@shared/chat'
import { formatChatEmoticonMarker } from '@shared/chat-emoticons'
import {
  createDefaultMemorySettingsStore,
  normalizeMemorySettingsStore,
  type MemorySettingsStore
} from '@shared/memory-settings'
import { getUnifiedSettingsStore } from '@main/settings/store'

/**
 * @description 管理由会话快照派生的角色长期记忆。
 */
export class MemoryService {
  private settings = createDefaultMemorySettingsStore()
  private sessions: ConversationSession[] = []
  private settingsPromise: Promise<void> | null = null

  /**
   * @description 加载长期记忆设置。
   */
  async initializeSettings(): Promise<void> {
    await this.ensureSettingsLoaded()
  }

  /**
   * @description 兼容应用启动流程，确保设置已加载。
   */
  async initialize(): Promise<void> {
    await this.ensureSettingsLoaded()
  }

  /**
   * @description 替换当前可用于生成长期记忆的会话快照。
   * @param sessions 所有已加载的会话。
   */
  setSessions(sessions: ConversationSession[]): void {
    this.sessions = sessions
  }

  /**
   * @description 同步最新会话快照。
   * @param sessions 所有已加载的会话。
   */
  syncSessions(sessions: ConversationSession[]): void {
    this.setSessions(sessions)
  }

  /**
   * @description 返回当前生效的长期记忆设置。
   * @returns 设置快照。
   */
  getSettings(): MemorySettingsStore {
    return this.settings
  }

  /**
   * @description 规范化并持久化长期记忆设置。
   * @param store 待保存的设置。
   * @returns 已保存的规范化设置。
   */
  async saveSettings(store: MemorySettingsStore): Promise<MemorySettingsStore> {
    await this.ensureSettingsLoaded()
    this.settings = normalizeMemorySettingsStore(store)
    this.settings = await getUnifiedSettingsStore().update('memory', this.settings)
    return this.settings
  }

  /**
   * @description 查询当前 Agent 可访问的角色长期记忆条目。
   * @param input 声明式查询参数。
   * @param session 当前聊天会话，用于角色及会话范围限制。
   * @returns 带分页信息的记忆条目页。
   */
  queryAgentResource(
    input: Record<string, unknown>,
    session: ConversationSession
  ): AgentResourcePage {
    const conditions = Array.isArray(input.conditions) ? input.conditions : []
    const limit = Math.max(1, Math.min(Number(input.limit) || 8, 20))
    const cursor = Math.max(0, Number(input.cursor) || 0)
    const records = this.getMemoryEntriesForSession(session)
      .filter((entry) => matchesConditions(entry, conditions))
      .map((entry) => ({
        id: entry.id,
        source: 'memory.entries' as const,
        text: entry.text,
        title: entry.sourceType,
        location: entry.sessionId ? `会话：${entry.sessionId}` : '角色长期记忆',
        characterId: entry.characterId,
        sessionId: entry.sessionId,
        metadata: { sourceType: entry.sourceType, updatedAt: entry.updatedAt }
      }))

    return {
      records: records.slice(cursor, cursor + limit),
      nextCursor: cursor + limit < records.length ? String(cursor + limit) : null,
      truncated: cursor + limit < records.length
    }
  }

  /**
   * @description 返回聊天模型上下文中保留的近期消息数量。
   * @returns 近期消息数量。
   */
  getRecentMessageCount(): number {
    return this.settings.recentMessageCount
  }

  /**
   * @description 生成指定角色各会话的近期长期记忆条目。
   * @param characterId 角色标识。
   * @returns 从会话快照派生的记忆条目。
   */
  private buildCharacterMemoryEntries(characterId: string): MemoryEntry[] {
    return this.sessions
      .filter((session) => session.characterId === characterId)
      .flatMap((session) => {
        const recent = session.messages
          .filter((message) => Boolean(message.content.trim()) || Boolean(message.emoticonId))
          .slice(-this.settings.summaryTriggerTurns)
        if (recent.length === 0) {
          return []
        }
        return [
          {
            id: `memory:${characterId}:${session.id}`,
            text: recent
              .map(
                (message) => {
                  const content = message.emoticonId
                    ? [
                        formatChatEmoticonMarker(message.emoticonId),
                        message.emoticonDescription
                          ? `描述：${message.emoticonDescription}`
                          : ''
                      ]
                        .filter(Boolean)
                        .join(' ')
                    : message.content
                  return `${message.role === 'user' ? 'User' : 'Character'}: ${content}`
                }
              )
              .join('\n'),
            sourceType: 'summary' as const,
            characterId,
            sessionId: session.id,
            createdAt: session.updatedAt,
            updatedAt: session.updatedAt,
            visibility: 'private' as const
          }
        ]
      })
  }

  /**
   * @description 按当前设置限制 Agent 可读取的长期记忆会话范围。
   * @param session 当前聊天会话。
   * @returns 可读取的记忆条目。
   */
  private getMemoryEntriesForSession(session: ConversationSession): MemoryEntry[] {
    return this.buildCharacterMemoryEntries(session.characterId).filter(
      (entry) => this.settings.crossSessionCharacterMemory || entry.sessionId === session.id
    )
  }

  /**
   * @description 确保长期记忆设置已从统一设置存储加载。
   */
  private async ensureSettingsLoaded(): Promise<void> {
    if (!this.settingsPromise) {
      this.settingsPromise = getUnifiedSettingsStore()
        .get()
        .then((settings) => {
          this.settings = settings.memory
        })
    }
    await this.settingsPromise
  }
}

/**
 * @description 判断记忆条目是否满足所有声明式查询条件。
 * @param entry 待比较的记忆条目。
 * @param conditions 未受信任的条件数组。
 * @returns 所有条件满足时返回 `true`。
 */
function matchesConditions(entry: MemoryEntry, conditions: unknown[]): boolean {
  return conditions.every((condition) => {
    if (!condition || typeof condition !== 'object') {
      return false
    }
    const item = condition as { field?: unknown; operator?: unknown; value?: unknown }
    const field = typeof item.field === 'string' ? item.field : ''
    const actual = entry[field as keyof MemoryEntry]
    if (typeof actual !== 'string') {
      return false
    }
    if (item.operator === 'equals') {
      return actual === item.value
    }
    if (item.operator === 'contains') {
      return typeof item.value === 'string' && actual.includes(item.value)
    }
    return (
      item.operator === 'in' &&
      Array.isArray(item.value) &&
      item.value.some((value) => actual.includes(String(value)))
    )
  })
}
