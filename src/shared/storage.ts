export type StorageCategoryId =
  | 'sessions'
  | 'characters'
  | 'world'
  | 'logs'
  | 'settings'
  | 'cache'
  | 'other'

export type StorageUsageItem = {
  id: StorageCategoryId
  label: string
  sizeBytes: number
  path: string
  description: string
  color: string
}

export type StorageUsageSnapshot = {
  rootPath: string
  totalBytes: number
  scannedAt: string
  items: StorageUsageItem[]
}
