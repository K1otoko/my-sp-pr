import { Link } from 'react-router-dom';
import { useHealth } from '../hooks/useHealth';
import { project } from '../project';

const stack = [
  { number: '01', title: '界面与交互', detail: 'React 19 · Vite · Tailwind CSS', note: '从清晰的页面结构开始，专注产品体验。' },
  { number: '02', title: '数据与请求', detail: 'ahooks · 自动生成 SDK', note: '接口类型与后端定义同步，管理每一次请求。' },
  { number: '03', title: '服务与运行时', detail: 'Express 5 · Node.js 24', note: '独立运行的 API 服务，为业务逻辑留出空间。' },
];

export function HomePage() {
  const { data, loading, error, refresh } = useHealth();
  const status = loading ? '正在检查' : error ? '连接异常' : data ? '服务正常' : '等待检查';
  const current = !error && !loading ? data : undefined;

  return (
    <div className="space-y-12">
      <section className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">{project.name} · {project.role}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{project.title}</h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-stone-500">
            {project.description}
          </p>
        </div>
        <Link to="/about" className="text-sm font-medium text-emerald-800 underline decoration-emerald-800/30 underline-offset-8">
          了解项目结构 <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white" aria-labelledby="health-title">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className={`size-2 rounded-full ${loading ? 'animate-pulse bg-amber-500' : error ? 'bg-red-500' : data ? 'bg-emerald-600' : 'bg-stone-400'}`} />
            <h2 id="health-title" className="font-medium">服务连接</h2>
            <span className="rounded-md bg-stone-100 px-2 py-1 font-mono text-[10px] text-stone-500">LIVE</span>
          </div>
          <button type="button" onClick={refresh} className="button-secondary" aria-label={error ? '重试连接' : '刷新状态'}>
            <span aria-hidden="true">↻</span> {loading ? '重新检查' : error ? '重试连接' : '刷新状态'}
          </button>
        </div>
        <div className="px-6 py-8 sm:px-8" aria-live="polite" aria-busy={loading}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <p className={`text-2xl font-semibold tracking-tight ${error && !loading ? 'text-red-700' : 'text-emerald-950'}`}>{status}</p>
            <p className="text-sm text-stone-500">
              {loading ? '正在获取最新的服务状态…' : error ? '请检查服务后重新尝试。' : '前后端已连通，可以开始开发。'}
            </p>
          </div>
          {error && !loading && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error.message}</p>}
          <dl className="mt-8 grid gap-6 border-t border-stone-100 pt-6 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-stone-500">服务名称</dt>
              <dd className="mt-2 break-all font-mono text-sm">{current?.service ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">持续运行</dt>
              <dd className="mt-2 font-mono text-sm">{current ? `${current.uptime.toLocaleString()} 秒` : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">最近检查</dt>
              <dd className="mt-2 font-mono text-sm">{current ? new Date(current.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="stack-title">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="stack-title" className="text-sm font-medium">项目基础</h2>
          <span className="text-xs text-stone-400">简单起步，自由扩展</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {stack.map((item) => (
            <article key={item.number} className="rounded-xl border border-stone-200 p-6">
              <p className="font-mono text-xs text-stone-400">{item.number}</p>
              <h3 className="mt-5 font-medium">{item.title}</h3>
              <p className="mt-2 text-xs font-medium text-emerald-800">{item.detail}</p>
              <p className="mt-4 text-sm leading-7 text-stone-500">{item.note}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
