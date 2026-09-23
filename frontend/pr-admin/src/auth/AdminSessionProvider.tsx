import { useRef, type PropsWithChildren } from 'react';
import { useRequest, useUnmount } from 'ahooks';
import { getAdminAuthSession, startAdminAuthLogout } from '../api/generated/sdk.gen';
import { apiClient, requestApi, unwrapResponse } from '../api/client';
import { SessionContext } from './admin-session-context';

export function AdminSessionProvider({ children }: PropsWithChildren) {
  const controller = useRef<AbortController | null>(null);
  const logoutController = useRef<AbortController | null>(null);
  const sessionRequest = useRequest(async () => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    try {
      return unwrapResponse(await requestApi(
        (signal) => getAdminAuthSession({ client: apiClient, throwOnError: true, signal }),
        active.signal,
      ));
    } finally {
      if (controller.current === active) controller.current = null;
    }
  });
  const logoutRequest = useRequest(async () => {
    const session = sessionRequest.data;
    if (!session?.authenticated) return;
    const active = new AbortController();
    logoutController.current?.abort();
    logoutController.current = active;
    try {
      const data = unwrapResponse(await requestApi(
        (signal) => startAdminAuthLogout({
          client: apiClient,
          throwOnError: true,
          signal,
          body: { csrfToken: session.csrfToken },
        }),
        active.signal,
      ));
      window.location.assign(data.resumeUrl);
    } finally {
      if (logoutController.current === active) logoutController.current = null;
    }
  }, { manual: true });

  useUnmount(() => {
    controller.current?.abort();
    logoutController.current?.abort();
  });

  return (
    <SessionContext.Provider value={{
      session: sessionRequest.data,
      loading: sessionRequest.loading,
      error: sessionRequest.error,
      refresh: () => sessionRequest.refresh(),
      login: (returnTo = `${window.location.pathname}${window.location.search}`) => {
        window.location.assign(`/api/admin/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
      },
      logout: logoutRequest.runAsync,
      logoutLoading: logoutRequest.loading,
    }}
    >
      {children}
    </SessionContext.Provider>
  );
}
