import { readdir, stat } from 'fs/promises'
import { dirname, join } from 'path'
import type { StorageUsageItem, StorageUsageSnapshot } from '@shared/storage'
import { logger } from '@main/logging'
import {
  getAppDataRoot,
  getCharactersCachePath,
  getCharactersRoot,
  getLogsRoot,
  getLoreMarkdownSourceMetadataPath,
  getLoreMarkdownSourceRoot,
  getLorePackagePath,
  getSettingsPath,
  getSessionsPath,
  pathExists
} from '@main/utils'

type StorageCategoryDefinition = Omit<StorageUsageItem, 'sizeBytes'> & {
  paths: string[]
}

const STORAGE_CATEGORIES: StorageCategoryDefinition[] = [
  {
    id: 'sessions',
    label: '会话',
    path: getSessionsPath(),
    paths: [getSessionsPath()],
    description: '聊天会话与历史消息数据',
    color: '#e8c690'
  },
  {
    id: 'characters',
    label: '角色',
    path: getCharactersRoot(),
    paths: [getCharactersRoot()],
    description: '本地角色、头像、卡面与 Prompt',
    color: '#77d6ff'
  },
  {
    id: 'loreSource',
    label: '原作资料',
    path: getLoreMarkdownSourceRoot(),
    paths: [getLoreMarkdownSourceRoot(), getLoreMarkdownSourceMetadataPath(), getLorePackagePath()],
    description: '原作 Markdown 与资料包元数据',
    color: '#ff9f7a'
  },
  {
    id: 'logs',
    label: '日志',
    path: getLogsRoot(),
    paths: [getLogsRoot()],
    description: '应用运行日志',
    color: '#ff7aa8'
  },
  {
    id: 'settings',
    label: '设置',
    path: dirname(getSettingsPath()),
    paths: [getSettingsPath()],
    description: '模型配置、通用设置、记忆设置与界面外观',
    color: '#7adbc4'
  },
  {
    id: 'cache',
    label: '缓存',
    path: getCharactersCachePath(),
    paths: [getCharactersCachePath()],
    description: '角色目录与远程资源缓存',
    color: '#ffd36a'
  }
]

const OTHER_CATEGORY: Omit<StorageUsageItem, 'sizeBytes' | 'path'> = {
  id: 'other',
  label: '其他',
  description: '未归入固定分类的应用数据',
  color: '#a9b2c3'
}

/**
 * @description 递归计算文件或目录占用的字节数。
 * @param targetPath 待统计的文件或目录路径。
 * @returns 路径不存在时返回 0；存在时返回所有文件大小总和。
 */
async function getPathSize(targetPath: string): Promise<number> {
  if (!(await pathExists(targetPath))) {
    return 0
  }

  const targetStat = await stat(targetPath)
  if (targetStat.isFile()) {
    return targetStat.size
  }

  if (!targetStat.isDirectory()) {
    return 0
  }

  const entries = await readdir(targetPath, { withFileTypes: true })
  const sizes = await Promise.all(entries.map((entry) => getPathSize(join(targetPath, entry.name))))
  return sizes.reduce((total, size) => total + size, 0)
}

/**
 * @description 汇总分类定义中所有路径的磁盘占用。
 * @param definition 存储分类定义。
 * @returns 带字节占用的分类条目。
 */
async function buildCategoryItem(definition: StorageCategoryDefinition): Promise<StorageUsageItem> {
  const sizes = await Promise.all(definition.paths.map((targetPath) => getPathSize(targetPath)))
  const sizeBytes = sizes.reduce((total, size) => total + size, 0)

  return {
    id: definition.id,
    label: definition.label,
    sizeBytes,
    path: definition.path,
    description: definition.description,
    color: definition.color
  }
}

/**
 * @description 计算 app-data 根目录中未被固定分类覆盖的文件大小。
 * @returns 其他应用数据的总字节数。
 */
async function getOtherSize(): Promise<number> {
  const rootPath = getAppDataRoot()
  if (!(await pathExists(rootPath))) {
    return 0
  }

  const allSize = await getPathSize(rootPath)
  const classifiedItems = await Promise.all(
    STORAGE_CATEGORIES.map((definition) =>
      Promise.all(definition.paths.map((targetPath) => getPathSize(targetPath))).then((sizes) =>
        sizes.reduce((total, size) => total + size, 0)
      )
    )
  )
  const classifiedSize = classifiedItems.reduce((total, size) => total + size, 0)
  return Math.max(0, allSize - classifiedSize)
}

/**
 * @description 读取应用数据目录的存储占用快照，按业务分类返回给设置页。
 * @returns 当前应用数据目录的存储使用分析。
 * @remarks 扫描失败会记录日志并继续向上抛出，便于 IPC 层统一监控错误。
 */
export async function getStorageUsageSnapshot(): Promise<StorageUsageSnapshot> {
  try {
    const rootPath = getAppDataRoot()
    const [categoryItems, otherSize] = await Promise.all([
      Promise.all(STORAGE_CATEGORIES.map((definition) => buildCategoryItem(definition))),
      getOtherSize()
    ])

    const items: StorageUsageItem[] = [
      ...categoryItems,
      {
        ...OTHER_CATEGORY,
        path: rootPath,
        sizeBytes: otherSize
      }
    ]
    const totalBytes = items.reduce((total, item) => total + item.sizeBytes, 0)

    return {
      rootPath,
      totalBytes,
      scannedAt: new Date().toISOString(),
      items
    }
  } catch (error) {
    await logger.error('main', 'storage-usage-scan-failed', 'Failed to scan storage usage', {
      rootPath: getAppDataRoot(),
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}
