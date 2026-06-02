import { type Dispatch, type SetStateAction, useCallback, useState } from 'react'

interface UseAsyncActionOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
}

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
