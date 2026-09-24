import {
  Alert, Breadcrumb, Button, Descriptions, Empty, Result, Table, Tag, Typography,
} from 'antd';
import { Link, useParams } from 'react-router-dom';
import type { DeployTargetBinding } from '../hooks/useDeployData';
import { DeploymentPageHeader } from '../components/DeploymentPageHeader';
import { useDeployTargetSummaries } from '../hooks/useDeployData';

export function DeployTargetDetailPage() {
  const { targetKey = '' } = useParams();
  const targets = useDeployTargetSummaries();
  const target = targets.data?.find((item) => item.key === targetKey);

  if (targets.error) {
    return <Result status="error" title="无法读取目标主机" subTitle={targets.error.message} />;
  }
  if (!targets.loading && !target) {
    return <Result status="404" title="目标主机不存在" extra={<Button href="/deploy/targets">返回目标主机</Button>} />;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { title: <Link to="/deploy/targets">目标主机</Link> },
        { title: target?.key ?? '主机详情' },
      ]}
      />
      <DeploymentPageHeader
        title={target?.key ?? '主机详情'}
        description="现有发布环境中的 Runner 目标绑定。"
      />
      <Alert
        type="info"
        showIcon
        title="Agent 尚未接入，资源、进程和版本状态暂不可用。"
      />
      {target && (
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { key: 'runner', label: 'Runner target', children: <Typography.Text code>{target.key}</Typography.Text> },
            {
              key: 'kind',
              label: '应用类型',
              children: target.projectKinds.map((kind) => (
                <Tag key={kind}>{kind === 'frontend' ? '前端' : '服务'}</Tag>
              )),
            },
            {
              key: 'environment',
              label: '环境',
              children: target.environmentNames.map((environment) => <Tag key={environment}>{environment}</Tag>),
            },
          ]}
        />
      )}
      <section aria-labelledby="target-bindings-title">
        <Typography.Title id="target-bindings-title" level={2} className="text-base!">应用绑定</Typography.Title>
        <div className="surface-panel overflow-hidden">
          <Table
            rowKey={(item) => `${item.projectId}:${item.environmentId}`}
            loading={targets.loading}
            dataSource={target?.bindings}
            pagination={false}
            locale={{ emptyText: <Empty description="暂无应用绑定" /> }}
            columns={[
              {
                title: '应用',
                dataIndex: 'projectName',
                render: (name: string, item: DeployTargetBinding) => (
                  <Link to={`/deploy/projects/${item.projectId}`} className="font-medium">{name}</Link>
                ),
              },
              {
                title: '类型',
                dataIndex: 'projectKind',
                width: 120,
                render: (kind: DeployTargetBinding['projectKind']) => <Tag>{kind === 'frontend' ? '前端' : '服务'}</Tag>,
              },
              {
                title: '环境',
                dataIndex: 'environmentName',
                width: 160,
                render: (name: string, item: DeployTargetBinding) => (
                  <Link to={`/deploy/projects/${item.projectId}/environments/${item.environmentId}`}>{name}</Link>
                ),
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
