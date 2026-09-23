import { ArrowRightOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Badge, Button, Card, Descriptions, Divider, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useHealth } from '../hooks/useHealth';
import { project } from '../project';

const stack = [
  { number: '01', title: '界面与交互', detail: 'React 19 · Ant Design 6 · Tailwind CSS', note: '统一组件与深浅主题，专注产品体验。' },
  { number: '02', title: '数据与请求', detail: 'ahooks · 自动生成 SDK', note: '接口类型与后端定义同步，管理每一次请求。' },
  { number: '03', title: '服务与运行时', detail: 'Express 5 · Node.js 24', note: '独立运行的 API 服务，为业务逻辑留出空间。' },
];

export function HomePage() {
  const { data, loading, error, refresh } = useHealth();
  const status = loading ? '正在检查' : error ? '连接异常' : data ? '服务正常' : '等待检查';
  const current = !error && !loading ? data : undefined;
  const badgeStatus = loading ? 'processing' : error ? 'error' : data ? 'success' : 'default';

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">{project.name} · {project.role}</p>
          <Typography.Title level={1} className="mt-3! text-3xl! sm:text-4xl!">{project.title}</Typography.Title>
          <Typography.Paragraph type="secondary" className="mb-0! max-w-xl text-base leading-7">
            {project.description}
          </Typography.Paragraph>
        </div>
        <Link to="/about" className="app-link shrink-0 text-sm">
          了解项目结构 <ArrowRightOutlined />
        </Link>
      </section>

      <section aria-labelledby="health-title">
        <Card variant="outlined">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Typography.Title level={2} id="health-title" className="mb-0! text-base!">服务连接</Typography.Title>
              <Tag>LIVE</Tag>
            </div>
            <Button onClick={refresh} icon={<ReloadOutlined spin={loading} />}>
              {loading ? '重新检查' : error ? '重试连接' : '刷新状态'}
            </Button>
          </div>
          <div aria-live="polite" aria-busy={loading}>
            <Badge status={badgeStatus} text={<Typography.Text strong className="text-xl">{status}</Typography.Text>} />
            <Typography.Paragraph type="secondary" className="mt-2">
              {loading ? '正在获取最新的服务状态…' : error ? '请检查服务后重新尝试。'
                : data ? '前后端已连通，可以开始开发。' : '尚无检查结果，请刷新状态。'}
            </Typography.Paragraph>
            {error && !loading && <Alert type="error" showIcon title={error.message} />}
            <Divider />
            <Descriptions
              layout="vertical"
              colon={false}
              column={{ xs: 1, sm: 3 }}
              items={[
                { key: 'service', label: '服务名称', children: <span className="break-all font-mono">{current?.service ?? '—'}</span> },
                { key: 'uptime', label: '持续运行', children: current ? `${current.uptime.toLocaleString()} 秒` : '—' },
                { key: 'timestamp', label: '最近检查', children: current ? new Date(current.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '—' },
              ]}
            />
          </div>
        </Card>
      </section>

      <section aria-labelledby="stack-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Typography.Title level={2} id="stack-title" className="mb-0! text-base!">项目基础</Typography.Title>
          <Typography.Text type="secondary" className="text-xs">简单起步，自由扩展</Typography.Text>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {stack.map((item) => (
            <article key={item.number}>
              <Card variant="outlined" className="h-full">
                <Typography.Text type="secondary" className="font-mono text-xs">{item.number}</Typography.Text>
                <Typography.Title level={3} className="mt-4! text-base!">{item.title}</Typography.Title>
                <Typography.Text className="text-xs">{item.detail}</Typography.Text>
                <Typography.Paragraph type="secondary" className="mb-0! mt-3 leading-6">{item.note}</Typography.Paragraph>
              </Card>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
