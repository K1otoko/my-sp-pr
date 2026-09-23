import { useEffect, useRef } from 'react';
import { useRequest, useUnmount } from 'ahooks';
import {
  getDeployEnvironmentConfiguration,
  getDeployment,
  getDeployProject,
  listDeployEnvironments,
  listDeployments,
  listDeployProjects,
  listDeployRefs,
} from '../api/generated/sdk.gen';
import { apiClient, requestApi, unwrapResponse } from '../api/client';

function useAbortable<T>(loader: (signal: AbortSignal) => Promise<T>, refreshDeps: unknown[] = []) {
  const controller = useRef<AbortController | null>(null);
  const request = useRequest(async () => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    try {
      return await loader(active.signal);
    } finally {
      if (controller.current === active) controller.current = null;
    }
  }, { refreshDeps });
  useUnmount(() => controller.current?.abort());
  return request;
}

export function useDeployProjects() {
  return useAbortable(async (signal) => unwrapResponse(await requestApi(
    (active) => listDeployProjects({ client: apiClient, throwOnError: true, signal: active }),
    signal,
  )));
}

export function useAllDeployments() {
  return useAbortable(async (signal) => unwrapResponse(await requestApi(
    (active) => listDeployments({
      client: apiClient, throwOnError: true, signal: active, query: { limit: 100 },
    }),
    signal,
  )));
}

export function useProjectWorkspace(projectId: string) {
  return useAbortable(async (signal) => {
    const [project, environments, deployments] = await Promise.all([
      requestApi(
        (active) => getDeployProject({
          client: apiClient, throwOnError: true, signal: active, path: { projectId },
        }),
        signal,
      ),
      requestApi(
        (active) => listDeployEnvironments({
          client: apiClient, throwOnError: true, signal: active, path: { projectId },
        }),
        signal,
      ),
      requestApi(
        (active) => listDeployments({
          client: apiClient, throwOnError: true, signal: active, query: { projectId, limit: 50 },
        }),
        signal,
      ),
    ]);
    return {
      project: unwrapResponse(project),
      environments: unwrapResponse(environments),
      deployments: unwrapResponse(deployments),
    };
  }, [projectId]);
}

export function useEnvironmentWorkspace(projectId: string, environmentId: string) {
  return useAbortable(async (signal) => {
    const [project, environments, configuration, refs, deployments] = await Promise.all([
      requestApi(
        (active) => getDeployProject({
          client: apiClient, throwOnError: true, signal: active, path: { projectId },
        }),
        signal,
      ),
      requestApi(
        (active) => listDeployEnvironments({
          client: apiClient, throwOnError: true, signal: active, path: { projectId },
        }),
        signal,
      ),
      requestApi(
        (active) => getDeployEnvironmentConfiguration({
          client: apiClient, throwOnError: true, signal: active, path: { environmentId },
        }),
        signal,
      ),
      requestApi(
        (active) => listDeployRefs({
          client: apiClient, throwOnError: true, signal: active, path: { projectId },
        }),
        signal,
      ),
      requestApi(
        (active) => listDeployments({
          client: apiClient, throwOnError: true, signal: active, query: { environmentId, limit: 50 },
        }),
        signal,
      ),
    ]);
    return {
      project: unwrapResponse(project),
      environment: unwrapResponse(environments).find((item) => item.id === environmentId),
      configuration: unwrapResponse(configuration),
      refs: unwrapResponse(refs),
      deployments: unwrapResponse(deployments),
    };
  }, [projectId, environmentId]);
}

export function useDeploymentDetail(deploymentId: string) {
  const request = useAbortable(async (signal) => unwrapResponse(await requestApi(
    (active) => getDeployment({
      client: apiClient, throwOnError: true, signal: active, path: { deploymentId },
    }),
    signal,
  )), [deploymentId]);
  useEffect(() => {
    if (!request.data || ['succeeded', 'failed', 'error', 'inactive'].includes(request.data.status)) return;
    const timer = window.setTimeout(request.refresh, 3000);
    return () => window.clearTimeout(timer);
  }, [request.data, request.refresh]);
  return request;
}
