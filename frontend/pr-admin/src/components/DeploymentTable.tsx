import { Button, Table, Typography } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { DeploymentSummary } from '../api/generated/types.gen';
import { formatDateTime, shortSha } from '../utils/format';
import { DeploymentStatus } from './DeploymentStatus';

export function DeploymentTable({ deployments, loading = false }: {
  deployments: DeploymentSummary[];
  loading?: boolean;
}) {
  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={deployments}
      pagination={deployments.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
      scroll={{ x: 820 }}
      columns={[
        {
          title: '状态',
          dataIndex: 'status',
          width: 110,
          render: (status: DeploymentSummary['status']) => <DeploymentStatus status={status} />,
        },
        {
          title: '项目 / 环境',
          key: 'target',
          width: 180,
          render: (_, item) => (
            <div>
              <Typography.Text strong>{item.projectSlug}</Typography.Text>
              <br />
              <Typography.Text type="secondary" className="text-xs">{item.environmentName}</Typography.Text>
            </div>
          ),
        },
        {
          title: '版本',
          dataIndex: 'resolvedSha',
          width: 130,
          render: (sha: string) => <Typography.Text code>{shortSha(sha)}</Typography.Text>,
        },
        { title: '发起人', dataIndex: 'actorUsername', width: 130 },
        {
          title: '时间',
          dataIndex: 'createdAt',
          width: 180,
          render: formatDateTime,
        },
        {
          title: '',
          key: 'action',
          fixed: 'right',
          width: 56,
          render: (_, item) => (
            <Link to={`/deploy/deployments/${item.id}`} aria-label={`查看 ${item.projectSlug} 发布详情`}>
              <Button type="text" icon={<EyeOutlined />} />
            </Link>
          ),
        },
      ]}
    />
  );
}
