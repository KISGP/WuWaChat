import { app } from 'electron'
import type { MemoryHardwareInfo } from '../../shared/memory-settings'

function extractGpuName(device: Record<string, unknown>): string {
  const candidateKeys = [
    'deviceName',
    'deviceString',
    'driverVendor',
    'vendorString',
    'vendor'
  ] as const

  for (const key of candidateKeys) {
    const value = device[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  const stringValue = Object.values(device).find(
    (value) => typeof value === 'string' && value.trim().length > 0
  )

  return typeof stringValue === 'string' ? stringValue.trim() : ''
}

/**
 * @description 读取 Electron 提供的 GPU 信息并提取一个可展示的设备名称。
 * @returns 内存设置页使用的硬件信息摘要。
 */
export async function readMemoryHardwareInfo(): Promise<MemoryHardwareInfo> {
  const gpuInfo = await app.getGPUInfo('complete')
  const devices = Array.isArray((gpuInfo as { gpuDevice?: unknown[] }).gpuDevice)
    ? ((gpuInfo as { gpuDevice: Array<Record<string, unknown>> }).gpuDevice ?? [])
    : []
  const gpuName = devices.map(extractGpuName).find((name) => name.length > 0) ?? null

  return { gpuName }
}
