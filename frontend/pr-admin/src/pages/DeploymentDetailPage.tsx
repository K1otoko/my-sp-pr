import { useState } from 'react';
import {
  Alert, App, Breadcrumb, Button, Descriptions, Form, Input, Modal, Result, Timeline, Typography,
} from 'antd';
import { GithubOutlined, RollbackOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { rollbackDeployment } from '../api/generated/sdk.gen';
import { apiClient, requestApi, unwrapResponse } from '../api/client';
import { DeploymentStatus } from '../components/DeploymentStatus';
import { useAdminSession } from '../hooks/useAdminSession';
import { useApiAction } from '../hooks/useApiAction';
import { useDeploymentDetail } from '../hooks/useDeployData';
import { formatDateTime, shortSha } from '../utils/format';

export function DeploymentDetailPage() {
  const { deploymentId = '' } = useParams();
  const deployment = useDeploymentDetail(deploymentId);
  const session = useAdminSession();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{ confirmation: string }>();
  const rollback = useApiAction(async (activeSignal, { confirmation }: { confirmation: string }) => {
    if (!session.session?.authenticated) return;
    return unwrapResponse(await requestApi(
      (signal) => rollbackDeployment({
        client: apiClient,
        throwOnError: true,
        signal,
        path: { deploymentId },
        body: {
          csrfToken: session.session!.authenticated ? session.session!.csrfToken : '',
          confirmation,
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

  if (deployment.error) {
    return <Result status="error" title="无法读取发布详情" subTitle={deployment.error.message} />;
  }
  const data = deployment.data;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { title: <Link to="/deploy/deployments">发布记录</Link> },
        { title: data ? `${data.projectSlug} / ${shortSha(data.resolvedSha)}` : '发布详情' },
      ]}
      />
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <Typography.Title level={1} className="mb-0! text-2xl!">{data?.projectSlug ?? '发布详情'}</Typography.Title>
            {data && <DeploymentStatus status={data.status} />}
          </div>
          <Typography.Text type="secondary">{data?.environmentName}</Typography.Text>
        </div>
        <div className="flex gap-2">
          {data?.logUrl && <Button href={data.logUrl} target="_blank" icon={<GithubOutlined />}>GitHub 日志</Button>}
          {data && ['succeeded', 'inactive'].includes(data.status) && (
            <Button danger icon={<RollbackOutlined />} onClick={() => setOpen(true)}>回滚到此版本</Button>
          )}
        </div>
      </section>
      {data?.migrationPerformed && (
        <Alert type="warning" showIcon title="本次发布执行过数据库迁移；代码回滚不会自动回滚数据库。" />
      )}
      {data && (
        <>
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2, lg: 3 }}
            items={[
              { key: 'sha', label: 'Commit SHA', children: <a href={data.commitUrl} target="_blank" rel="noreferrer"><Typography.Text code>{data.resolvedSha}</Typography.Text></a> },
              { key: 'ref', label: '请求 ref', children: <Typography.Text code>{data.requestedRef}</Typography.Text> },
              { key: 'actor', label: '发起人', children: data.actorUsername },
              { key: 'created', label: '创建时间', children: formatDateTime(data.createdAt) },
              { key: 'started', label: '开始时间', children: formatDateTime(data.startedAt) },
              { key: 'finished', label: '完成时间', children: formatDateTime(data.finishedAt) },
              { key: 'migration', label: '数据库迁移', children: data.migrationRequested ? '已请求' : '未请求' },
              { key: 'github', label: 'GitHub Deployment', children: data.githubDeploymentId ?? '等待创建' },
              { key: 'failure', label: '失败阶段', children: data.failureStage ? `${data.failureStage} / ${data.failureCode ?? 'unknown'}` : '—' },
            ]}
          />
          <section aria-labelledby="commit-title">
            <Typography.Title id="commit-title" level={2} className="text-base!">提交说明</Typography.Title>
            <pre className="surface-panel m-0 whitespace-pre-wrap break-words p-4 text-sm">{data.commitMessage}</pre>
          </section>
          <section aria-labelledby="timeline-title">
            <Typography.Title id="timeline-title" level={2} className="text-base!">状态时间线</Typography.Title>
            <Timeline
              items={[
                {
                  color: 'blue',
                  content: <div><strong>已请求</strong><div className="secondary-text text-xs">{formatDateTime(data.createdAt)}</div></div>,
                },
                ...data.events.map((event) => ({
                  color: event.status === 'succeeded' ? 'green'
                    : event.status === 'failed' || event.status === 'error' ? 'red' : 'blue',
                  content: (
                    <div>
                      <DeploymentStatus status={event.status} />
                      <div className="mt-1">{event.description ?? 'GitHub 状态更新'}</div>
                      <div className="secondary-text text-xs">{formatDateTime(event.receivedAt)}</div>
                    </div>
                  ),
                })),
              ]}
            />
          </section>
        </>
      )}
      <Modal
        title="确认应用制品回滚"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="创建回滚发布"
        okButtonProps={{ danger: true }}
        confirmLoading={rollback.loading}
        destroyOnHidden
      >
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          title="回滚会创建新的 deployment；数据库迁移不会回退。"
        />
        <Form form={form} layout="vertical" onFinish={(values) => rollback.run(values)}>
          <Form.Item
            name="confirmation"
            label={<>输入 <Typography.Text code>{data?.projectSlug}</Typography.Text> 确认</>}
            rules={[{ required: true }, { validator: (_, value) => value === data?.projectSlug
              ? Promise.resolve() : Promise.reject(new Error('确认文本不匹配')) }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
