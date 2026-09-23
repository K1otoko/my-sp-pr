import { Alert, Empty, Typography } from 'antd';
import { DeploymentTable } from '../components/DeploymentTable';
import { useAllDeployments } from '../hooks/useDeployData';

export function DeploymentsPage() {
  const deployments = useAllDeployments();
  return (
    <div className="space-y-6">
      <section>
        <Typography.Title level={1} className="mb-1! text-2xl!">发布记录</Typography.Title>
        <Typography.Text type="secondary">查看所有项目的构建、发布和回滚状态。</Typography.Text>
      </section>
      {deployments.error && <Alert type="error" showIcon title={deployments.error.message} />}
      <div className="surface-panel overflow-hidden">
        {deployments.data ? (
          <DeploymentTable deployments={deployments.data} loading={deployments.loading} />
        ) : deployments.loading ? (
          <DeploymentTable deployments={[]} loading />
        ) : <Empty description="暂无发布记录" />}
      </div>
    </div>
  );
}
