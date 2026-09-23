import { useRef } from 'react';
import { useLatest, useRequest, useUnmount } from 'ahooks';
import { apiClient, requestApi, unwrapResponse } from '../api/client';
import { getAuthInteraction, getAuthLogoutContext, getAuthSession, startAuthLogout, submitAuthLogin } from '../api/generated/sdk.gen';

function useAuthQuery<T>(load: (signal: AbortSignal) => Promise<T>, dependencies: string[] = []) {
  const latest = useLatest(load);
  const controller = useRef<AbortController | null>(null);
  const request = useRequest(async () => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    try { return await latest.current(active.signal); }
    finally { if (controller.current === active) controller.current = null; }
  }, { refreshDeps: dependencies });
  useUnmount(() => { request.cancel(); controller.current?.abort(); });
  return {
    data: request.data, loading: request.loading, error: request.error,
    refresh() { request.cancel(); controller.current?.abort(); request.run(); },
  };
}

function useAuthAction<Input, Output>(submit: (input: Input, signal: AbortSignal) => Promise<Output>) {
  const latest = useLatest(submit);
  const controller = useRef<AbortController | null>(null);
  const request = useRequest(async (input: Input) => {
    // 提交不替换已在途的请求，也不自动重试密码。
    if (controller.current) return undefined;
    const active = new AbortController();
    controller.current = active;
    try {
      const value = await latest.current(input, active.signal);
      return active.signal.aborted ? undefined : value;
    } finally { if (controller.current === active) controller.current = null; }
  }, { manual: true });
  useUnmount(() => { request.cancel(); controller.current?.abort(); });
  return { submit: request.runAsync, loading: request.loading, error: request.error };
}

export function useInteraction(uid: string) {
  return useAuthQuery(async (signal) => unwrapResponse(await requestApi(
    (active) => getAuthInteraction({ client: apiClient, path: { uid }, signal: active, throwOnError: true }), signal,
  )), [uid]);
}
export function useSession() {
  return useAuthQuery(async (signal) => unwrapResponse(await requestApi(
    (active) => getAuthSession({ client: apiClient, signal: active, throwOnError: true }), signal,
  )));
}
export function useLogoutContext(id: string) {
  return useAuthQuery(async (signal) => unwrapResponse(await requestApi(
    (active) => getAuthLogoutContext({ client: apiClient, path: { id }, signal: active, throwOnError: true }), signal,
  )), [id]);
}
export function useLogin(uid: string) {
  return useAuthAction(async (body: { username: string; password: string; csrfToken: string }, signal) => unwrapResponse(await requestApi(
    (active) => submitAuthLogin({ client: apiClient, path: { uid }, body, signal: active, throwOnError: true }), signal,
  )));
}
export function useStartLogout() {
  return useAuthAction(async (csrfToken: string, signal) => unwrapResponse(await requestApi(
    (active) => startAuthLogout({ client: apiClient, body: { csrfToken }, signal: active, throwOnError: true }), signal,
  )));
}
