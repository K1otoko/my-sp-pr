import { Link } from 'react-router-dom';
import { project } from '../project';

const layers = [
  [project.directory, '界面与交互', 'React 19、声明式路由和 Tailwind CSS。ahooks 管理请求状态，SDK 提供类型化请求。'],
  [project.backend, '接口与业务', 'Express 5 分层组织路由、控制器与服务，使用 Zod 校验接口响应。浏览器统一通过 Gateway 访问。'],
  ['scripts/', '自动化工具', '从统一接口定义生成 OpenAPI 与前端客户端，并在开发时持续同步变更。'],
];

export function AboutPage() {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">ABOUT THE WORKSPACE</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">清晰的结构，可靠的起点。</h1>
      <p className="mt-5 text-base leading-8 text-stone-500">
        前后端独立开发与部署，在同一个 pnpm 工作区协作。
        接口定义集中维护，减少类型和请求代码的重复工作。
      </p>
      <div className="mt-10 divide-y divide-stone-200 border-y border-stone-200">
        {layers.map(([directory, title, description]) => (
          <section key={directory} className="grid gap-3 py-7 sm:grid-cols-[140px_1fr] sm:gap-6">
            <code className="break-all text-sm text-emerald-800">{directory}</code>
            <div>
              <h2 className="font-medium">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-stone-500">{description}</p>
            </div>
          </section>
        ))}
      </div>
      <aside className="mt-8 rounded-xl bg-emerald-950 p-6 text-emerald-50">
        <h2 className="font-medium">一个接口定义，两端同步。</h2>
        <p className="mt-3 text-sm leading-7 text-emerald-100/80">
          在 <code className="break-all">backend/contracts/src/contract.ts</code> 定义接口，
          运行 <code>pnpm generate:api</code> 生成客户端。开发模式会自动监听变更。
          详细约定与部署步骤见项目 README。
        </p>
      </aside>
      <Link to="/" className="mt-8 inline-block text-sm text-emerald-800 underline underline-offset-8">← 返回工作台</Link>
    </div>
  );
}
