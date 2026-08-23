import { requestJson } from '../http-client'
import type { GithubRepository, GithubSnapshot } from './types'

/**
 * @description 构造 GitHub 仓库文件的 raw 下载地址。
 * @param repository GitHub 仓库和分支。
 * @param filePath 仓库内文件路径。
 * @returns 文件 raw 下载地址。
 */
export function getGithubRawFileUrl(repository: GithubRepository, filePath: string): string {
  const path = filePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return 'https://raw.githubusercontent.com/' + encodeURIComponent(repository.owner) + '/' + encodeURIComponent(repository.name) + '/' + encodeURIComponent(repository.branch) + '/' + path
}


type GithubCommitResponse = {
  sha?: unknown
  commit?: { tree?: { sha?: unknown } }
}

type GithubTreeResponse = {
  truncated?: unknown
  tree?: Array<{ path?: unknown; type?: unknown; size?: unknown }>
}

/**
 * @description 读取 GitHub 仓库指定分支的文件快照。
 * @param repository GitHub 仓库和分支。
 * @param prefix 仅包含此前缀下的文件，例如 `world/`。
 * @param extension 允许的文件扩展名。
 * @returns 带 commit 版本和 raw 下载地址的文件快照。
 */
export async function fetchGithubSnapshot(
  repository: GithubRepository,
  prefix: string,
  extension: string
): Promise<GithubSnapshot> {
  const apiRoot = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'WuWaChat'
  }
  const commit = await requestJson<GithubCommitResponse>(
    `${apiRoot}/commits/${encodeURIComponent(repository.branch)}`,
    { headers }
  )
  const version = typeof commit.sha === 'string' ? commit.sha : ''
  const treeSha = typeof commit.commit?.tree?.sha === 'string' ? commit.commit.tree.sha : ''
  if (!version || !treeSha) {
    throw new Error('GitHub commit response is missing sha or tree sha.')
  }

  const tree = await requestJson<GithubTreeResponse>(`${apiRoot}/git/trees/${treeSha}?recursive=1`, {
    headers
  })
  if (tree.truncated === true) {
    throw new Error('GitHub repository tree is truncated and cannot be downloaded safely.')
  }

  const files = (tree.tree ?? [])
    .filter(
      (entry): entry is { path: string; type: 'blob'; size?: number } =>
        entry.type === 'blob' &&
        typeof entry.path === 'string' &&
        entry.path.startsWith(prefix) &&
        entry.path.toLowerCase().endsWith(extension.toLowerCase())
    )
    .map((entry) => {
      const repositoryPath = entry.path
      const relativePath = repositoryPath.slice(prefix.length)
      return {
        path: relativePath,
        url: getGithubRawFileUrl(repository, repositoryPath),
        sizeBytes: typeof entry.size === 'number' ? entry.size : 0
      }
    })
    .filter((file) => file.path.length > 0 && file.sizeBytes >= 0)
    .sort((left, right) => left.path.localeCompare(right.path))

  if (files.length === 0) {
    throw new Error(`No ${extension} files found under ${prefix}.`)
  }

  return { version, files }
}
