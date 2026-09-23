import { HomeOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Menu, Typography } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { project } from '../project';
import { ThemeSwitcher } from './ThemeSwitcher';

export function AppLayout() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="skip-link sr-only focus:not-sr-only focus:p-4">跳转到内容</a>
      <header className="app-header">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-10">
          <Link to="/" className="brand-link mr-auto flex items-center gap-3 font-semibold" aria-label={`${project.name} 首页`}>
            <span className="brand-mark grid size-9 place-items-center rounded-lg font-mono text-sm">sp.</span>
            <span className="flex flex-col">
              <span>{project.name}</span>
              <Typography.Text type="secondary" className="text-xs font-normal">{project.role}</Typography.Text>
            </span>
          </Link>
          <nav className="order-last w-full sm:order-none sm:w-64" aria-label="主导航">
            <Menu
              mode="horizontal"
              selectedKeys={[pathname]}
              style={{ borderBottom: 0, background: 'transparent', minWidth: 0 }}
              items={[
                { key: '/', icon: <HomeOutlined />, label: <Link to="/" aria-current={pathname === '/' ? 'page' : undefined}>工作台</Link> },
                { key: '/about', icon: <InfoCircleOutlined />, label: <Link to="/about" aria-current={pathname === '/about' ? 'page' : undefined}>关于项目</Link> },
              ]}
            />
          </nav>
          <ThemeSwitcher />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-10 sm:py-12">
        <Outlet />
      </main>
      <footer className="secondary-text mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-3 px-4 py-6 text-xs sm:px-10">
        <span>{project.name} · {project.role}</span>
        <span>Ant Design 6 · React 19 · Node.js 24</span>
      </footer>
    </div>
  );
}
