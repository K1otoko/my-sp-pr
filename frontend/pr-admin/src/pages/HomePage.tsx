import { Alert, Badge, Button, Descriptions, Tag, Typography } from 'antd';
import { ReloadOutlined, RocketOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useAdminSession } from '../hooks/useAdminSession';
import { useHealth } from '../hooks/useHealth';

export function HomePage() {
  const health = useHealth();
  const session = useAdminSession();
  const user = session.session?.authenticated ? session.session.user : undefined;
  const badgeStatus = health.loading ? 'processing' : health.error ? 'error' : health.data ? 'success' : 'default';

  return (
    <div className="space-y-6">
      <section>
        <Typography.Title level={1} className="mb-1! text-2xl!">管理概览</Typography.Title>
        <Typography.Text type="secondary">当前身份、服务状态和可用管理入口。</Typography.Text>
      </section>
      <section className="surface-panel p-5" aria-labelledby="account-title">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Typography.Title id="account-title" level={2} className="mb-0! text-base!">当前账号</Typography.Title>
          <Tag color={user?.role === 'super' ? 'blue' : 'default'}>
            {user?.role === 'super' ? '超级管理员' : '管理员'}
          </Tag>
        </div>
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 3 }}
          items={[
            { key: 'name', label: '显示名称', children: user?.displayName ?? '—' },
            { key: 'username', label: '用户名', children: user ? `@${user.username}` : '—' },
            { key: 'access', label: '发布权限', children: user?.role === 'super' ? '可访问' : '无权限' },
          ]}
        />
        {user?.role === 'super' && (
          <Link to="/deploy/projects">
            <Button type="primary" icon={<RocketOutlined />} className="mt-4">进入发布模块</Button>
          </Link>
        )}
      </section>
      <section className="surface-panel p-5" aria-labelledby="health-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Typography.Title id="health-title" level={2} className="mb-0! text-base!">Admin API</Typography.Title>
          <Button
            icon={<ReloadOutlined spin={health.loading} />}
            onClick={health.refresh}
          >
            刷新
          </Button>
        </div>
        <Badge
          status={badgeStatus}
          text={health.loading ? '检查中' : health.error ? '连接异常' : health.data ? '服务正常' : '等待检查'}
        />
        {health.error && <Alert className="mt-4" type="error" showIcon title={health.error.message} />}
        {health.data && (
          <Descriptions
            className="mt-4"
            size="small"
            column={{ xs: 1, sm: 3 }}
            items={[
              { key: 'service', label: '服务', children: health.data.service },
              { key: 'uptime', label: '运行时间', children: `${health.data.uptime.toLocaleString()} 秒` },
              { key: 'timestamp', label: '检查时间', children: new Date(health.data.timestamp).toLocaleString('zh-CN', { hour12: false }) },
            ]}
          />
        )}
      </section>
    </div>
  );
}
