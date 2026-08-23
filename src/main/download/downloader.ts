import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'path'
import { request } from './http-client'
import type { DownloadFile, DownloadOptions } from './types'

const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * @description 将远端文件批量下载到指定目录，并以临时文件替换目标文件。
 * @param files 待下载的相对文件清单。
 * @param destinationRoot 文件保存根目录。
 * @param options 下载限制和进度回调。
 * @remarks 文件路径必须保持在 destinationRoot 内；单个文件失败会停止后续下载。
 */
export async function downloadFiles(
  files: DownloadFile[],
  destinationRoot: string,
  options?: DownloadOptions
): Promise<void> {
  for (const [index, file] of files.entries()) {
    const targetPath = resolveSafePath(destinationRoot, file.path)
    const response = await request(file.url, {
      timeoutMs: options?.timeoutMs,
      maxResponseBytes: options?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      headers: { 'User-Agent': 'WuWaChat' }
    })
    const content = Buffer.from(await response.arrayBuffer())
    const maxFileBytes = options?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
    if (content.byteLength > maxFileBytes) {
      throw new Error(`Downloaded file ${file.path} exceeds the ${maxFileBytes} byte limit.`)
    }
    if (file.sizeBytes !== undefined && file.sizeBytes > 0 && content.byteLength !== file.sizeBytes) {
      throw new Error(
        `Downloaded file ${file.path} has size ${content.byteLength}, expected ${file.sizeBytes}.`
      )
    }

    await writeAtomic(targetPath, content)
    options?.onProgress?.({
      completed: index + 1,
      total: files.length,
      currentPath: file.path
    })
  }
}

/**
 * @description 校验并解析远端文件相对路径。
 * @param rootPath 文件保存根目录。
 * @param filePath 远端清单中的相对路径。
 * @returns 位于根目录内的绝对路径。
 */
function resolveSafePath(rootPath: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new Error(`Download path must be relative: ${filePath}`)
  }

  const root = resolve(rootPath)
  const target = resolve(root, filePath)
  const relativePath = relative(root, target)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Download path escapes destination root: ${filePath}`)
  }

  return target
}

/**
 * @description 将文件写入临时文件后替换目标文件。
 * @param targetPath 目标文件路径。
 * @param content 文件内容。
 */
async function writeAtomic(targetPath: string, content: Buffer): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temporaryPath, content)
    await rename(temporaryPath, targetPath)
  } catch (error) {
    try {
      await rm(temporaryPath, { force: true })
    } catch (cleanupError) {
      console.error('Failed to clean temporary download file:', cleanupError)
    }
    throw error
  }
}
