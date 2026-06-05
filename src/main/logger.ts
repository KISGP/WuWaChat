import { app, shell } from 'electron'
import { appendFile, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  LogContext,
  LogEntry,
  LogLevel,
  LogSource,
  LogViewerState,
  RendererLogEventPayload
} from '../shared/logging'
import { getLogsRoot, pathExists } from './utils'

type LogInput = {
  level: LogLevel
  source: LogSource
  event: string
  message: string
  context?: LogContext
}

const SENSITIVE_KEYS = new Set([
  'apiKey',
  'apikey',
  'authorization',
  'Authorization',
  'prompt',
  'userMessage',
  'messageContent',
  'messages',
  'vector',
  'vectors',
  'vectorJson',
  'encryptedApiKey'
])

const FULL_TEXT_LOG_KEYS = new Set([
  'systemPromptText',
  'retrievalContextText',
  'chatMessages',
  'modelInput'
])

let writeQueue = Promise.resolve()

function getLogsDirectory(): string {
  return getLogsRoot()
}

function getLogFilePath(): string {
  return join(getLogsDirectory(), 'app.log')
}

function sanitizeValue(value: unknown): unknown {
  if (value == null) {
    return value
  }

  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 497)}...` : value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item))
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 50)
    return Object.fromEntries(
      entries.map(([key, nestedValue]) => [
        key,
        SENSITIVE_KEYS.has(key) ? '[redacted]' : sanitizeValue(nestedValue)
      ])
    )
  }

  return String(value)
}

function sanitizeByKey(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key)) {
    return '[redacted]'
  }

  if (FULL_TEXT_LOG_KEYS.has(key)) {
    return sanitizeValue(value)
  }

  return sanitizeValue(value)
}

function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(context)
      .slice(0, 50)
      .map(([key, value]) => [key, sanitizeByKey(key, value)])
  ) as LogContext
}

function toConsoleMethod(level: LogLevel): 'log' | 'warn' | 'error' {
  if (level === 'warn') return 'warn'
  if (level === 'error') return 'error'
  return 'log'
}

async function appendLine(line: string): Promise<void> {
  await mkdir(dirname(getLogFilePath()), { recursive: true })
  await appendFile(getLogFilePath(), line, 'utf-8')
}

function enqueueWrite(line: string): Promise<void> {
  writeQueue = writeQueue
    .then(() => appendLine(line))
    .catch((error) => {
      console.error('Failed to write log entry', error)
    })

  return writeQueue
}

function printConsole(entry: LogEntry): void {
  if (app.isPackaged && entry.level !== 'error') {
    return
  }

  const consoleMethod = toConsoleMethod(entry.level)
  console[consoleMethod](
    `[${entry.level.toUpperCase()}] ${entry.timestamp} ${entry.source}:${entry.event} ${entry.message}`,
    entry.context ?? ''
  )
}

async function writeEntry(input: LogInput): Promise<void> {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: input.level,
    source: input.source,
    event: input.event,
    message: input.message,
    context: sanitizeContext(input.context)
  }

  printConsole(entry)
  await enqueueWrite(`${JSON.stringify(entry)}\n`)
}

export const logger = {
  debug(source: LogSource, event: string, message: string, context?: LogContext): Promise<void> {
    return writeEntry({ level: 'debug', source, event, message, context })
  },
  info(source: LogSource, event: string, message: string, context?: LogContext): Promise<void> {
    return writeEntry({ level: 'info', source, event, message, context })
  },
  warn(source: LogSource, event: string, message: string, context?: LogContext): Promise<void> {
    return writeEntry({ level: 'warn', source, event, message, context })
  },
  error(source: LogSource, event: string, message: string, context?: LogContext): Promise<void> {
    return writeEntry({ level: 'error', source, event, message, context })
  },
  trackRendererEvent(payload: RendererLogEventPayload): Promise<void> {
    return writeEntry({
      level: payload.level || 'info',
      source: payload.source,
      event: payload.event,
      message: payload.message,
      context: payload.context
    })
  },
  async getViewerState(): Promise<LogViewerState> {
    const filePath = getLogFilePath()
    const exists = await pathExists(filePath)

    if (!exists) {
      return {
        directoryPath: getLogsDirectory(),
        filePath,
        exists: false,
        sizeBytes: 0,
        updatedAt: null
      }
    }

    const fileStat = await stat(filePath)

    return {
      directoryPath: getLogsDirectory(),
      filePath,
      exists: true,
      sizeBytes: fileStat.size,
      updatedAt: fileStat.mtime.toISOString()
    }
  },
  async readLogs(): Promise<LogEntry[]> {
    const filePath = getLogFilePath()
    if (!(await pathExists(filePath))) {
      return []
    }

    const content = await readFile(filePath, 'utf-8')
    return content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          const parsed = JSON.parse(line) as LogEntry
          return parsed
        } catch {
          return {
            timestamp: '',
            level: 'warn',
            source: 'main',
            event: 'log-parse-failed',
            message: line,
            rawLine: line
          } satisfies LogEntry
        }
      })
  },
  async openDirectory(): Promise<void> {
    const directoryPath = getLogsDirectory()
    await mkdir(directoryPath, { recursive: true })
    await shell.openPath(directoryPath)
  },
  async clearLogs(): Promise<void> {
    await mkdir(getLogsDirectory(), { recursive: true })
    await writeFile(getLogFilePath(), '', 'utf-8')
  },
  getLogFilePath,
  getLogsDirectory
}
