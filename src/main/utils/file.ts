import { readdir, readFile } from 'fs/promises'
import { extname } from 'path'
import { pathExists } from './path'

const MIME_BY_EXTENSION: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

/**
 * @description 读取目录下的直接子目录名称。
 * @param path 目录路径。
 * @returns 子目录名称数组；当目录不存在时返回空数组。
 */
export async function readDirectoryNames(path: string): Promise<string[]> {
  if (!(await pathExists(path))) {
    return []
  }

  const entries = await readdir(path, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

/**
 * @description 读取目录下的直接文件名称。
 * @param path 目录路径。
 * @returns 文件名称数组；当目录不存在时返回空数组。
 */
export async function readFileNames(path: string): Promise<string[]> {
  if (!(await pathExists(path))) {
    return []
  }

  const entries = await readdir(path, { withFileTypes: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
}

/**
 * @description 读取文本文件；当文件不存在或读取失败时返回 null。
 * @param path 文件路径。
 * @returns 文件内容或 null。
 */
export async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

/**
 * @description 读取图片文件并转换成 Data URL。
 * @param path 图片文件路径。
 * @returns 可直接用于页面展示的 Data URL。
 */
export async function readImageDataUrl(path: string): Promise<string> {
  const extension = extname(path).toLowerCase()
  const mime = MIME_BY_EXTENSION[extension] || 'application/octet-stream'
  const data = await readFile(path)
  return `data:${mime};base64,${data.toString('base64')}`
}
