import { Annotation } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'
import type {
  CharacterSummary,
  ConversationMessage,
  ConversationSession,
  ModelProfile
} from '@shared/chat'

export const GraphState = Annotation.Root({
  requestId: Annotation<string>,
  sessionId: Annotation<string>,
  assistantMessageId: Annotation<string>,
  profileId: Annotation<string>,
  characterId: Annotation<string>,
  userMessage: Annotation<string>,
  profile: Annotation<ModelProfile>,
  session: Annotation<ConversationSession>,
  character: Annotation<CharacterSummary>,
  prompt: Annotation<string>,
  history: Annotation<ConversationMessage[]>(),
  retrievalContext: Annotation<string[]>(),
  llmMessages: Annotation<BaseMessage[]>(),
  assistantDraft: Annotation<string>,
  abortSignal: Annotation<AbortSignal>
})

export type GraphStateValue = typeof GraphState.State
