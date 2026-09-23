import { createClient } from './generated/client';
import type { ErrorResponse } from './generated/types.gen';

export const apiClient = createClient({ baseUrl: '/api', parseAs: 'json', credentials: 'same-origin' });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRequestError(error: unknown, response?: Response): Error {
  if (isRecord(error) && isRecord(error.error) && typeof error.error.message === 'string') {
    return new Error(error.error.message);
  }
  if (error instanceof SyntaxError) return new Error('服务返回了无效的 JSON 数据');
  if (error instanceof TypeError) return new Error('无法连接服务，请检查网络或后端是否已启动');
  if (error instanceof Error) return error;
  return new Error(response ? `请求失败（HTTP ${response.status}）` : '请求失败，请稍后重试');
}

apiClient.interceptors.response.use((response) => {
  const contentType = response.headers.get('content-type') ?? '';
  if (response.status !== 204 && !/\bapplication\/(?:[\w.+-]+\+)?json\b/iu.test(contentType)) {
    throw new Error(`服务返回了非 JSON 响应（HTTP ${response.status}）`);
  }
  return response;
});
apiClient.interceptors.error.use((error, response) => toRequestError(error, response));

// 超时覆盖响应体读取阶段；调用方仍可通过 signal 主动取消请求。
export async function requestApi<T>(
  request: (signal: AbortSignal) => Promise<{ data: T }>,
  signal: AbortSignal,
): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 10_000);
  try {
    const result = await request(AbortSignal.any([signal, timeout.signal]));
    return result.data;
  } catch (error) {
    if (timeout.signal.aborted && !signal.aborted) throw new Error('请求超时，请重试');
    throw toRequestError(error);
  } finally {
    clearTimeout(timer);
  }
}

export function unwrapResponse<T>(payload: { success: true; data: T } | ErrorResponse): T {
  if (!isRecord(payload) || !('success' in payload)) throw new Error('服务响应格式不正确');
  if (!payload.success) throw toRequestError(payload);
  if (!('data' in payload)) throw new Error('服务响应缺少数据');
  return payload.data;
}
