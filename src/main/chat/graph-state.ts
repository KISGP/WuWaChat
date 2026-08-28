import { Annotation } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'
import type {
  CharacterSummary,
  ChatImageInput,
  ConversationMessage,
  ConversationSession,
  ModelProfile
} from '@shared/chat'
import type { ChatEmoticonImage } from '@shared/chat-emoticons'

export const GraphState = Annotation.Root({
  requestId: Annotation<string>,
  sessionId: Annotation<string>,
  assistantMessageId: Annotation<string>,
  profileId: Annotation<string>,
  characterId: Annotation<string>,
  userMessage: Annotation<string>,
  currentMessageIds: Annotation<string[]>(),
  currentImages: Annotation<ChatImageInput[]>(),
  profile: Annotation<ModelProfile>,
  session: Annotation<ConversationSession>,
  character: Annotation<CharacterSummary>,
  characterEmoticons: Annotation<ChatEmoticonImage[]>(),
  prompt: Annotation<string>,
  systemPromptText: Annotation<string>,
  history: Annotation<ConversationMessage[]>(),
  llmMessages: Annotation<BaseMessage[]>(),
  assistantDraft: Annotation<string>,
  abortSignal: Annotation<AbortSignal>
})

export type GraphStateValue = typeof GraphState.State
