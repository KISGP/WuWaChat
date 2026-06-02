import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type {
  ConversationMessage,
  ConversationSession,
  MessageStatus,
  SessionStatus
} from '../../shared/ai'
import { writeJsonFileAtomic, pathExists, getResourcesRoot } from '../utils'


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

export class SessionStore {
  private sessions = new Map<string, ConversationSession>()

  async initialize(): Promise<void> {
    const filePath = this.getStorePath()
    if (!(await pathExists(filePath))) {
      return
    }

    try {
      const raw = JSON.parse(await readFile(filePath, 'utf-8')) as ConversationSession[]
      this.sessions = new Map(raw.map((session) => [session.id, cloneSession(session)]))
    } catch {
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

  startRun(input: {
    sessionId?: string | null
    characterId: string
    userMessage: string
  }): {
    session: ConversationSession
    assistantMessage: ConversationMessage
  } {
    const timestamp = now()
    const session =
      (input.sessionId && this.sessions.get(input.sessionId)) || createSession(input.characterId, timestamp)

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
    void this.persist()

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
    return this.updateMessage(sessionId, messageId, {
      content,
      status
    })
  }

  completeRun(sessionId: string, messageId: string, content: string): ConversationSession {
    return this.updateMessage(
      sessionId,
      messageId,
      {
        content,
        status: 'complete'
      },
      'idle'
    )
  }

  abortRun(sessionId: string, messageId: string): ConversationSession {
    return this.updateMessage(sessionId, messageId, undefined, 'idle', 'aborted')
  }

  failRun(sessionId: string, messageId: string, errorMessage: string): ConversationSession {
    return this.updateMessage(
      sessionId,
      messageId,
      (message) => ({
        content: message.content || errorMessage,
        status: 'error'
      }),
      'error'
    )
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
    defaultMessageStatus?: MessageStatus
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
    void this.persist()

    return cloneSession(session)
  }

  private getStorePath(): string {
    return join(getResourcesRoot(), 'sessions.json')
  }

  private async persist(): Promise<void> {
    await writeJsonFileAtomic(this.getStorePath(), this.getSessions())
  }
}
