import { appendFile, mkdir, readdir, readFile } from 'fs/promises'
import type {
  ChatDebugRunEvent,
  ChatDebugRunRecord,
  ChatDebugRunStatus,
  ChatDebugRunSummary
} from '@shared/chat'
import { logger } from '@main/logging'
import { getChatDebugRunPath, getChatDebugRunsRoot } from '@main/utils'

type DebugRunMeta = ChatDebugRunSummary & { kind: 'meta' }
type DebugRunLine = DebugRunMeta | ({ kind: 'event' } & ChatDebugRunEvent)

type ActiveDebugRun = {
  characterId: string
  sessionId: string
  nextSequence: number
  queue: Promise<void>
}

/**
 * @description 将 Agent 运行事件按会话归档并增量写入 JSONL 文件。
 * @remarks 记录文件只追加不覆盖，保证进程异常时仍能保留已发生的事件。
 */
export class DebugRunStore {
  private readonly activeRuns = new Map<string, ActiveDebugRun>()

  /**
   * @description 为一次聊天运行创建调试记录文件。
   * @param input 运行关联的会话、消息和配置标识。
   * @returns 初始化完成后的运行摘要。
   */
  async start(input: Omit<ChatDebugRunSummary, 'status' | 'updatedAt' | 'eventCount'>): Promise<ChatDebugRunSummary> {
    const summary: ChatDebugRunSummary = {
      ...input,
      status: 'running',
      updatedAt: input.startedAt,
      eventCount: 0
    }
    const path = getChatDebugRunPath(input.characterId, input.sessionId, input.requestId)
    await mkdir(getChatDebugRunsRoot(input.characterId, input.sessionId), { recursive: true })
    await appendFile(path, `${JSON.stringify({ kind: 'meta', ...summary } satisfies DebugRunMeta)}\n`, 'utf-8')
    this.activeRuns.set(input.requestId, {
      characterId: input.characterId,
      sessionId: input.sessionId,
      nextSequence: 0,
      queue: Promise.resolve()
    })
    return summary
  }

  /**
   * @description 追加一条原始运行事件。
   * @param requestId 运行请求标识。
   * @param type 事件类型。
   * @param data 事件原始数据。
   */
  append(requestId: string, type: string, data: unknown): void {
    const active = this.activeRuns.get(requestId)
    if (!active) return
    const event: ChatDebugRunEvent = {
      sequence: active.nextSequence++,
      timestamp: new Date().toISOString(),
      type,
      data: toJsonSafe(data)
    }
    const line = `${JSON.stringify({ kind: 'event', ...event } satisfies DebugRunLine)}\n`
    active.queue = active.queue.then(() => appendFile(
      getChatDebugRunPath(active.characterId, active.sessionId, requestId),
      line,
      'utf-8'
    )).catch((error) => {
      void logger.error('ai', 'debug-run-write-failed', 'Failed to append Agent debug event', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      })
    })
  }

  /**
   * @description 写入运行终态并等待该运行所有事件落盘。
   * @param requestId 运行请求标识。
   * @param status 运行终态。
   * @param data 终态事件附加数据。
   * @returns 所有待写事件完成后的 Promise。
   */
  async finish(requestId: string, status: Exclude<ChatDebugRunStatus, 'running'>, data?: unknown): Promise<void> {
    const active = this.activeRuns.get(requestId)
    if (!active) return
    this.append(requestId, `run-${status}`, data)
    await active.queue
    this.activeRuns.delete(requestId)
  }

  /**
   * @description 读取会话下所有已保存的调试运行摘要。
   * @param characterId 角色标识。
   * @param sessionId 会话标识。
   * @returns 按开始时间倒序排列的运行摘要。
   */
  async list(characterId: string, sessionId: string): Promise<ChatDebugRunSummary[]> {
    const root = getChatDebugRunsRoot(characterId, sessionId)
    let names: string[]
    try {
      names = await readdir(root)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const summaries: ChatDebugRunSummary[] = []
    for (const name of names.filter((item) => item.endsWith('.jsonl'))) {
      try {
        const requestId = name.slice(0, -'.jsonl'.length)
        const firstLine = (await readFile(getChatDebugRunPath(characterId, sessionId, requestId), 'utf-8')).split(/\r?\n/u)[0]
        const parsed = JSON.parse(firstLine) as DebugRunMeta
        if (parsed.kind === 'meta') {
          const record = await this.read(characterId, sessionId, requestId)
          if (record) {
            summaries.push({
              requestId: record.requestId,
              sessionId: record.sessionId,
              messageId: record.messageId,
              characterId: record.characterId,
              profileId: record.profileId,
              status: record.status,
              startedAt: record.startedAt,
              updatedAt: record.updatedAt,
              eventCount: record.eventCount
            })
          }
        }
      } catch (error) {
        void logger.warn('ai', 'debug-run-read-failed', 'Failed to read Agent debug run summary', {
          sessionId,
          fileName: name,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return summaries.sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  }

  /**
   * @description 读取一次调试运行的完整事件记录。
   * @param characterId 角色标识。
   * @param sessionId 会话标识。
   * @param requestId 运行请求标识。
   * @returns 调试运行完整记录。
   */
  async read(characterId: string, sessionId: string, requestId: string): Promise<ChatDebugRunRecord | null> {
    const path = getChatDebugRunPath(characterId, sessionId, requestId)
    let content: string
    try {
      content = await readFile(path, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    const lines = content.split(/\r?\n/u).filter(Boolean)
    const meta = JSON.parse(lines[0]) as DebugRunMeta
    const events = lines.slice(1).map((line) => {
      const parsed = JSON.parse(line) as DebugRunLine
      if (parsed.kind !== 'event') throw new Error('Invalid debug run event')
      return {
        sequence: parsed.sequence,
        timestamp: parsed.timestamp,
        type: parsed.type,
        data: parsed.data
      }
    })
    const summary: ChatDebugRunSummary = {
      requestId: meta.requestId,
      sessionId: meta.sessionId,
      messageId: meta.messageId,
      characterId: meta.characterId,
      profileId: meta.profileId,
      status: meta.status,
      startedAt: meta.startedAt,
      updatedAt: meta.updatedAt,
      eventCount: meta.eventCount
    }
    const terminal = [...events].reverse().find((event) => event.type.startsWith('run-'))
    const terminalStatus: ChatDebugRunStatus | undefined =
      terminal?.type === 'run-completed'
        ? 'completed'
        : terminal?.type === 'run-error'
          ? 'error'
          : terminal?.type === 'run-aborted'
            ? 'aborted'
            : undefined
    return {
      ...summary,
      ...(terminalStatus ? { status: terminalStatus } : {}),
      eventCount: events.length,
      updatedAt: events.at(-1)?.timestamp || summary.updatedAt,
      events
    }
  }
}

/**
 * @description 将事件数据转换为可持久化的 JSON 值。
 * @param value 待转换值。
 * @returns 可安全 JSON 序列化的值。
 */
function toJsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return { serializationError: error instanceof Error ? error.message : String(error) }
  }
}
