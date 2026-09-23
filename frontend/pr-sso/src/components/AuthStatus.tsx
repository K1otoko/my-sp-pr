import { Alert, Button, Card, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';

export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card styles={{ body: { padding: 'clamp(20px, 5vw, 36px)' } }}>
      <Typography.Title level={1} className="mt-0! text-2xl!">{title}</Typography.Title>
      {description && <Typography.Paragraph type="secondary" className="mb-7! leading-6">{description}</Typography.Paragraph>}
      {children}
    </Card>
  );
}

export function AuthLoading({ text = '正在确认登录状态…' }: { text?: string }) {
  return <div role="status" className="flex items-center justify-center gap-3 py-12"><Spin /><Typography.Text type="secondary">{text}</Typography.Text></div>;
}

export function AuthFailure({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="space-y-5">
      <Alert type="error" showIcon title={error.message} role="alert" />
      <div className="flex flex-wrap gap-3">
        {retry && <Button onClick={retry}>重试</Button>}
        <Button href="/api/auth/portal/start" type={retry ? 'default' : 'primary'}>重新登录</Button>
      </div>
    </div>
  );
}
