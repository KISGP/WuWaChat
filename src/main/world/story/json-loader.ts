import { createHash } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import { relative, join } from 'path'
import { getWorldStoryRoot } from '@main/world/paths'
import { pathExists } from '@main/utils'
import { logger } from '@main/logging'
import type {
  StoryEvidence,
  StoryJsonScene,
  StoryJsonTask,
  StoryLoadStatus,
  StorySceneMetadata,
  StoryScopeResult,
  StoryTaskMetadata
} from '@shared/story'

type LoadedTask = { task: StoryJsonTask; taskKey: string; sourcePath: string; content: string }

/**
 * @description 只读扫描并索引 app-data/world/story 下的 JSON 任务文件。
 * */
export class JsonStoryLoader {
  private snapshotPromise: Promise<LoadedTask[]> | null = null
  private invalidFileCount = 0

  /**
   * @description 返回当前故事目录的任务快照；同一实例内并发调用共享一次扫描。
   * @returns 解析成功的任务列表。
   * */
  async loadTasks(): Promise<LoadedTask[]> {
    if (!this.snapshotPromise)
      this.snapshotPromise = this.scanTasks().catch((error) => {
        this.snapshotPromise = null
        throw error
      })
    return this.snapshotPromise
  }

  /**
   * @description 清除内存快照，使下一次读取重新扫描文件。
   * */
  invalidate(): void {
    this.snapshotPromise = null
  }

  /**
   * @description 返回当前 JSON 故事目录和解析统计。
   * @returns Loader 状态。
   * */
  async getStatus(): Promise<StoryLoadStatus> {
    const sourcePath = getWorldStoryRoot()
    try {
      const tasks = await this.loadTasks()
      const fingerprint = createHash('sha256')
        .update(tasks.map((task) => task.sourcePath + ':' + task.content).join('\n'))
        .digest('hex')
      return {
        available: tasks.length > 0,
        sourcePath,
        sourceFingerprint: fingerprint,
        taskCount: tasks.length,
        sceneCount: tasks.reduce((count, item) => count + item.task.scenes.length, 0),
        invalidFileCount: this.invalidFileCount
      }
    } catch (error) {
      await logger.error('main', 'world-story-load-failed', 'Failed to load Story JSON files', {
        sourcePath,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        available: false,
        sourcePath,
        sourceFingerprint: null,
        taskCount: 0,
        sceneCount: 0,
        invalidFileCount: this.invalidFileCount,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * @description 按参与人严格匹配角色，生成候选范围。
   * @param characterName 当前角色显示名。
   * @returns 当前角色允许访问的任务和场景元数据。
   * */
  async getScope(characterName: string): Promise<StoryScopeResult> {
    const tasks = await this.loadTasks()
    const matchedTasks = tasks.filter((item) => item.task.storyParticipants.includes(characterName))
    const taskMetadata: StoryTaskMetadata[] = matchedTasks.map((item) => ({
      taskKey: item.taskKey,
      taskId: item.task.id,
      title: item.task.title,
      summary: item.task.summary,
      sourcePath: item.sourcePath,
      participants: item.task.storyParticipants,
      sceneCount: item.task.scenes.length
    }))
    const scenes: StorySceneMetadata[] = matchedTasks.flatMap((item) =>
      item.task.scenes
        .map((scene, ordinal) => toSceneMetadata(item, scene, ordinal))
        .filter((scene) => scene.participants.includes(characterName))
    )
    return { characterName, tasks: taskMetadata, scenes }
  }

  /**
   * @description 读取候选范围内指定场景的原始正文。
   * @param sceneKeys 由范围服务产生的复合场景键。
   * @param scope 当前请求的候选范围。
   * @returns 去重后的原始场景证据。
   * */
  async readScenes(sceneKeys: string[], scope: StoryScopeResult): Promise<StoryEvidence[]> {
    const allowed = new Map(scope.scenes.map((scene) => [scene.sceneKey, scene]))
    const unauthorized = sceneKeys.filter((sceneKey) => !allowed.has(sceneKey))
    if (unauthorized.length > 0) {
      throw new Error('Requested Story scene is outside the current character scope.')
    }
    const tasks = await this.loadTasks()
    const byTaskKey = new Map(tasks.map((item) => [item.taskKey, item]))
    const seen = new Set<string>()
    const evidence: StoryEvidence[] = []
    for (const sceneKey of sceneKeys) {
      if (seen.has(sceneKey)) continue
      seen.add(sceneKey)
      const metadata = allowed.get(sceneKey)
      if (!metadata) continue
      const item = byTaskKey.get(metadata.taskKey)
      const scene = item?.task.scenes.find((candidate) => candidate.id === metadata.sceneId)
      if (!item || !scene) continue
      evidence.push({
        sceneKey,
        taskKey: metadata.taskKey,
        taskId: metadata.taskId,
        sceneId: metadata.sceneId,
        title: metadata.title,
        participants: metadata.participants,
        text: scene.text,
        sourcePath: metadata.sourcePath,
        jsonPointer: metadata.jsonPointer,
        contentHash: createHash('sha256').update(scene.text).digest('hex')
      })
    }
    return evidence
  }

  /**
   * @description 递归扫描并校验所有 JSON 任务文件。
   * */
  private async scanTasks(): Promise<LoadedTask[]> {
    const root = getWorldStoryRoot()
    this.invalidFileCount = 0
    if (!(await pathExists(root))) return []
    const files = await collectJsonFiles(root)
    const tasks: LoadedTask[] = []
    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf8')
        const task = parseTask(content, filePath)
        const sourcePath = relative(root, filePath).replaceAll('\\', '/')
        tasks.push({ task, taskKey: sourcePath + ':' + task.id, sourcePath, content })
      } catch (error) {
        this.invalidFileCount += 1
        await logger.error('main', 'world-story-json-invalid', 'Skipped invalid Story JSON file', {
          filePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return tasks
  }
}

/**
 * @description 收集目录下的 JSON 文件。
 * @param root 根目录路径。
 * @returns JSON 文件路径列表。
 */
async function collectJsonFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await collectJsonFiles(path)))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) files.push(path)
  }
  return files.sort()
}

/**
 * @description 校验并规范化单个任务 JSON。
 * @param content 任务 JSON 内容。
 * @param filePath 任务文件路径。
 * @returns 解析后的任务对象。
 */
function parseTask(content: string, filePath: string): StoryJsonTask {
  const value: unknown = JSON.parse(content)
  if (!value || typeof value !== 'object') throw new Error('Task must be an object: ' + filePath)
  const raw = value as Record<string, unknown>
  const id = requireString(raw.id, 'id', filePath)
  const title = requireString(raw.title, 'title', filePath)
  const summary = typeof raw.summary === 'string' ? raw.summary : ''
  const storyParticipants = requireStrings(raw.storyParticipants, 'storyParticipants', filePath)
  if (!Array.isArray(raw.scenes)) throw new Error('scenes must be an array: ' + filePath)
  const scenes = raw.scenes.map((scene, index) => parseScene(scene, filePath, index))
  if (new Set(scenes.map((scene) => scene.id)).size !== scenes.length) {
    throw new Error('scene ids must be unique within a task: ' + filePath)
  }
  return { id, title, summary, storyParticipants, scenes }
}

/**
 * @description 校验并规范化任务中的场景。
 * @param value 场景 JSON 内容。
 * @param filePath 任务文件路径。
 * @param index 场景在任务中的索引。
 * @returns 解析后的场景对象。
 */
function parseScene(value: unknown, filePath: string, index: number): StoryJsonScene {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid scene ' + index + ': ' + filePath)
  const raw = value as Record<string, unknown>
  return {
    id: requireString(raw.id, 'scenes[' + index + '].id', filePath),
    title:
      typeof raw.title === 'string'
        ? raw.title
        : requireString(raw.id, 'scenes[' + index + '].id', filePath),
    participants: requireStrings(raw.participants, 'scenes[' + index + '].participants', filePath),
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    text: typeof raw.text === 'string' ? raw.text : ''
  }
}

/**
 * @description 读取必需字符串字段。
 * @param value 字段值。
 * @param field 字段名。
 * @param filePath 文件路径。
 * @returns 解析后的字符串。
 */
function requireString(value: unknown, field: string, filePath: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(field + ' must be a non-empty string: ' + filePath)
  return value
}

/**
 * @description 读取必需字符串数组字段。
 * @param value 字段值。
 * @param field 字段名。
 * @param filePath 文件路径。
 * @returns 解析后的字符串数组。
 */
function requireStrings(value: unknown, field: string, filePath: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error(field + ' must be an array of strings: ' + filePath)
  return value as string[]
}

/**
 * @description 将任务和场景转换为带复合键的元数据。
 * @param item 加载的任务。
 * @param scene 场景对象。
 * @param ordinal 场景在任务中的序号。
 * @returns 转换后的场景元数据。
 */
function toSceneMetadata(
  item: LoadedTask,
  scene: StoryJsonScene,
  ordinal: number
): StorySceneMetadata {
  return {
    sceneKey: item.taskKey + '#' + scene.id,
    taskKey: item.taskKey,
    taskId: item.task.id,
    sceneId: scene.id,
    ordinal,
    title: scene.title,
    summary: scene.summary,
    participants: scene.participants,
    sourcePath: item.sourcePath,
    jsonPointer: '/scenes/' + ordinal
  }
}
