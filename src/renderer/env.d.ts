/// <reference types="vite/client" />
import type { CharacterSummary, ConversationMessage, ConversationSession } from '@shared/ai'

declare global {
  type Char = CharacterSummary
  type Message = ConversationMessage
  type Session = ConversationSession
}

export {}
