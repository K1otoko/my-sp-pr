import { Alert, Empty } from 'antd';
import { DeploymentPageHeader } from '../components/DeploymentPageHeader';
import { DeploymentTable } from '../components/DeploymentTable';
import { useAllDeployments } from '../hooks/useDeployData';

export function DeployReleasesPage() {
  const deployments = useAllDeployments();

  return (
    <div className="space-y-6">
      <DeploymentPageHeader
        title="发布中心"
        description="查看现有应用的构建、发布和回滚记录。"
      />
      {deployments.error && <Alert type="error" showIcon title={deployments.error.message} />}
      <div className="surface-panel overflow-hidden">
        {deployments.data || deployments.loading ? (
          <DeploymentTable deployments={deployments.data ?? []} loading={deployments.loading} />
        ) : (
          <div className="grid min-h-64 place-items-center">
            <Empty description="暂无发布记录" />
          </div>
        )}
      </div>
    </div>
  );
}
