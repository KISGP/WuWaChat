import { requestJson } from '../http-client'
import type { GithubRepository, GithubSnapshot } from './types'
import { getAppSettings } from '@main/settings/app-settings'
import { GITHUB_PROXY_OPTIONS } from '@shared/app-settings'

export type GithubRequestContext = {
  proxyBaseUrl: string | null
  sourceId: string | null
}

/**
 * @description 根据当前应用设置创建一次 GitHub 请求所使用的来源上下文。
 * @returns 固定本次操作使用的 GitHub 代理来源。
 */
export async function createGithubRequestContext(): Promise<GithubRequestContext> {
  const settings = await getAppSettings()
  if (!settings.githubProxy.enabled) return { proxyBaseUrl: null, sourceId: null }
  const option = GITHUB_PROXY_OPTIONS.find(
    (candidate) => candidate.id === settings.githubProxy.selectedOptionId
  )
  const selected = option ?? GITHUB_PROXY_OPTIONS[0]
  return { proxyBaseUrl: selected.baseUrl, sourceId: selected.id }
}

/**
 * @description 将 GitHub API 或 raw 地址映射到指定的代理来源。
 * @param url 原始 GitHub 地址。
 * @param context 本次请求使用的 GitHub 来源上下文。
 * @returns 代理地址或原始地址。
 */
export function resolveGithubUrl(url: string, context?: GithubRequestContext): string {
  if (!context?.proxyBaseUrl) return url
  const parsed = new URL(url)
  if (parsed.hostname !== 'api.github.com' && parsed.hostname !== 'raw.githubusercontent.com') {
    return url
  }
  return context.proxyBaseUrl + '/' + url
}

/**
 * @description 构造 GitHub 仓库文件的 raw 下载地址。
 * @param repository GitHub 仓库和分支。
 * @param filePath 仓库内文件路径。
 * @param context 本次操作固定使用的 GitHub 来源。
 * @returns 文件 raw 下载地址。
 */
export function getGithubRawFileUrl(
  repository: GithubRepository,
  filePath: string,
  context?: GithubRequestContext
): string {
  const path = filePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return resolveGithubUrl(
    'https://raw.githubusercontent.com/' +
      encodeURIComponent(repository.owner) +
      '/' +
      encodeURIComponent(repository.name) +
      '/' +
      encodeURIComponent(repository.branch) +
      '/' +
      path,
    context
  )
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
 * @param context 本次操作固定使用的 GitHub 来源。
 * @returns 带 commit 版本和 raw 下载地址的文件快照。
 */
export async function fetchGithubSnapshot(
  repository: GithubRepository,
  prefix: string,
  extension: string,
  context?: GithubRequestContext
): Promise<GithubSnapshot> {
  const apiRoot = resolveGithubUrl(
    `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`,
    context
  )
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

  const tree = await requestJson<GithubTreeResponse>(
    `${apiRoot}/git/trees/${treeSha}?recursive=1`,
    {
      headers
    }
  )
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
        url: getGithubRawFileUrl(repository, repositoryPath, context),
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
