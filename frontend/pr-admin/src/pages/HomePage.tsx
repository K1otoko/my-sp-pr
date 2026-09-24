import { Empty, Typography } from 'antd';

export function HomePage() {
  return (
    <div className="space-y-6">
      <section>
        <Typography.Title level={1} className="mb-0! text-2xl!">Dashboard</Typography.Title>
      </section>
      <section className="grid min-h-[420px] place-items-center" aria-label="Dashboard 暂无总览数据">
        <Empty description="暂无总览数据" />
      </section>
    </div>
  );
}
