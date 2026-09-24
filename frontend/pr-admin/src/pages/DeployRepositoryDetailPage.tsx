import {
  Alert, Breadcrumb, Button, Descriptions, Empty, Result, Table, Tag, Typography,
} from 'antd';
import { GithubOutlined, RightOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import type { DeployProject } from '../api/generated/types.gen';
import { DeploymentPageHeader } from '../components/DeploymentPageHeader';
import { useDeployProjects } from '../hooks/useDeployData';
import { formatDateTime, shortSha } from '../utils/format';

export function DeployRepositoryDetailPage() {
  const { repositoryId = '' } = useParams();
  const projects = useDeployProjects();
  const selected = projects.data?.find((item) => item.id === repositoryId);
  const units = selected
    ? projects.data?.filter((item) => item.repositoryFullName === selected.repositoryFullName) ?? []
    : [];

  if (projects.error) {
    return <Result status="error" title="无法读取仓库详情" subTitle={projects.error.message} />;
  }
  if (!projects.loading && !selected) {
    return <Result status="404" title="仓库不存在" extra={<Button href="/deploy/repositories">返回仓库列表</Button>} />;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { title: <Link to="/deploy/repositories">仓库</Link> },
        { title: selected?.repositoryFullName ?? '仓库详情' },
      ]}
      />
      <DeploymentPageHeader
        title={selected?.repositoryFullName ?? '仓库详情'}
        description="当前仓库的部署清单与应用目录。"
        actions={selected ? (
          <Button
            href={`https://github.com/${selected.repositoryFullName}`}
            target="_blank"
            icon={<GithubOutlined />}
          >
            GitHub
          </Button>
        ) : undefined}
      />
      {selected && (
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={[
            { key: 'repository', label: '仓库', children: selected.repositoryFullName },
            { key: 'ref', label: '默认 ref', children: <Typography.Text code>{selected.defaultRef}</Typography.Text> },
            {
              key: 'manifest',
              label: 'Manifest',
              children: <Typography.Text code>v{selected.manifestVersion} / {shortSha(selected.manifestSha)}</Typography.Text>,
            },
            { key: 'updated', label: '最近同步', children: formatDateTime(selected.updatedAt) },
          ]}
        />
      )}
      <section aria-labelledby="repository-units-title">
        <Typography.Title id="repository-units-title" level={2} className="text-base!">应用目录</Typography.Title>
        <div className="surface-panel overflow-hidden">
          <Table
            rowKey="id"
            loading={projects.loading}
            dataSource={units}
            pagination={false}
            locale={{ emptyText: <Empty description="暂无应用" /> }}
            scroll={{ x: 720 }}
            columns={[
              {
                title: '应用',
                key: 'unit',
                width: 240,
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
                title: '构建预设',
                dataIndex: 'preset',
                width: 220,
                render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
              },
              { title: '环境', dataIndex: 'environmentCount', width: 90 },
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
      </section>
      {!projects.loading && selected && selected.defaultRef === 'main' && (
        <Alert
          type="warning"
          showIcon
          title="当前清单默认 ref 为 main，请在发布前确认远端默认分支。"
        />
      )}
    </div>
  );
}
