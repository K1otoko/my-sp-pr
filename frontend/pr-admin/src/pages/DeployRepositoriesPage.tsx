import { useMemo } from 'react';
import {
  App, Button, Empty, Table, Typography,
} from 'antd';
import { GithubOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { syncDeployProjects } from '../api/generated/sdk.gen';
import type { DeployProject } from '../api/generated/types.gen';
import { apiClient, requestApi, unwrapResponse } from '../api/client';
import { DeploymentPageHeader } from '../components/DeploymentPageHeader';
import { useAdminSession } from '../hooks/useAdminSession';
import { useApiAction } from '../hooks/useApiAction';
import { useDeployProjects } from '../hooks/useDeployData';
import { formatDateTime, shortSha } from '../utils/format';

type RepositorySummary = {
  id: string;
  fullName: string;
  manifestSha: string;
  manifestVersion: number;
  unitCount: number;
  updatedAt: string;
};

function groupRepositories(projects: DeployProject[]): RepositorySummary[] {
  const repositories = new Map<string, RepositorySummary>();
  for (const project of projects) {
    const current = repositories.get(project.repositoryFullName);
    if (!current) {
      repositories.set(project.repositoryFullName, {
        id: project.id,
        fullName: project.repositoryFullName,
        manifestSha: project.manifestSha,
        manifestVersion: project.manifestVersion,
        unitCount: 1,
        updatedAt: project.updatedAt,
      });
      continue;
    }
    current.unitCount += 1;
    if (project.updatedAt > current.updatedAt) current.updatedAt = project.updatedAt;
  }
  return [...repositories.values()].sort((left, right) => left.fullName.localeCompare(right.fullName));
}

export function DeployRepositoriesPage() {
  const { message } = App.useApp();
  const session = useAdminSession();
  const projects = useDeployProjects();
  const repositories = useMemo(() => groupRepositories(projects.data ?? []), [projects.data]);
  const synchronize = useApiAction(async (signal) => {
    const currentSession = session.session;
    if (!currentSession?.authenticated) return;
    const result = unwrapResponse(await requestApi(
      (active) => syncDeployProjects({
        client: apiClient,
        throwOnError: true,
        signal: active,
        body: { csrfToken: currentSession.csrfToken },
      }),
      signal,
    ));
    await projects.refreshAsync();
    return result;
  }, {
    onSuccess: (result) => {
      if (result) void message.success(`已同步 ${result.synchronized} 个应用`);
    },
    onError: (error) => void message.error(error.message),
  });

  return (
    <div className="space-y-6">
      <DeploymentPageHeader
        title="仓库"
        description="查看受信代码仓库及当前部署清单版本。"
        actions={(
          <Button
            type="primary"
            icon={<ReloadOutlined spin={synchronize.loading} />}
            loading={synchronize.loading}
            onClick={() => synchronize.run()}
          >
            同步清单
          </Button>
        )}
      />
      <div className="surface-panel overflow-hidden">
        <Table
          rowKey="fullName"
          loading={projects.loading}
          dataSource={repositories}
          pagination={false}
          locale={{ emptyText: projects.error
            ? <Empty description={projects.error.message} />
            : <Empty description="尚未同步仓库" /> }}
          scroll={{ x: 760 }}
          columns={[
            {
              title: '仓库',
              dataIndex: 'fullName',
              width: 260,
              render: (fullName: string, item: RepositorySummary) => (
                <div className="flex items-center gap-3">
                  <GithubOutlined className="secondary-text" />
                  <Link to={`/deploy/repositories/${item.id}`} className="font-medium">{fullName}</Link>
                </div>
              ),
            },
            { title: '应用', dataIndex: 'unitCount', width: 90 },
            {
              title: 'Manifest',
              key: 'manifest',
              width: 210,
              render: (_, item: RepositorySummary) => (
                <div>
                  <div>v{item.manifestVersion}</div>
                  <Typography.Text type="secondary" className="font-mono text-xs">
                    {shortSha(item.manifestSha)}
                  </Typography.Text>
                </div>
              ),
            },
            {
              title: '最近同步',
              dataIndex: 'updatedAt',
              width: 180,
              render: formatDateTime,
            },
            {
              title: '',
              key: 'action',
              fixed: 'right',
              width: 56,
              render: (_, item: RepositorySummary) => (
                <Link to={`/deploy/repositories/${item.id}`} aria-label={`打开 ${item.fullName}`}>
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
