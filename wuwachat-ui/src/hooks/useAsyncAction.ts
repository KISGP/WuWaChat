import { useState, useCallback } from "react";
import { toast } from "react-toastify";

interface UseAsyncActionOptions<T> {
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    successMessage?: string | ((data: T) => string);
    errorMessage?: string | ((error: Error) => string);
}

export function useAsyncAction<T, Args extends any[]>(
    action: (...args: Args) => Promise<T>,
    options?: UseAsyncActionOptions<T>
) {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const run = useCallback(
        async (...args: Args) => {
            setIsLoading(true);
            setStatus("loading");
            setError(null);
            setData(null);

            try {
                const result = await action(...args);
                setData(result);
                setStatus("success");

                if (options?.successMessage) {
                    toast.success(typeof options.successMessage === 'function' ? options.successMessage(result) : options.successMessage);
                }

                options?.onSuccess?.(result);

                return result;
            } catch (err) {
                const e = err instanceof Error ? err : new Error(String(err));
                setError(e);
                setStatus("error");

                if (options?.errorMessage) {
                    toast.error(typeof options.errorMessage === 'function' ? options.errorMessage(e) : options.errorMessage);
                }

                options?.onError?.(e);
            } finally {
                setIsLoading(false);
            }
        },
        [action, options]
    );

    return { loading: isLoading, status, data, error, run, setStatus };
}
