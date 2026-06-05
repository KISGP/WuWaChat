/**
 * @description 获取当前时间的 ISO 字符串。
 * @returns 当前时间，格式为 ISO 8601 字符串。
 */
export function now(): string {
  return new Date().toISOString()
}
