import { END, START, StateGraph } from '@langchain/langgraph'
import { GraphState, type GraphStateValue } from './graph-state'
import type { ChatGraphNodeContext } from './graph-node-context'
import { createBuildMessagesNode } from './graph-nodes/build-messages'
import { createCommitAssistantMessageNode } from './graph-nodes/commit-assistant-message'
import { createInvokeModelNode } from './graph-nodes/invoke-model'
import { createLoadCharacterNode } from './graph-nodes/load-character'
import { createLoadProfileNode } from './graph-nodes/load-profile'
import { createLoadPromptNode } from './graph-nodes/load-prompt'
import { createLoadSessionNode } from './graph-nodes/load-session'
import { createLogModelInputNode } from './graph-nodes/log-model-input'
import { createPrepareHistoryNode } from './graph-nodes/prepare-history'
import { createRetrieveContextNode } from './graph-nodes/retrieve-context'

export function createAiGraph(context: ChatGraphNodeContext): {
  invoke: (input: Partial<GraphStateValue>) => Promise<unknown>
} {
  return new StateGraph(GraphState)
    .addNode('loadProfile', createLoadProfileNode(context))
    .addNode('loadSession', createLoadSessionNode(context))
    .addNode('loadCharacter', createLoadCharacterNode(context))
    .addNode('loadPrompt', createLoadPromptNode(context))
    .addNode('prepareHistory', createPrepareHistoryNode(context))
    .addNode('retrieveContext', createRetrieveContextNode(context))
    .addNode('buildMessages', createBuildMessagesNode())
    .addNode('logModelInput', createLogModelInputNode())
    .addNode('invokeModel', createInvokeModelNode(context))
    .addNode('commitAssistantMessage', createCommitAssistantMessageNode(context))
    .addEdge(START, 'loadProfile')
    .addEdge('loadProfile', 'loadSession')
    .addEdge('loadSession', 'loadCharacter')
    .addEdge('loadCharacter', 'loadPrompt')
    .addEdge('loadPrompt', 'prepareHistory')
    .addEdge('prepareHistory', 'retrieveContext')
    .addEdge('retrieveContext', 'buildMessages')
    .addEdge('buildMessages', 'logModelInput')
    .addEdge('logModelInput', 'invokeModel')
    .addEdge('invokeModel', 'commitAssistantMessage')
    .addEdge('commitAssistantMessage', END)
    .compile()
}
