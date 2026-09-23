import { useRef } from 'react';
import { useRequest, useUnmount } from 'ahooks';

export function useApiAction<T, P extends unknown[]>(
  service: (signal: AbortSignal, ...parameters: P) => Promise<T>,
  options?: {
    onSuccess?: (data: T, parameters: P) => void;
    onError?: (error: Error, parameters: P) => void;
  },
) {
  const controller = useRef<AbortController | null>(null);
  const request = useRequest(async (...parameters: P) => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    try {
      return await service(active.signal, ...parameters);
    } finally {
      if (controller.current === active) controller.current = null;
    }
  }, {
    manual: true,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
  useUnmount(() => {
    request.cancel();
    controller.current?.abort();
  });
  return request;
}
