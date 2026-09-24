import {
  Alert, Button, Empty, Table, Tag, Typography,
} from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { DeploymentPageHeader } from '../components/DeploymentPageHeader';
import { useDeployTargetSummaries, type DeployTargetSummary } from '../hooks/useDeployData';

export function DeployTargetsPage() {
  const targets = useDeployTargetSummaries();

  return (
    <div className="space-y-6">
      <DeploymentPageHeader
        title="目标主机"
        description="当前由发布环境聚合的 Runner 目标与应用绑定。"
      />
      <Alert
        type="info"
        showIcon
        title="主机 Agent 尚未接入，当前仅展示已有 Runner target 配置。"
      />
      <div className="surface-panel overflow-hidden">
        <Table
          rowKey="key"
          loading={targets.loading}
          dataSource={targets.data}
          pagination={false}
          locale={{ emptyText: targets.error
            ? <Empty description={targets.error.message} />
            : <Empty description="暂无目标主机" /> }}
          scroll={{ x: 720 }}
          columns={[
            {
              title: 'Runner target',
              dataIndex: 'key',
              width: 220,
              render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
            },
            {
              title: '应用',
              key: 'projects',
              render: (_, item: DeployTargetSummary) => item.bindings.map((binding) => (
                <Tag key={`${binding.projectId}:${binding.environmentId}`}>{binding.projectName}</Tag>
              )),
            },
            {
              title: '类型',
              key: 'kinds',
              width: 150,
              render: (_, item: DeployTargetSummary) => item.projectKinds.map((kind) => (
                <Tag key={kind}>{kind === 'frontend' ? '前端' : '服务'}</Tag>
              )),
            },
            {
              title: '环境',
              key: 'environments',
              width: 180,
              render: (_, item: DeployTargetSummary) => item.environmentNames.map((environment) => (
                <Tag color={item.production ? 'red' : undefined} key={environment}>{environment}</Tag>
              )),
            },
            {
              title: '',
              key: 'action',
              fixed: 'right',
              width: 56,
              render: (_, item: DeployTargetSummary) => (
                <Link to={`/deploy/targets/${encodeURIComponent(item.key)}`} aria-label={`打开 ${item.key}`}>
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
