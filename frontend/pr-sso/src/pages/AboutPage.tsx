import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Card, Divider, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { project } from '../project';

const layers = [
  [project.directory, '界面与交互', 'React 19、Ant Design 6、声明式路由和 Tailwind CSS。ahooks 管理请求状态，SDK 提供类型化请求。'],
  [project.backend, '接口与业务', 'Express 5 分层组织路由、控制器与服务，使用 Zod 校验接口响应。浏览器统一通过 Gateway 访问。'],
  ['scripts/', '自动化工具', '从统一接口定义生成 OpenAPI 与前端客户端，并在开发时持续同步变更。'],
];

export function AboutPage() {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">ABOUT THE WORKSPACE</p>
      <Typography.Title level={1} className="mt-3! text-3xl! sm:text-4xl!">清晰的结构，可靠的起点。</Typography.Title>
      <Typography.Paragraph type="secondary" className="text-base leading-7">
        前后端独立开发与部署，在同一个 pnpm 工作区协作。
        接口定义集中维护，减少类型和请求代码的重复工作。
      </Typography.Paragraph>
      <Card variant="outlined" className="mt-8">
        {layers.map(([directory, title, description], index) => (
          <div key={directory}>
            {index > 0 && <Divider />}
            <section className="grid gap-3 sm:grid-cols-[160px_1fr] sm:gap-6">
              <Typography.Text code className="break-all">{directory}</Typography.Text>
              <div>
                <Typography.Title level={2} className="text-base!">{title}</Typography.Title>
                <Typography.Paragraph type="secondary" className="mb-0! leading-7">{description}</Typography.Paragraph>
              </div>
            </section>
          </div>
        ))}
      </Card>
      <aside className="mt-6">
        <Alert
          type="info"
          showIcon
          title="一个接口定义，两端同步。"
          description={(
            <span className="leading-7">
              在 <code className="break-all">backend/contracts/src/</code> 对应服务契约中定义接口，
              运行 <code>pnpm generate:api</code> 生成客户端。开发模式会自动监听变更。
              详细约定与部署步骤见项目 README。
            </span>
          )}
        />
      </aside>
      <Link to="/" className="app-link mt-6 inline-flex items-center gap-2 text-sm"><ArrowLeftOutlined /> 返回工作台</Link>
    </div>
  );
}
