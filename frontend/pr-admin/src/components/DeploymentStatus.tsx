import { Badge, Tag } from 'antd';
import type { DeploymentStatus as Status } from '../api/generated/types.gen';

const labels: Record<Status, string> = {
  requested: '已请求',
  queued: '排队中',
  in_progress: '发布中',
  succeeded: '成功',
  failed: '失败',
  error: '异常',
  inactive: '已替代',
};

const colors: Record<Status, string> = {
  requested: 'default',
  queued: 'processing',
  in_progress: 'processing',
  succeeded: 'success',
  failed: 'error',
  error: 'error',
  inactive: 'default',
};

export function DeploymentStatus({ status, badge = false }: { status: Status; badge?: boolean }) {
  if (badge) {
    const badgeStatus = status === 'succeeded' ? 'success'
      : status === 'failed' || status === 'error' ? 'error'
        : status === 'queued' || status === 'in_progress' ? 'processing' : 'default';
    return <Badge status={badgeStatus} text={labels[status]} />;
  }
  return <Tag color={colors[status]}>{labels[status]}</Tag>;
}
