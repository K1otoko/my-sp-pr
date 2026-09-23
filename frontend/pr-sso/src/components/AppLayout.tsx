import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { Link, Outlet } from 'react-router-dom';
import { project } from '../project';
import { ThemeSwitcher } from './ThemeSwitcher';

export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="skip-link sr-only focus:not-sr-only focus:p-4">跳转到内容</a>
      <header>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-6 sm:px-10">
          <Link to="/" className="brand-link mr-auto flex items-center gap-3 font-semibold" aria-label={`${project.name} 首页`}>
            <span className="brand-mark grid size-9 place-items-center rounded-lg text-lg"><SafetyCertificateOutlined /></span>
            <span className="flex flex-col">
              <span>{project.name}</span>
              <Typography.Text type="secondary" className="text-xs font-normal">{project.role}</Typography.Text>
            </span>
          </Link>
          <ThemeSwitcher />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-5 py-8 sm:py-14">
        <div className="w-full max-w-md"><Outlet /></div>
      </main>
      <footer className="secondary-text px-5 py-6 text-center text-xs">
        <span>一个账号，连接已接入的应用。</span>
      </footer>
    </div>
  );
}
