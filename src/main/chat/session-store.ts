import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import type {
  ConversationMessage,
  ConversationSession,
  MessageStatus,
  SessionStatus
} from '@shared/chat'
import { logger } from '@main/logging'
import { getSessionsPath, pathExists, writeJsonFileAtomic } from '@main/utils'

function now(): string {
  return new Date().toISOString()
}

function cloneMessage(message: ConversationMessage): ConversationMessage {
  return { ...message }
}

function cloneSession(session: ConversationSession): ConversationSession {
  return {
    ...session,
    messages: session.messages.map(cloneMessage)
  }
}

function createMessage(
  role: ConversationMessage['role'],
  content: string,
  status: MessageStatus,
  createdAt = now()
): ConversationMessage {
  return {
    id: randomUUID(),
    role,
    content,
    status,
    createdAt
  }
}

function createSession(characterId: string, createdAt = now()): ConversationSession {
  return {
    id: randomUUID(),
    characterId,
    messages: [],
    status: 'idle',
    createdAt,
    updatedAt: createdAt
  }
}

const STREAMING_PERSIST_DELAY_MS = 300

export class SessionStore {
  private sessions = new Map<string, ConversationSession>()
  private persistQueue = Promise.resolve()
  private streamingPersistTimer: NodeJS.Timeout | null = null

  async initialize(): Promise<void> {
    const filePath = this.getStorePath()
    if (!(await pathExists(filePath))) {
      return
    }

    try {
      const raw = JSON.parse(await readFile(filePath, 'utf-8')) as ConversationSession[]
      this.sessions = new Map(raw.map((session) => [session.id, cloneSession(session)]))
    } catch (error) {
      void logger.error('main', 'sessions-load-failed', 'Failed to load conversation sessions', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      })
      this.sessions = new Map()
    }
  }

  getSessions(): ConversationSession[] {
    return [...this.sessions.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneSession)
  }

  getSession(sessionId: string): ConversationSession | null {
    const session = this.sessions.get(sessionId)
    return session ? cloneSession(session) : null
  }

  startRun(input: { sessionId?: string | null; characterId: string; userMessage: string }): {
    session: ConversationSession
    assistantMessage: ConversationMessage
  } {
    const timestamp = now()
    const session =
      (input.sessionId && this.sessions.get(input.sessionId)) ||
      createSession(input.characterId, timestamp)

    if (session.characterId !== input.characterId) {
      session.characterId = input.characterId
      session.messages = []
      session.createdAt = timestamp
    }

    const userMessage = createMessage('user', input.userMessage, 'complete', timestamp)
    const assistantMessage = createMessage('assistant', '', 'pending', timestamp)

    session.messages.push(userMessage, assistantMessage)
    session.status = 'running'
    session.updatedAt = timestamp
    this.sessions.set(session.id, session)
    this.schedulePersist()

    return {
      session: cloneSession(session),
      assistantMessage: cloneMessage(assistantMessage)
    }
  }

  updateAssistantMessage(
    sessionId: string,
    messageId: string,
    content: string,
    status: MessageStatus = 'streaming'
  ): ConversationSession {
    return this.updateMessage(
      sessionId,
      messageId,
      {
        content,
        status
      },
      undefined,
      undefined,
      'debounced'
    )
  }

  completeRun(sessionId: string, messageId: string, content: string): ConversationSession {
    return this.updateMessage(
      sessionId,
      messageId,
      {
        content,
        status: 'complete'
      },
      'idle',
      undefined,
      'immediate'
    )
  }

  abortRun(sessionId: string, messageId: string): ConversationSession {
    return this.updateMessage(sessionId, messageId, undefined, 'idle', 'aborted', 'immediate')
  }

  failRun(sessionId: string, messageId: string, errorMessage: string): ConversationSession {
    return this.updateMessage(
      sessionId,
      messageId,
      (message) => ({
        content: message.content || errorMessage,
        status: 'error'
      }),
      'error',
      undefined,
      'immediate'
    )
  }

  /**
   * @description 按消息角色删除一条会话消息，并在删除用户消息时一并删除该轮紧随其后的角色回复。
   * @param sessionId 会话 ID。
   * @param messageId 目标消息 ID。
   * @returns 删除后的会话快照。
   * @remarks 删除操作会立即持久化；若目标消息不存在则抛出异常，由上层统一处理。
   */
  deleteMessage(sessionId: string, messageId: string): ConversationSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const index = session.messages.findIndex((message) => message.id === messageId)
    if (index === -1) {
      throw new Error(`Message not found: ${messageId}`)
    }

    const targetMessage = session.messages[index]
    const removedMessages = [targetMessage]
    let deleteCount = 1

    if (targetMessage.role === 'user') {
      let scanIndex = index + 1
      while (
        scanIndex < session.messages.length &&
        session.messages[scanIndex].role === 'assistant'
      ) {
        removedMessages.push(session.messages[scanIndex])
        deleteCount += 1
        scanIndex += 1
      }
    }

    session.messages.splice(index, deleteCount)
    if (
      session.status === 'error' &&
      removedMessages.some((message) => message.status === 'error')
    ) {
      session.status = 'idle'
    }
    session.updatedAt = now()
    this.sessions.set(session.id, session)
    this.schedulePersist('immediate')

    return cloneSession(session)
  }

  /**
   * @description 将一次运行生成的 assistant 回复段同步为连续的会话消息。
   * @param sessionId 会话 ID。
   * @param firstMessageId 本次运行开始时创建的第一条 assistant 消息 ID。
   * @param contents 当前解析出的 assistant 消息段。
   * @param status 最后一条消息应使用的状态；前置消息会标记为 complete。
   * @param nextSessionStatus 可选的会话状态更新。
   * @param persistMode 保存模式；流式中间态使用 debounced。
   * @returns 更新后的会话快照。
   */
  syncAssistantRunMessages(
    sessionId: string,
    firstMessageId: string,
    contents: string[],
    status: MessageStatus,
    nextSessionStatus?: SessionStatus,
    persistMode: 'immediate' | 'debounced' = 'debounced'
  ): ConversationSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const firstIndex = session.messages.findIndex((message) => message.id === firstMessageId)
    if (firstIndex === -1) {
      throw new Error(`Message not found: ${firstMessageId}`)
    }

    const nextContents = contents.length > 0 ? contents : ['']
    const existingRunMessages: ConversationMessage[] = []
    let scanIndex = firstIndex
    while (
      scanIndex < session.messages.length &&
      session.messages[scanIndex].role === 'assistant'
    ) {
      existingRunMessages.push(session.messages[scanIndex])
      scanIndex += 1
    }

    const timestamp = now()
    const nextMessages = nextContents.map((content, index) => {
      const existing = existingRunMessages[index]
      return {
        ...(existing || createMessage('assistant', '', 'pending', timestamp)),
        content,
        status: index === nextContents.length - 1 ? status : 'complete'
      }
    })

    session.messages.splice(firstIndex, existingRunMessages.length, ...nextMessages)
    session.status = nextSessionStatus || session.status
    session.updatedAt = timestamp
    this.sessions.set(session.id, session)
    this.schedulePersist(persistMode)

    return cloneSession(session)
  }

  /**
   * @description 更新一次 assistant 运行中最后一条气泡的状态，并保留已生成内容。
   * @param sessionId 会话 ID。
   * @param firstMessageId 本次运行开始时创建的第一条 assistant 消息 ID。
   * @param status 最后一条 assistant 气泡的新状态。
   * @param nextSessionStatus 会话的新状态。
   * @param fallbackContent 最后一条气泡为空时使用的兜底内容。
   * @returns 更新后的会话快照。
   */
  updateAssistantRunStatus(
    sessionId: string,
    firstMessageId: string,
    status: MessageStatus,
    nextSessionStatus: SessionStatus,
    fallbackContent?: string
  ): ConversationSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const firstIndex = session.messages.findIndex((message) => message.id === firstMessageId)
    if (firstIndex === -1) {
      throw new Error(`Message not found: ${firstMessageId}`)
    }

    let lastRunMessageIndex = firstIndex
    let scanIndex = firstIndex
    while (
      scanIndex < session.messages.length &&
      session.messages[scanIndex].role === 'assistant'
    ) {
      lastRunMessageIndex = scanIndex
      scanIndex += 1
    }

    const currentMessage = session.messages[lastRunMessageIndex]
    session.messages[lastRunMessageIndex] = {
      ...currentMessage,
      content: currentMessage.content || fallbackContent || currentMessage.content,
      status
    }
    session.status = nextSessionStatus
    session.updatedAt = now()
    this.sessions.set(session.id, session)
    this.schedulePersist('immediate')

    return cloneSession(session)
  }

  getMessage(sessionId: string, messageId: string): ConversationMessage | null {
    const session = this.sessions.get(sessionId)
    const message = session?.messages.find((item) => item.id === messageId)
    return message ? cloneMessage(message) : null
  }

  private updateMessage(
    sessionId: string,
    messageId: string,
    patch?:
      | Partial<ConversationMessage>
      | ((message: ConversationMessage) => Partial<ConversationMessage>),
    nextSessionStatus?: SessionStatus,
    defaultMessageStatus?: MessageStatus,
    persistMode: 'immediate' | 'debounced' = 'immediate'
  ): ConversationSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const index = session.messages.findIndex((message) => message.id === messageId)
    if (index === -1) {
      throw new Error(`Message not found: ${messageId}`)
    }

    const currentMessage = session.messages[index]
    const nextPatch =
      typeof patch === 'function'
        ? patch(cloneMessage(currentMessage))
        : patch || {
            status: defaultMessageStatus || currentMessage.status
          }

    session.messages[index] = {
      ...currentMessage,
      ...nextPatch,
      status: nextPatch.status || defaultMessageStatus || currentMessage.status
    }
    session.status = nextSessionStatus || session.status
    session.updatedAt = now()
    this.sessions.set(session.id, session)
    this.schedulePersist(persistMode)

    return cloneSession(session)
  }

  private getStorePath(): string {
    return getSessionsPath()
  }

  private async persist(): Promise<void> {
    await writeJsonFileAtomic(this.getStorePath(), this.getSessions())
  }

  /**
   * @description 将会话保存请求加入串行队列，并统一记录保存失败。
   * @param mode 保存模式；流式中间态使用短延迟合并，终态立即排队保存。
   */
  private schedulePersist(mode: 'immediate' | 'debounced' = 'immediate'): void {
    if (mode === 'debounced') {
      if (this.streamingPersistTimer) {
        clearTimeout(this.streamingPersistTimer)
      }

      this.streamingPersistTimer = setTimeout(() => {
        this.streamingPersistTimer = null
        this.enqueuePersist()
      }, STREAMING_PERSIST_DELAY_MS)
      return
    }

    if (this.streamingPersistTimer) {
      clearTimeout(this.streamingPersistTimer)
      this.streamingPersistTimer = null
    }

    this.enqueuePersist()
  }

  /**
   * @description 将一次实际写盘任务串接到保存队列尾部。
   * @remarks 队列中的每次写入都会读取最新内存快照；失败会记录日志并允许后续保存继续执行。
   */
  private enqueuePersist(): void {
    this.persistQueue = this.persistQueue
      .then(() => this.persist())
      .catch((error) => {
        void logger.error('main', 'sessions-save-failed', 'Failed to save conversation sessions', {
          filePath: this.getStorePath(),
          error: error instanceof Error ? error.message : String(error)
        })
      })
  }
}
