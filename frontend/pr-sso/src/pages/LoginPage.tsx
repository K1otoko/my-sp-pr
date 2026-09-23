import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Typography, type InputRef } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { resumeAuthentication } from '../api/navigation';
import { AuthCard, AuthFailure, AuthLoading } from '../components/AuthStatus';
import { useInteraction, useLogin } from '../hooks/useAuth';

const expiredCodes = new Set(['INVALID_INTERACTION', 'INTERACTION_EXPIRED', 'AUTH_FLOW_INVALID', 'FORBIDDEN']);

export function LoginPage() {
  const { uid = '' } = useParams();
  return <LoginForm key={uid} uid={uid} />;
}

function LoginForm({ uid }: { uid: string }) {
  const interaction = useInteraction(uid);
  const login = useLogin(uid);
  const [form] = Form.useForm<{ username: string; password: string }>();
  const username = useRef<InputRef>(null);
  const [failure, setFailure] = useState<Error>();
  useEffect(() => { if (interaction.data) username.current?.focus(); }, [interaction.data]);
  const expired = failure instanceof ApiError && expiredCodes.has(failure.code ?? '');
  async function submit(values: { username: string; password: string }) {
    if (!interaction.data || login.loading) return;
    setFailure(undefined);
    try {
      const result = await login.submit({ ...values, csrfToken: interaction.data.csrfToken });
      if (result) resumeAuthentication(result.resumeUrl, 'login');
    } catch (error) {
      form.setFieldValue('password', '');
      setFailure(error instanceof Error ? error : new Error('登录未完成，请重试'));
      if (error instanceof ApiError && error.code === 'CSRF_INVALID') interaction.refresh();
    }
  }
  return (
    <AuthCard title="登录你的账号" description={interaction.data ? `继续前往 ${interaction.data.clientName}` : '登录后，即可使用已接入的应用。'}>
      {interaction.loading ? <AuthLoading text="正在检查登录请求…" /> : interaction.error ? (
        <AuthFailure error={interaction.error} retry={interaction.error instanceof ApiError ? undefined : interaction.refresh} />
      ) : expired && failure ? <AuthFailure error={failure} /> : interaction.data ? (
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => void submit(values)} disabled={login.loading}>
          {failure && <Alert className="mb-5" type="error" showIcon title={failure.message}
            description={failure instanceof ApiError && failure.retryAfter ? `请在约 ${failure.retryAfter} 秒后重试。` : undefined} role="alert" />}
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input ref={username} size="large" autoComplete="username" maxLength={32} prefix={<UserOutlined />} placeholder="输入用户名" spellCheck={false} autoCapitalize="none" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password size="large" autoComplete="current-password" maxLength={128} prefix={<LockOutlined />} placeholder="输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={login.loading} className="mt-2">
            {login.loading ? '正在登录…' : '登录'}
          </Button>
          <Typography.Paragraph type="secondary" className="mb-0! mt-6 text-center text-xs leading-5">
            请使用管理员为你创建的账号。
          </Typography.Paragraph>
        </Form>
      ) : <AuthFailure error={new Error('登录请求不可用，请重新开始')} />}
    </AuthCard>
  );
}
