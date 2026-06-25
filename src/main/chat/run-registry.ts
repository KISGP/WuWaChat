export type ActiveRun = {
  controller: AbortController
  sessionId: string
  messageId: string
  startedAt: number
  chunkCount: number
  charCount: number
}

export class RunRegistry {
  private readonly activeRuns = new Map<string, ActiveRun>()

  register(requestId: string, sessionId: string, messageId: string): ActiveRun {
    const activeRun: ActiveRun = {
      controller: new AbortController(),
      sessionId,
      messageId,
      startedAt: Date.now(),
      chunkCount: 0,
      charCount: 0
    }

    this.activeRuns.set(requestId, activeRun)
    return activeRun
  }

  get(requestId: string): ActiveRun | undefined {
    return this.activeRuns.get(requestId)
  }

  abort(requestId: string): ActiveRun | undefined {
    const activeRun = this.activeRuns.get(requestId)
    activeRun?.controller.abort()
    return activeRun
  }

  trackChunk(requestId: string, chunk: string): ActiveRun | undefined {
    const activeRun = this.activeRuns.get(requestId)
    if (!activeRun) {
      return undefined
    }

    activeRun.chunkCount += 1
    activeRun.charCount += chunk.length
    return activeRun
  }

  delete(requestId: string): void {
    this.activeRuns.delete(requestId)
  }
}
