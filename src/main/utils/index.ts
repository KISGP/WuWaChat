

import { mkdir, readdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, extname } from 'path'
import { pathExists } from './path'

export function now(): string {
  return new Date().toISOString()
}

/**
 * @description 读取目录下的所有子目录名，返回一个字符串数组。
 * @param path 目录路径
 * @returns 子目录名数组
 * @throws 如果指定路径不存在或不是一个目录，将抛出错误。
 * @remarks 该函数仅返回直接子目录的名称，不会递归读取子目录中的内容。返回的目录名不包含路径分隔符。
 */
export async function readDirectoryNames(path: string): Promise<string[]> {
  if (!(await pathExists(path))) {
    return []
  }

  const entries = await readdir(path, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

/**
 * @description 读取指定路径的文本文件内容，如果文件不存在则返回 null。
 * @param path 文件路径
 * @returns 文件内容字符串，或 null 如果文件不存在
 * @remarks 该函数会尝试以 UTF-8 编码读取文件内容，如果文件存在但无法读取（例如权限问题），将抛出错误。仅当文件完全不存在时才返回 null。
*/
export async function readFileNames(path: string): Promise<string[]> {
  if (!(await pathExists(path))) {
    return []
  }

  const entries = await readdir(path, { withFileTypes: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
}

/**
 * @description 读取指定路径的文本文件内容，如果文件不存在则返回 null。
 * @param path 文件路径
 * @returns 文件内容字符串，或 null 如果文件不存在
 * @remarks 该函数会尝试以 UTF-8 编码读取文件内容，如果文件存在但无法读取（例如权限问题），将抛出错误。仅当文件完全不存在时才返回 null。
*/
export async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

/**
 * @description 读取指定路径的文本文件内容，如果文件不存在则返回 null。
 * @param path 文件路径
 * @returns 文件内容字符串，或 null 如果文件不存在
 * @remarks 该函数会尝试以 UTF-8 编码读取文件内容，如果文件存在但无法读取（例如权限问题），将抛出错误。仅当文件完全不存在时才返回 null。
*/
export function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  return `${trimmedBase}/${trimmedPath}`
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

/**
 * @description 读取指定路径的图像文件并将其转换为 Data URL 格式的字符串，适用于直接在 HTML 中使用。
 * @param path 图像文件的路径
 * @returns 图像的 Data URL 字符串，例如 "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
 * @remarks 该函数会根据文件扩展名自动推断 MIME 类型，并以 Base64 编码返回图像数据。如果文件不存在或无法读取，将抛出错误。
*/
export async function readImageDataUrl(path: string): Promise<string> {
  const extension = extname(path).toLowerCase()
  const mime = MIME_BY_EXTENSION[extension] || 'application/octet-stream'
  const data = await readFile(path)
  return `data:${mime};base64,${data.toString('base64')}`
}

/**
 * @description 将给定的 JavaScript 对象以 JSON 格式原子性地写入指定路径的文件中。写入过程中会先将数据写入一个临时文件，完成后再重命名为目标文件，以避免部分写入导致的数据损坏。
 * @param path 目标文件路径
 * @param value 要写入的 JavaScript 对象，将被转换为 JSON 字符串
 * @returns 一个 Promise，表示写入操作完成
 * @remarks 该函数会确保在写入过程中不会留下不完整的文件。如果目标文件所在的目录不存在，会自动创建。写入的 JSON 字符串会使用 2 个空格进行缩进以提高可读性。
*/
export async function writeJsonFileAtomic(path: string, value: unknown): Promise<void> {
  const tempPath = `${path}.tmp`

  await mkdir(dirname(path), { recursive: true })
  await writeFile(tempPath, JSON.stringify(value, null, 2), 'utf-8')
  await rename(tempPath, path)
}


export * from './path'