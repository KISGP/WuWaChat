const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RESPONSE_BYTES = 20 * 1024 * 1024

/**
 * @description 使用超时和大小限制请求远端响应。
 * @param url 请求地址。
 * @param options 请求选项。
 * @returns 远端响应对象。
 * @remarks 响应体大小超过限制或请求超时会抛出错误。
 */
export async function request(
  url: string,
  options?: {
    timeoutMs?: number
    maxResponseBytes?: number
    headers?: Record<string, string>
    allowNotModified?: boolean
  }
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: options?.headers
    })
    if (!response.ok && !(options?.allowNotModified && response.status === 304)) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    const maxResponseBytes = options?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    if (contentLength && Number(contentLength) > maxResponseBytes) {
      throw new Error(`Response from ${url} exceeds the ${maxResponseBytes} byte limit.`)
    }

    return response
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * @description 请求并解析 JSON 响应。
 * @param url 请求地址。
 * @param options 请求选项。
 * @returns 解析后的 JSON 数据。
 */
export async function requestJson<T>(
  url: string,
  options?: Parameters<typeof request>[1]
): Promise<T> {
  const response = await request(url, options)
  return (await response.json()) as T
}
