import { Link, NavLink, Outlet } from 'react-router-dom';
import { project } from '../project';

export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:p-4">跳转到内容</a>
      <header className="border-b border-stone-200 bg-white/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-5 sm:px-10">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight" aria-label={`${project.name} 首页`}>
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-950 font-mono text-sm text-lime-200">sp.</span>
            <span>{project.name}<span className="ml-2 text-xs font-normal text-stone-400">· {project.role}</span></span>
          </Link>
          <nav className="flex gap-2 text-sm" aria-label="主导航">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}>工作台</NavLink>
            <NavLink to="/about" className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}>关于项目</NavLink>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:px-10 sm:py-16">
        <Outlet />
      </main>
      <footer className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-3 px-6 py-6 text-xs text-stone-500 sm:px-10">
        <span>{project.name} · {project.role}</span>
        <span>React 19 + Express 5 / Node.js 24</span>
      </footer>
    </div>
  );
}
