import { useEffect, useMemo, useState } from 'react';
import {
  Alert, App, AutoComplete, Breadcrumb, Button, Descriptions, Form, Input, Modal, Switch, Table, Tag, Typography,
} from 'antd';
import { EditOutlined, GithubOutlined, RocketOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createDeployment, updateDeployEnvironment } from '../api/generated/sdk.gen';
import { apiClient, requestApi, unwrapResponse } from '../api/client';
import { DeploymentTable } from '../components/DeploymentTable';
import { useAdminSession } from '../hooks/useAdminSession';
import { useApiAction } from '../hooks/useApiAction';
import { useEnvironmentWorkspace } from '../hooks/useDeployData';

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

type DeployForm = {
  ref: string;
  runMigration: boolean;
  confirmation?: string;
};

export function DeployEnvironmentPage() {
  const { projectId = '', environmentId = '' } = useParams();
  const workspace = useEnvironmentWorkspace(projectId, environmentId);
  const session = useAdminSession();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [editForm] = Form.useForm<EnvironmentForm>();
  const [deployForm] = Form.useForm<DeployForm>();
  const environment = workspace.data?.environment;
  const project = workspace.data?.project;

  useEffect(() => {
    if (!environment) return;
    editForm.setFieldsValue({
      name: environment.name,
      githubEnvironmentName: environment.githubEnvironmentName,
      runnerTarget: environment.runnerTarget,
      publicOrigin: environment.publicOrigin ?? undefined,
      healthUrl: environment.healthUrl,
      allowedBranches: environment.allowedBranches.join(','),
      allowedTagPattern: environment.allowedTagPattern ?? undefined,
      production: environment.production,
      migrationsAllowed: environment.migrationsAllowed,
    });
  }, [editForm, environment]);

  const refOptions = useMemo(() => [
    ...(workspace.data?.refs.branches ?? []).map((item) => ({
      value: item.name,
      label: <span>{item.name} <Typography.Text type="secondary" className="font-mono text-xs">{item.sha.slice(0, 8)}</Typography.Text></span>,
    })),
    ...(workspace.data?.refs.tags ?? []).map((item) => ({
      value: item.name,
      label: <span>{item.name} <Tag className="ml-2">tag</Tag></span>,
    })),
  ], [workspace.data?.refs]);

  const updateEnvironment = useApiAction(async (activeSignal, values: EnvironmentForm) => {
    if (!session.session?.authenticated) return;
    return unwrapResponse(await requestApi(
      (signal) => updateDeployEnvironment({
        client: apiClient,
        throwOnError: true,
        signal,
        path: { environmentId },
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
    onSuccess: async (result) => {
      if (!result) return;
      setEditOpen(false);
      await workspace.refreshAsync();
      void message.success('环境设置已更新');
    },
    onError: (error) => void message.error(error.message),
  });

  const submitDeployment = useApiAction(async (activeSignal, values: DeployForm) => {
    if (!session.session?.authenticated) return;
    return unwrapResponse(await requestApi(
      (signal) => createDeployment({
        client: apiClient,
        throwOnError: true,
        signal,
        path: { projectId },
        body: {
          csrfToken: session.session!.authenticated ? session.session!.csrfToken : '',
          environmentId,
          ref: values.ref,
          runMigration: values.runMigration,
          confirmation: values.confirmation,
        },
      }),
      activeSignal,
    ));
  }, {
    onSuccess: (result) => {
      if (result) void navigate(`/deploy/deployments/${result.id}`);
    },
    onError: (error) => void message.error(error.message),
  });

  if (workspace.error) return <Alert type="error" showIcon title={workspace.error.message} />;
  if (!workspace.loading && !environment) return <Alert type="error" showIcon title="发布环境不存在" />;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { title: <Link to="/deploy/projects">发布项目</Link> },
        { title: <Link to={`/deploy/projects/${projectId}`}>{project?.name ?? '项目'}</Link> },
        { title: environment?.name ?? '环境' },
      ]}
      />
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Typography.Title level={1} className="mb-0! text-2xl!">{environment?.name ?? '发布环境'}</Typography.Title>
            {environment?.production && <Tag color="red">生产</Tag>}
          </div>
          <Typography.Text type="secondary">{environment?.githubEnvironmentName}</Typography.Text>
        </div>
        <div className="flex gap-2">
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>编辑环境</Button>
          <Button
            type="primary"
            icon={<RocketOutlined />}
            disabled={!workspace.data?.configuration.complete}
            onClick={() => {
              deployForm.setFieldsValue({ ref: project?.defaultRef, runMigration: false });
              setDeployOpen(true);
            }}
          >
            发起发布
          </Button>
        </div>
      </section>
      {environment && (
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={[
            { key: 'runner', label: 'Runner target', children: environment.runnerTarget },
            { key: 'health', label: '健康检查', children: <a href={environment.healthUrl} target="_blank" rel="noreferrer">{environment.healthUrl}</a> },
            { key: 'branches', label: '允许分支', children: environment.allowedBranches.map((item) => <Tag key={item}>{item}</Tag>) },
            { key: 'tags', label: '允许标签', children: environment.allowedTagPattern ?? '—' },
          ]}
        />
      )}
      <section aria-labelledby="config-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Typography.Title id="config-title" level={2} className="mb-0! text-base!">环境配置</Typography.Title>
            <Typography.Text type="secondary" className="text-xs">敏感值仅显示是否已配置。</Typography.Text>
          </div>
          {workspace.data?.configuration.settingsUrl && (
            <Button
              href={workspace.data.configuration.settingsUrl}
              target="_blank"
              icon={<GithubOutlined />}
            >
              GitHub 设置
            </Button>
          )}
        </div>
        {!workspace.loading && workspace.data && !workspace.data.configuration.complete && (
          <Alert className="mb-3" type="warning" showIcon title="必填配置尚未完整，当前不能发布。" />
        )}
        <div className="surface-panel overflow-hidden">
          <Table
            rowKey="name"
            loading={workspace.loading}
            dataSource={workspace.data?.configuration.entries}
            pagination={false}
            scroll={{ x: 700 }}
            columns={[
              {
                title: '名称',
                dataIndex: 'name',
                width: 220,
                render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
              },
              { title: '阶段', dataIndex: 'scope', width: 110 },
              {
                title: '类型',
                key: 'type',
                width: 120,
                render: (_, item) => item.sensitive ? <Tag color="gold">Secret</Tag> : <Tag>Variable</Tag>,
              },
              {
                title: '状态',
                dataIndex: 'configured',
                width: 110,
                render: (configured: boolean) => <Tag color={configured ? 'success' : 'error'}>{configured ? '已配置' : '缺失'}</Tag>,
              },
              {
                title: '值',
                key: 'value',
                render: (_, item) => item.sensitive
                  ? <Typography.Text type="secondary">不可读取</Typography.Text>
                  : <Typography.Text className="break-all">{item.value ?? '—'}</Typography.Text>,
              },
            ]}
          />
        </div>
      </section>
      <section aria-labelledby="environment-history-title">
        <Typography.Title id="environment-history-title" level={2} className="text-base!">发布历史</Typography.Title>
        <div className="surface-panel overflow-hidden">
          <DeploymentTable deployments={workspace.data?.deployments ?? []} loading={workspace.loading} />
        </div>
      </section>
      <Modal
        title="编辑发布环境"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()}
        confirmLoading={updateEnvironment.loading}
        destroyOnHidden
      >
        <Form<EnvironmentForm> form={editForm} layout="vertical" onFinish={(values) => updateEnvironment.run(values)}>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Form.Item name="name" label="环境标识" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="githubEnvironmentName" label="GitHub Environment" rules={[{ required: true }]}><Input /></Form.Item>
          </div>
          <Form.Item name="runnerTarget" label="Runner target" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="publicOrigin" label="公开 Origin"><Input /></Form.Item>
          <Form.Item name="healthUrl" label="健康检查 URL" rules={[{ required: true }, { type: 'url' }]}><Input /></Form.Item>
          <Form.Item name="allowedBranches" label="允许分支（逗号分隔）" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="allowedTagPattern" label="允许标签模式"><Input /></Form.Item>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Form.Item name="production" label="生产环境" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="migrationsAllowed" label="允许数据库迁移" valuePropName="checked">
              <Switch disabled={!project?.migrationSupported} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
      <Modal
        title={`发布 ${project?.name ?? ''} 到 ${environment?.name ?? ''}`}
        open={deployOpen}
        onCancel={() => setDeployOpen(false)}
        onOk={() => deployForm.submit()}
        confirmLoading={submitDeployment.loading}
        okText={environment?.production ? '确认生产发布' : '开始发布'}
        okButtonProps={{ danger: environment?.production }}
        destroyOnHidden
      >
        {environment?.production && (
          <Alert className="mb-4" type="warning" showIcon title="这是生产发布。提交后将固定 commit SHA 并触发 GitHub Actions。" />
        )}
        <Form<DeployForm>
          form={deployForm}
          layout="vertical"
          initialValues={{ runMigration: false }}
          onFinish={(values) => submitDeployment.run(values)}
        >
          <Form.Item name="ref" label="Branch / tag / commit SHA" rules={[{ required: true }]}>
            <AutoComplete options={refOptions} placeholder="main 或 v1.2.3" showSearch={{ filterOption: true }} />
          </Form.Item>
          <Form.Item name="runMigration" label="执行数据库迁移" valuePropName="checked">
            <Switch disabled={!project?.migrationSupported || !environment?.migrationsAllowed} />
          </Form.Item>
          {environment?.production && (
            <Form.Item
              name="confirmation"
              label={<>输入 <Typography.Text code>{project?.slug}</Typography.Text> 确认</>}
              rules={[{ required: true }, { validator: (_, value) => value === project?.slug
                ? Promise.resolve() : Promise.reject(new Error('确认文本不匹配')) }]}
            >
              <Input autoComplete="off" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
