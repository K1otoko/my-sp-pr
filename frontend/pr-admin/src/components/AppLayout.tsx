import { useState } from 'react';
import {
  AppstoreOutlined, HistoryOutlined, InfoCircleOutlined, LogoutOutlined, MenuOutlined, UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Dropdown, Layout, Menu, Space, Tag, Tooltip, Typography } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAdminSession } from '../hooks/useAdminSession';
import { project } from '../project';
import { ThemeSwitcher } from './ThemeSwitcher';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  const { pathname } = useLocation();
  const session = useAdminSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = session.session?.authenticated ? session.session.user : undefined;
  const selected = pathname.startsWith('/deploy/deployments') ? '/deploy/deployments'
    : pathname.startsWith('/deploy') ? '/deploy/projects'
      : pathname === '/about' ? '/about' : '/';
  const items = [
    { key: '/', icon: <AppstoreOutlined />, label: <Link to="/">概览</Link> },
    ...(user?.role === 'super' ? [
      { key: '/deploy/projects', icon: <AppstoreOutlined />, label: <Link to="/deploy/projects">发布项目</Link> },
      { key: '/deploy/deployments', icon: <HistoryOutlined />, label: <Link to="/deploy/deployments">发布记录</Link> },
    ] : []),
    { key: '/about', icon: <InfoCircleOutlined />, label: <Link to="/about">关于</Link> },
  ];
  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selected]}
      items={items}
      onClick={() => setDrawerOpen(false)}
      style={{ borderInlineEnd: 0, background: 'transparent' }}
    />
  );

  return (
    <Layout className="min-h-svh">
      <a href="#main" className="skip-link sr-only focus:not-sr-only focus:p-4">跳转到内容</a>
      <Header className="app-header flex h-16 items-center gap-3 px-4! sm:px-6!">
        <Tooltip title="打开导航">
          <Button
            className="lg:hidden!"
            type="text"
            icon={<MenuOutlined />}
            aria-label="打开导航"
            onClick={() => setDrawerOpen(true)}
          />
        </Tooltip>
        <Link to="/" className="brand-link mr-auto flex items-center gap-3 font-semibold" aria-label={`${project.name} 首页`}>
          <span className="brand-mark grid size-9 place-items-center rounded-lg font-mono text-sm">sp.</span>
          <span className="flex flex-col leading-tight">
            <span>{project.name}</span>
            <Typography.Text type="secondary" className="text-xs font-normal">{project.role}</Typography.Text>
          </span>
        </Link>
        <ThemeSwitcher />
        <Dropdown
          placement="bottomRight"
          menu={{
            items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true }],
            onClick: () => void session.logout(),
          }}
        >
          <Button type="text" loading={session.logoutLoading} className="h-10!">
            <Space size={8}>
              <Avatar size={26} icon={<UserOutlined />} />
              <span className="hidden sm:inline">{user?.displayName}</span>
              <Tag className="hidden sm:inline-flex!">{user?.role === 'super' ? '超级管理员' : '管理员'}</Tag>
            </Space>
          </Button>
        </Dropdown>
      </Header>
      <Layout>
        <Sider width={216} theme="light" className="app-sidebar hidden! lg:block!">
          <nav aria-label="主导航" className="sticky top-0 py-4">{menu}</nav>
        </Sider>
        <Content id="main" tabIndex={-1} className="min-w-0">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </Content>
      </Layout>
      <Drawer
        title={project.name}
        placement="left"
        size={260}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: '12px 0' } }}
      >
        {menu}
      </Drawer>
    </Layout>
  );
}
