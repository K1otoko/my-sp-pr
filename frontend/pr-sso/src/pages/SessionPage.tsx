import { useEffect, useState } from 'react';
import { Alert, Button, Divider, Tag, Typography } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { resumeAuthentication } from '../api/navigation';
import { AuthCard, AuthFailure, AuthLoading } from '../components/AuthStatus';
import { useSession, useStartLogout } from '../hooks/useAuth';

export function SessionPage() {
  const session = useSession();
  const logout = useStartLogout();
  const [params] = useSearchParams();
  const signedOut = params.get('signed_out') === '1';
  const [failure, setFailure] = useState<Error>();
  useEffect(() => {
    if (!session.loading && !session.error && session.data?.authenticated === false && !signedOut) {
      window.location.replace('/api/auth/portal/start');
    }
  }, [session.loading, session.error, session.data, signedOut]);
  const current = session.data?.authenticated ? session.data : undefined;
  async function startLogout() {
    if (!current || logout.loading) return;
    setFailure(undefined);
    try {
      const result = await logout.submit(current.csrfToken);
      if (result) resumeAuthentication(result.resumeUrl, 'logout');
    } catch (error) { setFailure(error instanceof Error ? error : new Error('暂时无法退出，请重试')); }
  }
  if (session.loading) return <AuthCard title="统一登录"><AuthLoading /></AuthCard>;
  if (session.error) return <AuthCard title="暂时无法确认登录状态"><AuthFailure error={session.error} retry={session.refresh} /></AuthCard>;
  if (!current) return (
    <AuthCard title={signedOut ? '已退出登录' : '准备登录'} description={signedOut ? '此浏览器的登录已结束，其他设备不受影响。' : undefined}>
      {signedOut ? <Button type="primary" href="/api/auth/portal/start" size="large" block>重新登录</Button> : <AuthLoading text="正在前往登录页…" />}
    </AuthCard>
  );
  const roleLabel = { super: '超级管理员', admin: '管理员', user: '普通用户' }[current.user.role];
  return (
    <AuthCard title="你已登录" description="可以返回已接入的应用继续使用。">
      <div className="flex items-center gap-3">
        <CheckCircleOutlined className="text-xl" style={{ color: 'var(--app-primary)' }} />
        <Typography.Text strong className="min-w-0 flex-1 break-all text-lg">{current.user.displayName}</Typography.Text>
        <Tag>{roleLabel}</Tag>
      </div>
      <Typography.Paragraph type="secondary" className="mb-0! mt-2 break-all">@{current.user.username}</Typography.Paragraph>
      <Divider />
      <Typography.Paragraph type="secondary" className="text-xs leading-6">
        登录最长保留 7 天，连续 24 小时未使用后需要重新登录。
      </Typography.Paragraph>
      {failure && <Alert type="error" showIcon title={failure.message} role="alert" className="mb-4" />}
      <Button block onClick={() => void startLogout()} loading={logout.loading}>退出登录</Button>
    </AuthCard>
  );
}
