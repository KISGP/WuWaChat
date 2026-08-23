import { getWorldManifestPath } from '@main/world/paths'
import { readOptionalFile, writeJsonFileAtomic } from '@main/utils'
import { logger } from '@main/logging'
import type { WorldManifest } from '@shared/world'

/**
 * @description 读取本地 world 资料版本清单。
 * @returns 有效清单；文件不存在或格式无效时返回 null。
 */
export async function readWorldManifest(): Promise<WorldManifest | null> {
  const content = await readOptionalFile(getWorldManifestPath())
  if (!content) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as Partial<WorldManifest>
    if (
      typeof parsed.version !== 'string' ||
      typeof parsed.downloadedAt !== 'string' ||
      !Array.isArray(parsed.files) ||
      typeof parsed.totalBytes !== 'number'
    ) {
      return null
    }

    const files = parsed.files.filter(
      (file): file is WorldManifest['files'][number] =>
        Boolean(file) &&
        typeof file.path === 'string' &&
        typeof file.url === 'string' &&
        typeof file.sizeBytes === 'number'
    )
    return {
      version: parsed.version,
      downloadedAt: parsed.downloadedAt,
      files,
      totalBytes: parsed.totalBytes
    }
  } catch (error) {
    await logger.error('main', 'world-manifest-invalid', 'Failed to parse world manifest', {
      error: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}

/**
 * @description 持久化 world 资料版本清单。
 * @param manifest 待保存的清单。
 */
export async function writeWorldManifest(manifest: WorldManifest): Promise<void> {
  await writeJsonFileAtomic(getWorldManifestPath(), manifest)
}
