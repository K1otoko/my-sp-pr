import {
  Alert, Empty, Spin, Typography,
} from 'antd';
import {
  AppstoreOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { DeploymentPageHeader } from '../components/DeploymentPageHeader';
import { DeploymentTable } from '../components/DeploymentTable';
import { useAllDeployments, useDeployProjects } from '../hooks/useDeployData';

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="deployment-metric min-w-0 px-5 py-4">
      <div className="secondary-text mb-2 flex items-center gap-2 text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <Typography.Text strong className="text-2xl!">{value}</Typography.Text>
    </div>
  );
}

export function DeployOverviewPage() {
  const projects = useDeployProjects();
  const deployments = useAllDeployments();
  const records = deployments.data ?? [];
  const active = records.filter((item) => ['requested', 'queued', 'in_progress'].includes(item.status)).length;
  const succeeded = records.filter((item) => item.status === 'succeeded').length;
  const failed = records.filter((item) => item.status === 'failed' || item.status === 'error').length;

  return (
    <div className="space-y-6">
      <DeploymentPageHeader
        title="部署概览"
        description="生产应用与发布活动的实时摘要。"
      />
      {(projects.error || deployments.error) && (
        <Alert
          type="error"
          showIcon
          title="部分部署数据加载失败"
          description={projects.error?.message ?? deployments.error?.message}
        />
      )}
      <section className="surface-panel overflow-hidden" aria-label="部署状态摘要">
        {projects.loading && deployments.loading && !projects.data && !deployments.data ? (
          <div className="grid min-h-32 place-items-center"><Spin /></div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<AppstoreOutlined />} label="应用" value={projects.data?.length ?? 0} />
            <Metric icon={<ClockCircleOutlined />} label="进行中" value={active} />
            <Metric icon={<CheckCircleOutlined />} label="近期成功" value={succeeded} />
            <Metric icon={<WarningOutlined />} label="近期异常" value={failed} />
          </div>
        )}
      </section>
      <section aria-labelledby="recent-deployments-title">
        <div className="mb-3">
          <Typography.Title id="recent-deployments-title" level={2} className="mb-0! text-base!">
            最近发布
          </Typography.Title>
        </div>
        <div className="surface-panel overflow-hidden">
          {records.length || deployments.loading ? (
            <DeploymentTable deployments={records.slice(0, 10)} loading={deployments.loading} />
          ) : (
            <div className="grid min-h-64 place-items-center">
              <Empty description="暂无发布记录" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
