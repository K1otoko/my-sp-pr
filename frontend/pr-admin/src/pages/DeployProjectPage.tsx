import { useState } from 'react';
import {
  App, Breadcrumb, Button, Descriptions, Empty, Form, Input, Modal, Switch, Table, Tag, Typography,
} from 'antd';
import { PlusOutlined, RightOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { createDeployEnvironment } from '../api/generated/sdk.gen';
import type { DeployEnvironment } from '../api/generated/types.gen';
import { apiClient, requestApi, unwrapResponse } from '../api/client';
import { DeploymentTable } from '../components/DeploymentTable';
import { useAdminSession } from '../hooks/useAdminSession';
import { useApiAction } from '../hooks/useApiAction';
import { useProjectWorkspace } from '../hooks/useDeployData';

type EnvironmentForm = {
  name: string;
  githubEnvironmentName: string;
  runnerTarget: string;
  publicOrigin?: string;
  healthUrl: string;
  allowedBranches: string;
  allowedTagPattern?: string;
  production: boolean;
  migrationsAllowed: boolean;
};

export function DeployProjectPage() {
  const { projectId = '' } = useParams();
  const workspace = useProjectWorkspace(projectId);
  const session = useAdminSession();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<EnvironmentForm>();
  const createEnvironment = useApiAction(async (activeSignal, values: EnvironmentForm) => {
    if (!session.session?.authenticated) return;
    return unwrapResponse(await requestApi(
      (signal) => createDeployEnvironment({
        client: apiClient,
        throwOnError: true,
        signal,
        path: { projectId },
        body: {
          csrfToken: session.session!.authenticated ? session.session!.csrfToken : '',
          name: values.name,
          githubEnvironmentName: values.githubEnvironmentName,
          runnerTarget: values.runnerTarget,
          publicOrigin: values.publicOrigin || null,
          healthUrl: values.healthUrl,
          allowedBranches: values.allowedBranches.split(',').map((value) => value.trim()).filter(Boolean),
          allowedTagPattern: values.allowedTagPattern || null,
          production: values.production,
          migrationsAllowed: values.migrationsAllowed,
        },
      }),
      activeSignal,
    ));
  }, {
    onSuccess: async (environment) => {
      if (!environment) return;
      setOpen(false);
      form.resetFields();
      await workspace.refreshAsync();
      void message.success(`环境 ${environment.name} 已创建`);
    },
    onError: (error) => void message.error(error.message),
  });

  if (workspace.error) return <Empty description={workspace.error.message} />;
  const project = workspace.data?.project;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { title: <Link to="/deploy/projects">发布项目</Link> },
        { title: project?.name ?? '项目详情' },
      ]}
      />
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Typography.Title level={1} className="mb-0! text-2xl!">{project?.name ?? '项目详情'}</Typography.Title>
            {project && <Tag>{project.kind === 'frontend' ? '前端' : '服务'}</Tag>}
          </div>
          <Typography.Text type="secondary" className="font-mono text-xs">{project?.packageName}</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} disabled={!project}>
          新建环境
        </Button>
      </section>
      {project && (
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={[
            { key: 'repository', label: '仓库', children: project.repositoryFullName },
            { key: 'preset', label: '构建预设', children: <Typography.Text code>{project.preset}</Typography.Text> },
            { key: 'ref', label: '默认 ref', children: <Typography.Text code>{project.defaultRef}</Typography.Text> },
            { key: 'manifest', label: 'Manifest', children: <Typography.Text code>v{project.manifestVersion} / {project.manifestSha.slice(0, 12)}</Typography.Text> },
          ]}
        />
      )}
      <section aria-labelledby="environment-title">
        <Typography.Title id="environment-title" level={2} className="text-base!">发布环境</Typography.Title>
        <div className="surface-panel overflow-hidden">
          <Table
            rowKey="id"
            loading={workspace.loading}
            dataSource={workspace.data?.environments}
            pagination={false}
            scroll={{ x: 760 }}
            locale={{ emptyText: <Empty description="尚未配置发布环境" /> }}
            columns={[
              {
                title: '环境',
                dataIndex: 'name',
                width: 160,
                render: (name: string, item: DeployEnvironment) => (
                  <Link to={`/deploy/projects/${projectId}/environments/${item.id}`} className="font-medium">{name}</Link>
                ),
              },
              {
                title: 'GitHub Environment',
                dataIndex: 'githubEnvironmentName',
                width: 210,
                render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
              },
              { title: 'Runner', dataIndex: 'runnerTarget', width: 140 },
              {
                title: '策略',
                key: 'policy',
                width: 180,
                render: (_, item: DeployEnvironment) => (
                  <div className="flex gap-1">
                    {item.production && <Tag color="red">生产</Tag>}
                    {item.migrationsAllowed && <Tag color="gold">可迁移</Tag>}
                  </div>
                ),
              },
              {
                title: '',
                key: 'action',
                fixed: 'right',
                width: 56,
                render: (_, item: DeployEnvironment) => (
                  <Link to={`/deploy/projects/${projectId}/environments/${item.id}`} aria-label={`打开 ${item.name}`}>
                    <Button type="text" icon={<RightOutlined />} />
                  </Link>
                ),
              },
            ]}
          />
        </div>
      </section>
      <section aria-labelledby="history-title">
        <Typography.Title id="history-title" level={2} className="text-base!">发布历史</Typography.Title>
        <div className="surface-panel overflow-hidden">
          <DeploymentTable deployments={workspace.data?.deployments ?? []} loading={workspace.loading} />
        </div>
      </section>
      <Modal
        title="新建发布环境"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createEnvironment.loading}
        destroyOnHidden
      >
        <Form<EnvironmentForm>
          form={form}
          layout="vertical"
          initialValues={{
            runnerTarget: 'staging',
            allowedBranches: 'main',
            production: false,
            migrationsAllowed: false,
          }}
          onFinish={(values) => createEnvironment.run(values)}
        >
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Form.Item name="name" label="环境标识" rules={[{ required: true }, { pattern: /^[a-z][a-z0-9-]{1,31}$/u }]}>
              <Input placeholder="staging" />
            </Form.Item>
            <Form.Item name="githubEnvironmentName" label="GitHub Environment" rules={[{ required: true }]}>
              <Input placeholder="pr-chat-staging" />
            </Form.Item>
          </div>
          <Form.Item name="runnerTarget" label="Runner target" rules={[{ required: true }]}>
            <Input placeholder="staging" />
          </Form.Item>
          <Form.Item name="publicOrigin" label="公开 Origin">
            <Input placeholder="https://app.example.com" />
          </Form.Item>
          <Form.Item name="healthUrl" label="健康检查 URL" rules={[{ required: true }, { type: 'url' }]}>
            <Input placeholder="https://app.example.com/api/health" />
          </Form.Item>
          <Form.Item name="allowedBranches" label="允许分支（逗号分隔）" rules={[{ required: true }]}>
            <Input placeholder="main,release/*" />
          </Form.Item>
          <Form.Item name="allowedTagPattern" label="允许标签模式">
            <Input placeholder="v*" />
          </Form.Item>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Form.Item name="production" label="生产环境" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="migrationsAllowed" label="允许数据库迁移" valuePropName="checked">
              <Switch disabled={!project?.migrationSupported} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
