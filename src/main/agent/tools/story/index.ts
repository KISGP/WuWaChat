import type { StoryService } from '@main/world/story'
import type { AgentTool, AgentToolContext, AgentToolPackage } from '@main/agent/runtime/agent-types'

/**
 * @description 创建只允许读取当前角色候选场景的 Story 工具包。
 * @param story 本地 JSON Story 服务。
 * @returns 独立 Story 工具包。
 */
export function createStoryToolPackage(story: StoryService): AgentToolPackage {
  return { id: 'story', tools: [createScopeTool(), createReadTool(story)] }
}

/** @description 创建返回运行时确定性候选范围的工具。
 * @returns Story 范围工具。
 * */
function createScopeTool(): AgentTool {
  return {
    name: 'get_story_scope',
    description:
      'Return the deterministic Story task and scene candidates for the current character.',
    definition: {
      type: 'function',
      function: {
        name: 'get_story_scope',
        description: 'Return the candidate Story scenes available to read.',
        parameters: { type: 'object', additionalProperties: false, properties: {} }
      }
    },
    execute: async (_input: Record<string, unknown>, context: AgentToolContext) => ({
      status: 'completed',
      data: context.storyScope || { characterName: context.character.name, tasks: [], scenes: [] },
      complete: true
    })
  }
}

/** @description 创建候选集合内的正文读取工具。
 * @param story 本地 JSON Story 服务。
 * @returns Story 正文读取工具。
 * */
function createReadTool(story: StoryService): AgentTool {
  return {
    name: 'read_story_scenes',
    description: 'Read full text for explicitly selected scene keys from the current Story scope.',
    definition: {
      type: 'function',
      function: {
        name: 'read_story_scenes',
        description: 'Read one or more scene keys returned by get_story_scope.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['sceneKeys'],
          properties: {
            sceneKeys: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } }
          }
        }
      }
    },
    execute: async (input: Record<string, unknown>, context: AgentToolContext) => {
      const scope = context.storyScope || {
        characterName: context.character.name,
        tasks: [],
        scenes: []
      }
      const sceneKeys = Array.isArray(input.sceneKeys)
        ? input.sceneKeys.filter((value): value is string => typeof value === 'string')
        : []
      if (sceneKeys.length === 0) throw new Error('sceneKeys must contain at least one scene key.')
      const evidence = await story.readScenes(sceneKeys, scope)
      return {
        status: 'completed' as const,
        data: evidence,
        sourceIds: evidence.map((item) => item.sceneKey),
        complete: true
      }
    }
  }
}
