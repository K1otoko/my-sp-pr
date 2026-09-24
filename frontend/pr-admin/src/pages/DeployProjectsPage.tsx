import {
  Button, Empty, Table, Tag, Typography,
} from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { DeployProject } from '../api/generated/types.gen';
import { DeploymentPageHeader } from '../components/DeploymentPageHeader';
import { DeploymentStatus } from '../components/DeploymentStatus';
import { useDeployProjects } from '../hooks/useDeployData';
import { formatDateTime, shortSha } from '../utils/format';

export function DeployProjectsPage() {
  const projects = useDeployProjects();

  return (
    <div className="space-y-6">
      <DeploymentPageHeader title="应用" description="查看可独立构建和发布的应用单元。" />
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
