import { App, Button, Empty, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { syncDeployProjects } from '../api/generated/sdk.gen';
import type { DeployProject } from '../api/generated/types.gen';
import { apiClient, requestApi, unwrapResponse } from '../api/client';
import { DeploymentStatus } from '../components/DeploymentStatus';
import { useAdminSession } from '../hooks/useAdminSession';
import { useApiAction } from '../hooks/useApiAction';
import { useDeployProjects } from '../hooks/useDeployData';
import { formatDateTime, shortSha } from '../utils/format';

export function DeployProjectsPage() {
  const { message } = App.useApp();
  const session = useAdminSession();
  const projects = useDeployProjects();
  const synchronize = useApiAction(async (signal) => {
    if (!session.session?.authenticated) return;
    const result = unwrapResponse(await requestApi(
      (active) => syncDeployProjects({
        client: apiClient,
        throwOnError: true,
        signal: active,
        body: { csrfToken: session.session!.authenticated ? session.session!.csrfToken : '' },
      }),
      signal,
    ));
    await projects.refreshAsync();
    return result;
  }, {
    onSuccess: (result) => {
      if (result) void message.success(`已同步 ${result.synchronized} 个发布项目`);
    },
    onError: (error) => void message.error(error.message),
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography.Title level={1} className="mb-1! text-2xl!">发布项目</Typography.Title>
          <Typography.Text type="secondary">每个 unit 独立构建、发布和回滚。</Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<ReloadOutlined spin={synchronize.loading} />}
          loading={synchronize.loading}
          onClick={() => synchronize.run()}
        >
          同步清单
        </Button>
      </section>
      <div className="surface-panel overflow-hidden">
        <Table
          rowKey="id"
          loading={projects.loading}
          dataSource={projects.data}
          locale={{ emptyText: projects.error
            ? <Empty description={projects.error.message} />
            : <Empty description="尚未同步发布项目" /> }}
          pagination={false}
          scroll={{ x: 900 }}
          columns={[
            {
              title: '项目',
              key: 'project',
              width: 210,
              render: (_, item: DeployProject) => (
                <div>
                  <Link to={`/deploy/projects/${item.id}`} className="font-medium">{item.name}</Link>
                  <div><Typography.Text type="secondary" className="font-mono text-xs">{item.unitId}</Typography.Text></div>
                </div>
              ),
            },
            {
              title: '类型',
              dataIndex: 'kind',
              width: 100,
              render: (kind: DeployProject['kind']) => <Tag>{kind === 'frontend' ? '前端' : '服务'}</Tag>,
            },
            {
              title: '仓库 / 默认 ref',
              key: 'source',
              width: 230,
              render: (_, item: DeployProject) => (
                <div>
                  <div>{item.repositoryFullName}</div>
                  <Typography.Text code className="text-xs">{item.defaultRef}</Typography.Text>
                </div>
              ),
            },
            { title: '环境', dataIndex: 'environmentCount', width: 80 },
            {
              title: '最近发布',
              key: 'latest',
              width: 180,
              render: (_, item: DeployProject) => item.latestDeployment ? (
                <div className="space-y-1">
                  <DeploymentStatus status={item.latestDeployment.status} />
                  <div className="font-mono text-xs">{shortSha(item.latestDeployment.resolvedSha)}</div>
                </div>
              ) : <Typography.Text type="secondary">暂无</Typography.Text>,
            },
            {
              title: '清单更新',
              dataIndex: 'updatedAt',
              width: 180,
              render: formatDateTime,
            },
            {
              title: '',
              key: 'action',
              fixed: 'right',
              width: 56,
              render: (_, item: DeployProject) => (
                <Link to={`/deploy/projects/${item.id}`} aria-label={`打开 ${item.name}`}>
                  <Button type="text" icon={<RightOutlined />} />
                </Link>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
