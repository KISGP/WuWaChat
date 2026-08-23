export type GithubRepository = {
  owner: string
  name: string
  branch: string
}

export type GithubFile = {
  path: string
  url: string
  sizeBytes: number
}

export type GithubSnapshot = {
  version: string
  files: GithubFile[]
}
