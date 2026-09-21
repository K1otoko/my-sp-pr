import { useRef } from 'react';
import { useRequest, useUnmount } from 'ahooks';
import { apiClient, requestApi, unwrapResponse } from '../api/client';
import { getAdminHealth } from '../api/generated/sdk.gen';

export function useHealth() {
  const controller = useRef<AbortController | null>(null);
  const request = useRequest(async () => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    try {
      const payload = await requestApi(
        (signal) => getAdminHealth({ client: apiClient, throwOnError: true, signal }),
        active.signal,
      );
      return unwrapResponse(payload);
    } finally {
      if (controller.current === active) controller.current = null;
    }
  });

  useUnmount(() => {
    request.cancel();
    controller.current?.abort();
  });

  function refresh() {
    request.cancel();
    controller.current?.abort();
    request.run();
  }

  return { data: request.data, loading: request.loading, error: request.error, refresh };
}
