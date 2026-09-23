export function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
}

export function shortSha(value: string) {
  return value.slice(0, 12);
}
