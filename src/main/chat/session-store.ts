import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import type {
  ChatImageAttachment,
  ChatImageInput,
  ChatUserSegment,
  ConversationMessage,
  ConversationSession,
  MessageStatus,
  SessionStatus
} from '@shared/chat'
import type { AssistantMessageSegment } from './assistant-message-splitter'
import { CHAT_USER_EMOTICONS } from '@shared/chat-emoticons'
import { logger } from '@main/logging'
import {
  getChatAttachmentPath,
  getChatAttachmentsRoot,
  getChatCharacterRoot,
  getChatHistoryRoot,
  getChatSessionPath,
  pathExists,
  readDirectoryNames,
  readImageDataUrl,
  writeJsonFileAtomic
} from '@main/utils'

function now(): string {
  return new Date().toISOString()
}

function cloneMessage(message: ConversationMessage): ConversationMessage {
  return {
    ...message,
    ...(message.attachments
      ? { attachments: message.attachments.map((attachment) => ({ ...attachment })) }
      : {})
  }
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
  createdAt = now(),
  attachments?: ChatImageAttachment[],
  emoticonId?: string,
  emoticonDescription?: string
): ConversationMessage {
  return {
    id: randomUUID(),
    role,
    content,
    ...(emoticonId ? { emoticonId } : {}),
    ...(emoticonDescription ? { emoticonDescription } : {}),
    status,
    createdAt,
    ...(attachments && attachments.length > 0
      ? { attachments: attachments.map((attachment) => ({ ...attachment })) }
      : {})
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
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_MIME_EXTENSIONS: Record<ChatImageAttachment['mimeType'], string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp'
}

/** @description 判断值是否可作为单一路径片段使用。 @param value 待检查的路径片段。 @returns 路径片段安全时返回 true。 */
function isSafePathSegment(value: string): boolean {
  return Boolean(value) && value !== '.' && value !== '..' && !/[\\/]/.test(value)
}

/** @description 校验路径片段，阻止路径穿越和分隔符注入。 @param value 待校验值。 @param label 错误信息中的字段名。 */
function assertSafePathSegment(value: string, label: string): void {
  if (!isSafePathSegment(value)) {
    throw new Error(`Invalid ${label}`)
  }
}

export class SessionStore {
  private sessions = new Map<string, ConversationSession>()
  private persistQueue = Promise.resolve()
  private streamingPersistTimer: NodeJS.Timeout | null = null
  private readonly pendingPersistSessionIds = new Set<string>()

  async initialize(): Promise<void> {
    const root = getChatHistoryRoot()
    this.sessions = new Map()
    for (const characterId of await readDirectoryNames(root)) {
      if (!isSafePathSegment(characterId)) {
        continue
      }
      const characterRoot = getChatCharacterRoot(characterId)
      for (const sessionId of await readDirectoryNames(characterRoot)) {
        if (!isSafePathSegment(sessionId)) {
          continue
        }
        const filePath = getChatSessionPath(characterId, sessionId)
        if (!(await pathExists(filePath))) {
          continue
        }
        try {
          const raw = JSON.parse(await readFile(filePath, 'utf-8')) as ConversationSession
          if (raw.id !== sessionId || raw.characterId !== characterId || !Array.isArray(raw.messages)) {
            throw new Error('Invalid session document')
          }
          this.sessions.set(raw.id, cloneSession(raw))
        } catch (error) {
          void logger.error('main', 'session-load-failed', 'Failed to load conversation session', {
            filePath,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
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

  /**
   * @description 追加一条用户消息，可选择仅保存在 main 内存中。
   * @param input 用户消息及会话信息。
   * @param persist 是否立即持久化；等待窗口内传入 false。
   * @returns 更新后的会话与用户消息。
   */
  appendUserMessage(input: {
    sessionId?: string | null
    characterId: string
    segment: ChatUserSegment
  }, persist = true): {
    session: ConversationSession
    userMessage: ConversationMessage
  } {
    assertSafePathSegment(input.characterId, 'character id')
    const timestamp = now()
    const session =
      (input.sessionId && this.sessions.get(input.sessionId)) ||
      createSession(input.characterId, timestamp)

    if (session.characterId !== input.characterId) {
      session.characterId = input.characterId
      session.messages = []
      session.status = 'idle'
      session.createdAt = timestamp
    }

    const segment = input.segment
    const userMessage =
      segment.type === 'emoticon'
        ? createMessage(
            'user',
            '',
            'complete',
            timestamp,
            undefined,
            segment.emoticonId,
            CHAT_USER_EMOTICONS.find((item) => item.id === segment.emoticonId)?.description
          )
        : createMessage(
            'user',
            segment.text,
            'complete',
            timestamp,
            segment.images?.map(({ dataUrl, ...attachment }) => {
              void dataUrl
              return attachment
            })
          )
    session.messages.push(userMessage)
    session.updatedAt = timestamp
    this.sessions.set(session.id, session)
    if (persist) {
      this.schedulePersist('immediate', session.id)
    }

    return { session: cloneSession(session), userMessage: cloneMessage(userMessage) }
  }

  /**
   * @description 为会话创建 assistant 占位并切换到运行状态。
   * @param sessionId 目标会话 ID。
   * @param persist 是否立即持久化。
   * @returns 更新后的会话与 assistant 占位消息。
   */
  beginRun(sessionId: string, persist = true): {
    session: ConversationSession
    assistantMessage: ConversationMessage
  } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    const timestamp = now()
    const assistantMessage = createMessage('assistant', '', 'pending', timestamp)
    session.messages.push(assistantMessage)
    session.status = 'running'
    session.updatedAt = timestamp
    this.sessions.set(session.id, session)
    if (persist) {
      this.schedulePersist('immediate', session.id)
    }
    return { session: cloneSession(session), assistantMessage: cloneMessage(assistantMessage) }
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
  deleteMessage(sessionId: string, messageId: string, persist = true): ConversationSession {
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
    if (persist) {
      this.schedulePersist('immediate', session.id)
    }

    return cloneSession(session)
  }

  /**
   * @description 将一次运行生成的 assistant 回复段同步为连续的会话消息。
   * @param sessionId 会话 ID。
   * @param firstMessageId 本次运行开始时创建的第一条 assistant 消息 ID。
   * @param contents 当前解析出的 assistant 消息段。
   * @param emoticonDescriptions 当前角色表情 ID 到描述的映射。
   * @param status 最后一条消息应使用的状态；前置消息会标记为 complete。
   * @param nextSessionStatus 可选的会话状态更新。
   * @param persistMode 保存模式；流式中间态使用 debounced。
   * @returns 更新后的会话快照。
   */
  syncAssistantRunMessages(
    sessionId: string,
    firstMessageId: string,
    contents: AssistantMessageSegment[],
    emoticonDescriptions: ReadonlyMap<string, string>,
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

    const nextContents = contents.length > 0 ? contents : [{ type: 'text' as const, text: '' }]
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
    const nextMessages = nextContents.map((segment, index) => {
      const existing = existingRunMessages[index]
      return {
        ...(existing || createMessage('assistant', '', 'pending', timestamp)),
        content: segment.type === 'text' ? segment.text : '',
        ...(segment.type === 'emoticon'
          ? {
              emoticonId: segment.emoticonId,
              emoticonDescription: emoticonDescriptions.get(segment.emoticonId)
            }
          : { emoticonId: undefined, emoticonDescription: undefined }),
        status: index === nextContents.length - 1 ? status : 'complete'
      }
    })

    session.messages.splice(firstIndex, existingRunMessages.length, ...nextMessages)
    session.status = nextSessionStatus || session.status
    session.updatedAt = timestamp
    this.sessions.set(session.id, session)
    this.schedulePersist(persistMode, session.id)

    return cloneSession(session)
  }

  /**
   * @description 完成没有可展示内容的 assistant 运行并移除其占位消息。
   * @param sessionId 会话 ID。
   * @param messageId assistant 占位消息 ID。
   * @returns 更新后的会话快照。
   */
  completeEmptyAssistantRun(sessionId: string, messageId: string): ConversationSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const index = session.messages.findIndex((message) => message.id === messageId)
    if (index === -1) throw new Error(`Message not found: ${messageId}`)
    session.messages.splice(index, 1)
    session.status = 'idle'
    session.updatedAt = now()
    this.sessions.set(session.id, session)
    this.schedulePersist('immediate', session.id)
    return cloneSession(session)
  }

  /**
   * @description 将图片输入的二进制内容保存到指定会话附件目录。
   * @param sessionId 目标会话 ID。
   * @param input 包含资源 ID、MIME、文件名和 Data URL 的图片输入。
   * @returns 写入后的图片附件元数据。
   * @remarks 仅允许 PNG、JPEG 和 WebP；资源 ID 会校验为单一路径片段。
   */
  async saveAttachment(sessionId: string, input: ChatImageInput): Promise<ChatImageAttachment> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    assertSafePathSegment(session.characterId, 'character id')
    assertSafePathSegment(session.id, 'session id')
    assertSafePathSegment(input.resourceId, 'resource id')
    const extension = IMAGE_MIME_EXTENSIONS[input.mimeType]
    if (!extension) {
      throw new Error(`Unsupported image MIME type: ${input.mimeType}`)
    }

    const match = input.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
    if (!match || match[1] !== input.mimeType) {
      throw new Error('Invalid image data URL')
    }
    const data = Buffer.from(match[2], 'base64')
    if (data.byteLength === 0) {
      throw new Error('Image data is empty')
    }
    if (data.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Image exceeds the 10 MB size limit')
    }

    const attachmentPath = getChatAttachmentPath(
      session.characterId,
      session.id,
      input.resourceId,
      extension
    )
    await mkdir(getChatAttachmentsRoot(session.characterId, session.id), { recursive: true })
    await writeFile(attachmentPath, data)
    return {
      resourceId: input.resourceId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: data.byteLength,
      analysis: input.analysis || ''
    }
  }

  /**
   * @description 按资源 ID 读取会话附件并转换为模型或界面可用的 Data URL。
   * @param sessionId 目标会话 ID。
   * @param resourceId 会话内附件资源 ID。
   * @returns 附件元数据及 Data URL；资源不存在时返回 null。
   */
  async readAttachment(
    sessionId: string,
    resourceId: string
  ): Promise<{ attachment: ChatImageAttachment; dataUrl: string } | null> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    assertSafePathSegment(resourceId, 'resource id')
    const attachment = session.messages
      .flatMap((message) => message.attachments || [])
      .find((item) => item.resourceId === resourceId)
    if (!attachment) {
      return null
    }
    const extension = IMAGE_MIME_EXTENSIONS[attachment.mimeType]
    const attachmentPath = getChatAttachmentPath(
      session.characterId,
      session.id,
      resourceId,
      extension
    )
    if (!(await pathExists(attachmentPath))) {
      return null
    }
    return { attachment: { ...attachment }, dataUrl: await readImageDataUrl(attachmentPath) }
  }

  /**
   * @description 更新会话中指定图片资源的综合分析摘要，并替换旧摘要。
   * @param sessionId 目标会话 ID。
   * @param resourceId 会话内附件资源 ID。
   * @param analysis 新的综合分析文本。
   * @returns 更新后的会话快照。
   */
  updateImageAnalysis(sessionId: string, resourceId: string, analysis: string): ConversationSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    assertSafePathSegment(resourceId, 'resource id')
    let updated = false
    session.messages = session.messages.map((message) => {
      if (!message.attachments?.some((attachment) => attachment.resourceId === resourceId)) {
        return message
      }
      updated = true
      return {
        ...message,
        attachments: message.attachments.map((attachment) =>
          attachment.resourceId === resourceId ? { ...attachment, analysis } : attachment
        )
      }
    })
    if (!updated) {
      throw new Error(`Attachment not found: ${resourceId}`)
    }
    session.updatedAt = now()
    this.sessions.set(session.id, session)
    this.schedulePersist('immediate', session.id)
    return cloneSession(session)
  }

  /**
   * @description 设置一条消息的图片附件元数据，并立即持久化会话。
   * @param sessionId 目标会话 ID。
   * @param messageId 目标消息 ID。
   * @param attachments 要写入的附件元数据。
   * @returns 更新后的会话快照。
   */
  setMessageAttachments(
    sessionId: string,
    messageId: string,
    attachments: ChatImageAttachment[],
    persist = true
  ): ConversationSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    const index = session.messages.findIndex((message) => message.id === messageId)
    if (index === -1) {
      throw new Error(`Message not found: ${messageId}`)
    }
    session.messages[index] = {
      ...session.messages[index],
      ...(attachments.length > 0
        ? { attachments: attachments.map((attachment) => ({ ...attachment })) }
        : { attachments: undefined })
    }
    session.updatedAt = now()
    this.sessions.set(session.id, session)
    if (persist) {
      this.schedulePersist('immediate', session.id)
    }
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
    this.schedulePersist('immediate', session.id)

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
    this.schedulePersist(persistMode, session.id)

    return cloneSession(session)
  }

  /**
   * @description 将单个会话快照原子写入其独立 session.json 文件。
   * @param sessionId 要持久化的会话 ID。
   * @returns 写入完成后的 Promise。
   */
  private async persistSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    await writeJsonFileAtomic(
      getChatSessionPath(session.characterId, session.id),
      cloneSession(session)
    )
  }

  /**
   * @description 将会话保存请求加入串行队列，并统一记录保存失败。
   * @param mode 保存模式；流式中间态使用短延迟合并，终态立即排队保存。
   * @param sessionId 要保存的会话 ID。
   */
  private schedulePersist(
    mode: 'immediate' | 'debounced' = 'immediate',
    sessionId?: string
  ): void {
    if (sessionId) {
      this.pendingPersistSessionIds.add(sessionId)
    }
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
    const sessionIds = [...this.pendingPersistSessionIds]
    this.pendingPersistSessionIds.clear()
    if (sessionIds.length === 0) {
      return
    }
    this.persistQueue = this.persistQueue
      .then(async () => {
        for (const sessionId of sessionIds) {
          await this.persistSession(sessionId)
        }
      })
      .catch((error) => {
        void logger.error('main', 'sessions-save-failed', 'Failed to save conversation sessions', {
          sessionIds,
          error: error instanceof Error ? error.message : String(error)
        })
      })
  }
}
