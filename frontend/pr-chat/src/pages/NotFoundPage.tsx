import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="py-16 text-center">
      <p className="font-mono text-sm text-emerald-700">404 / PAGE NOT FOUND</p>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight">这个页面还不存在。</h1>
      <p className="mt-5 text-stone-500">检查访问地址，或回到工作台继续。</p>
      <Link to="/" className="mt-8 inline-block rounded-lg bg-emerald-950 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800">
        返回工作台
      </Link>
    </section>
  );
}
