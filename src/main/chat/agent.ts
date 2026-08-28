import {
  createAgentRuntime,
  type AgentRunRequest,
  type AgentRunResult,
  type AgentToolPackage
} from '@main/agent'
import { createDatetimeToolPackage } from '@main/agent/tools/datetime'
import { createGlossaryToolPackage } from '@main/agent/tools/glossary'
import { createStoryToolPackage } from '@main/agent/tools/story'
import { createMemoryToolPackage } from '@main/agent/tools/memory'
import { createMoeGirlpediaToolPackage } from '@main/agent/tools/moegirlpedia'
import { createChatImageToolPackage } from '@main/agent/tools/chat-images'
import { createChatEmoticonToolPackage } from '@main/agent/tools/chat-emoticons'
import { MoeGirlpediaApiClient } from '@main/agent/tools/moegirlpedia/api'
import type { GlossaryService } from '@main/world/glossary'
import type { StoryService } from '@main/world/story'
import type { MemoryService } from '@main/memory'
import type { AgentToolPackageId } from '@shared/agent'
import type { MoeGirlpediaSettings } from '@shared/agent-settings'
import { createChatModel } from './model-factory'

export type ChatAgent = (request: Omit<AgentRunRequest, 'tools'>) => Promise<AgentRunResult>

type MoeGirlpediaClientCache = {
  username: string
  botPassword: string
  client: MoeGirlpediaApiClient
}

/**
 * @description 创建当前聊天入口使用的 Agent，并在每次运行前按设置选择模型可见工具。
 * @param story 背景故事服务。
 * @param memory 当前角色长期记忆服务。
 * @param glossary 本地 world 名词解释服务。
 * @returns 当前聊天流程调用的 Agent 函数。
 */
export function createChatAgent(
  story: StoryService,
  memory: MemoryService,
  glossary: GlossaryService
): ChatAgent {
  const runAgent = createAgentRuntime(createChatModel)
  let moegirlpediaCache: MoeGirlpediaClientCache | null = null

  return async (request) => {
    const cachedClient = resolveMoeGirlpediaClient(
      request.context.policy.moegirlpedia,
      moegirlpediaCache
    )
    moegirlpediaCache = cachedClient.cache
    const enabled = request.context.policy.enabledToolPackageIds
    const context = enabled.includes('story')
      ? { ...request.context, storyScope: await story.getScope(request.context.character.name) }
      : request.context
    return runAgent({
      ...request,
      context,
      tools: [
        ...createEnabledToolPackages(
          story,
          memory,
          glossary,
          enabled,
          request.context.policy.moegirlpedia,
          cachedClient.client
        ),
        ...(context.imageResources ? [createChatImageToolPackage()] : []),
        ...(context.emoticonResources ? [createChatEmoticonToolPackage()] : [])
      ]
    })
  }
}

/**
 * @description 返回当前设置会暴露给模型的聊天工具名称。
 * @param story 背景故事服务。
 * @param memory 当前角色长期记忆服务。
 * @param glossary 本地 world 名词解释服务。
 * @param enabledToolPackageIds 已启用的工具包标识。
 * @param moegirlpedia 萌娘百科登录配置。
 * @returns 模型本次运行可见的工具名称。
 */
export function getEnabledChatAgentToolNames(
  story: StoryService,
  memory: MemoryService,
  glossary: GlossaryService,
  enabledToolPackageIds: AgentToolPackageId[],
  moegirlpedia: MoeGirlpediaSettings
): string[] {
  return createEnabledToolPackages(
    story,
    memory,
    glossary,
    enabledToolPackageIds,
    moegirlpedia
  ).flatMap((toolPackage) => toolPackage.tools.map((tool) => tool.name))
}

/**
 * @description 根据当前设置创建本次 Agent 运行可见的工具包。
 * @param story 背景故事服务。
 * @param memory 当前角色长期记忆服务。
 * @param glossary 本地 world 名词解释服务。
 * @param enabledToolPackageIds 已启用的工具包标识。
 * @param moegirlpedia 萌娘百科登录配置。
 * @param moegirlpediaClient 当前聊天 Agent 缓存的萌娘百科客户端。
 * @returns 本次运行可绑定到模型的工具包。
 */
function createEnabledToolPackages(
  story: StoryService,
  memory: MemoryService,
  glossary: GlossaryService,
  enabledToolPackageIds: AgentToolPackageId[],
  moegirlpedia: MoeGirlpediaSettings,
  moegirlpediaClient?: MoeGirlpediaApiClient
): AgentToolPackage[] {
  const enabled = new Set(enabledToolPackageIds)
  const toolPackages = [
    createStoryToolPackage(story),
    createGlossaryToolPackage(glossary),
    createMemoryToolPackage(memory),
    createDatetimeToolPackage(),
    createMoeGirlpediaToolPackage(moegirlpedia, moegirlpediaClient)
  ]
  return toolPackages.filter((toolPackage) => enabled.has(toolPackage.id as AgentToolPackageId))
}

/**
 * @description 按当前凭据复用萌娘百科 API 客户端，并在凭据变化时创建新客户端。
 * @param settings 当前萌娘百科登录配置。
 * @param cache 上一次聊天运行使用的客户端缓存。
 * @returns 当前运行应使用的客户端及更新后的缓存。
 */
function resolveMoeGirlpediaClient(
  settings: MoeGirlpediaSettings,
  cache: MoeGirlpediaClientCache | null
): { client: MoeGirlpediaApiClient; cache: MoeGirlpediaClientCache } {
  const username = settings.username.trim()
  const botPassword = settings.botPassword.trim()
  if (cache && cache.username === username && cache.botPassword === botPassword) {
    return { client: cache.client, cache }
  }
  const client = new MoeGirlpediaApiClient({ username, botPassword })
  return { client, cache: { username, botPassword, client } }
}
