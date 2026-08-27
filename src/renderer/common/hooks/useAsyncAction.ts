import { type Dispatch, type SetStateAction, useCallback, useState } from 'react'

interface UseAsyncActionOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
}

/**
 * @description 将异步操作封装为可复用的 React 状态，并跟踪加载、成功、失败和结果数据。
 * @param action 要执行的异步操作；调用参数会原样传递给该函数。
 * @param options 可选的成功和失败回调。
 * @returns 包含当前异步状态、结果、错误和执行方法的对象。
 * @remarks 异步操作失败时会先更新错误状态，再将规范化后的 Error 重新抛出给调用方。
 */
export function useAsyncAction<T, Args extends unknown[]>(
  action: (...args: Args) => Promise<T>,
  options?: UseAsyncActionOptions<T>
): {
  loading: boolean
  status: 'idle' | 'loading' | 'success' | 'error'
  data: T | null
  error: Error | null
  run: (...args: Args) => Promise<T>
  setStatus: Dispatch<SetStateAction<'idle' | 'loading' | 'success' | 'error'>>
} {
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const run = useCallback(
    async (...args: Args) => {
      setIsLoading(true)
      setStatus('loading')
      setError(null)
      setData(null)

      try {
        const result = await action(...args)
        setData(result)
        setStatus('success')

        options?.onSuccess?.(result)

        return result
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        setStatus('error')

        options?.onError?.(e)
        throw e
      } finally {
        setIsLoading(false)
      }
    },
    [action, options]
  )

  return { loading: isLoading, status, data, error, run, setStatus }
}
