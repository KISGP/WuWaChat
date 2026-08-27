/**
 * @description 读取本地应用存储用量。
 * @returns 本地应用数据占用信息的 Promise。
 */
export function getUsage(): ReturnType<typeof window.storage.getUsage> {
  return window.storage.getUsage()
}
