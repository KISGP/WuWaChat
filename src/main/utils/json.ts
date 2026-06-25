import { randomUUID } from 'crypto'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'

/**
 * @description 以原子写入方式保存 JSON 文件，避免部分写入导致数据损坏。
 * @param path 目标文件路径。
 * @param value 要写入的可序列化值。
 * @returns 写入完成后的 Promise。
 */
export async function writeJsonFileAtomic(path: string, value: unknown): Promise<void> {
  const tempPath = join(
    dirname(path),
    `${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  )

  await mkdir(dirname(path), { recursive: true })

  try {
    await writeFile(tempPath, JSON.stringify(value, null, 2), 'utf-8')
    await rename(tempPath, path)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}
