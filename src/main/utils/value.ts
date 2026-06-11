/**
 * @description 返回一个去除前后空格的字符串，如果字符串为空则抛出错误
 * @param value 要检查的值
 * @param label 错误消息中使用的标签
 * @returns 如果值有效，则返回去除前后空格后的字符串
 * @throws 如果值不存在或为空字符串，则抛出错误
 */
export function requireValue(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }

  return trimmed
}
