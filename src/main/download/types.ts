export type DownloadFile = {
  path: string
  url: string
  sizeBytes?: number
}

export type DownloadProgress = {
  completed: number
  total: number
  currentPath: string
}

export type DownloadOptions = {
  timeoutMs?: number
  maxFileBytes?: number
  onProgress?: (progress: DownloadProgress) => void
}
