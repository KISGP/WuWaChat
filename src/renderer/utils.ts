import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ModelProfile } from '@shared/chat'
import type { LogEntry } from '@shared/logging'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0
}

export function isPositiveInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value > 0
}

export function connectionFingerprint(profile: ModelProfile): string {
  return [profile.provider, profile.baseUrl.trim(), profile.apiKey.trim()].join('\n')
}

export function isValidUrl(value: string): boolean {
  if (!value.trim()) return false

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * @description 将字节数转换为便于阅读的体积字符串。
 * @param sizeBytes 字节数。
 * @returns 格式化后的体积文案。
 */
export function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
