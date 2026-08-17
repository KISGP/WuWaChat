import { createHash } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import { basename, dirname, join, relative } from 'path'
import type { LorePackage, LoreScene, LoreTask, LoreTerm } from '@shared/lore'
import { pathExists } from '@main/utils'

const GLOSSARY_FILE_PATTERN = /名词解释/i
const SCENE_HEADING_PATTERN = /^##\s+(.+?)\s*$/gm
const SPEAKER_LABEL_PATTERN = /^([^\r\n：:]{1,64})[：:]/gm

/**
 * @description 递归读取目录中的 Markdown 文件，用于构建只读原作资料包。
 * @param rootPath 原作资料根目录。
 * @returns 所有 Markdown 文件的绝对路径。
 */
async function walkMarkdownFiles(rootPath: string): Promise<string[]> {
  if (!(await pathExists(rootPath))) return []

  const entries = await readdir(rootPath, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const targetPath = join(rootPath, entry.name)
      if (entry.isDirectory()) return walkMarkdownFiles(targetPath)

      return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [targetPath] : []
    })
  )

  return nested.flat().sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

/**
 * @description 标准化原作中的说话人标签，移除通讯状态和展示装饰但不推断角色身份。
 * @param label 原始说话人标签。
 * @returns 可用于精确匹配的标签。
 */
export function normalizeSpeakerLabel(label: string): string {
  return label
    .trim()
    .replace(/（[^）]*）/g, '')
    .replace(/[「」]/g, '')
    .trim()
}

/**
 * @description 从原作文本中提取所有明确的说话人标签。
 * @param content 原作 Markdown 文本。
 * @returns 去重后的标准化说话人标签。
 */
function collectParticipantLabels(content: string): string[] {
  const labels = new Set<string>()
  for (const match of content.matchAll(SPEAKER_LABEL_PATTERN)) {
    const normalized = normalizeSpeakerLabel(match[1])
    if (normalized && !normalized.startsWith('#')) {
      labels.add(normalized)
    }
  }

  return [...labels].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

/**
 * @description 将单个任务 Markdown 按二级标题拆分为连续且保留原文的场景。
 * @param taskId 当前任务标识。
 * @param taskTitle 当前任务标题。
 * @param content 任务原文。
 * @returns 按原作顺序排列的场景列表。
 */
function parseTaskScenes(taskId: string, taskTitle: string, content: string): LoreScene[] {
  const headings = [...content.matchAll(SCENE_HEADING_PATTERN)]
  if (headings.length === 0) {
    const text = content.trim()
    return text
      ? [
          {
            id: `${taskId}:scene:0`,
            taskId,
            ordinal: 0,
            title: taskTitle,
            text
          }
        ]
      : []
  }

  return headings.flatMap((heading, index) => {
    const textStart = (heading.index || 0) + heading[0].length
    const textEnd = headings[index + 1]?.index ?? content.length
    const text = content.slice(textStart, textEnd).trim()
    if (!text) {
      return []
    }

    return [
      {
        id: `${taskId}:scene:${index}`,
        taskId,
        ordinal: index,
        title: heading[1].trim(),
        text
      }
    ]
  })
}

/**
 * @description 从名词解释 Markdown 解析原文术语定义，不生成或扩展新的事实内容。
 * @param content 名词解释原文。
 * @param sourcePath 相对资料根目录的来源路径。
 * @returns 术语原文定义列表。
 */
function parseTerms(content: string, sourcePath: string): LoreTerm[] {
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separatorIndex = line.search(/[:：]/)
      const term = (separatorIndex < 0 ? line : line.slice(0, separatorIndex)).trim()
      const definition = (separatorIndex < 0 ? line : line.slice(separatorIndex + 1)).trim() || line
      return {
        id: `term:${sourcePath}:${index}`,
        term,
        definition,
        sourcePath,
        knownByTaskIds: []
      }
    })
}

/**
 * @description 将当前 Markdown 资料确定性编译为 Lore Package，不生成摘要或推断性事实。
 * @param worldRoot 当前安装的原作资料目录。
 * @returns 可供运行时检索的原作资料包。
 */
export async function compileLorePackage(worldRoot: string): Promise<LorePackage> {
  const files = await walkMarkdownFiles(worldRoot)
  const documents = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      content: await readFile(filePath, 'utf-8')
    }))
  )
  const fingerprint = createHash('sha256')
  const tasks: LoreTask[] = []
  const scenes: LoreScene[] = []
  const terms: LoreTerm[] = []

  for (const document of documents) {
    const sourcePath = relative(worldRoot, document.filePath).replace(/\\/g, '/')
    fingerprint.update(sourcePath)
    fingerprint.update('\0')
    fingerprint.update(document.content)
    fingerprint.update('\0')

    if (GLOSSARY_FILE_PATTERN.test(basename(document.filePath, '.md'))) {
      terms.push(...parseTerms(document.content, sourcePath))
      continue
    }

    const taskId = `task:${sourcePath}`
    const taskTitle = basename(document.filePath, '.md')
    const categoryPath = dirname(sourcePath).replace(/\\/g, '/')
    tasks.push({
      id: taskId,
      title: taskTitle,
      category: categoryPath === '.' ? null : categoryPath,
      sourcePath,
      participantLabels: collectParticipantLabels(document.content)
    })
    scenes.push(...parseTaskScenes(taskId, taskTitle, document.content))
  }

  const sourceFingerprint = fingerprint.digest('hex')
  const termsWithKnownByTasks = terms.map((term) => ({
    ...term,
    knownByTaskIds: tasks
      .filter((task) =>
        scenes.some((scene) => scene.taskId === task.id && scene.text.includes(term.term))
      )
      .map((task) => task.id)
  }))

  return {
    source: {
      kind: 'markdown-build',
      sourceFingerprint,
      builtAt: new Date().toISOString()
    },
    story: {
      tasks,
      scenes,
      summaries: []
    },
    glossary: {
      terms: termsWithKnownByTasks
    }
  }
}
