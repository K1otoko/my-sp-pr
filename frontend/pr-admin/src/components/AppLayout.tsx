import { useState } from 'react';
import {
  AppstoreOutlined, DashboardOutlined, HistoryOutlined, LogoutOutlined, MenuOutlined, RocketOutlined, UserOutlined,
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
  const isDeploymentPlatform = pathname === '/deploy' || pathname.startsWith('/deploy/');
  const canAccessDeployment = user?.role === 'super';
  const showDeploymentNavigation = isDeploymentPlatform && canAccessDeployment;
  const selectedDeploymentItem = pathname.startsWith('/deploy/deployments')
    ? '/deploy/deployments'
    : '/deploy/projects';
  const platformItems = [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    ...(user?.role === 'super' ? [
      { key: '/deploy', icon: <RocketOutlined />, label: <Link to="/deploy/projects">部署平台</Link> },
    ] : []),
  ];
  const deploymentMenu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedDeploymentItem]}
      items={[
        { key: '/deploy/projects', icon: <AppstoreOutlined />, label: <Link to="/deploy/projects">发布项目</Link> },
        { key: '/deploy/deployments', icon: <HistoryOutlined />, label: <Link to="/deploy/deployments">发布记录</Link> },
      ]}
      onClick={() => setDrawerOpen(false)}
      style={{ borderInlineEnd: 0, background: 'transparent' }}
    />
  );

  return (
    <Layout className="min-h-svh">
      <a href="#main" className="skip-link sr-only focus:not-sr-only focus:p-4">跳转到内容</a>
      <Header className="app-header flex h-16 items-center gap-6 px-6!">
        {showDeploymentNavigation && (
          <Tooltip title="打开导航">
            <Button
              className="ml-4! lg:hidden!"
              type="text"
              icon={<MenuOutlined />}
              aria-label="打开导航"
              onClick={() => setDrawerOpen(true)}
            />
          </Tooltip>
        )}
        <Link to="/" className="brand-link flex h-full shrink-0 items-center gap-3 font-semibold" aria-label={`${project.name} 首页`}>
          <span className="brand-mark grid size-9 place-items-center rounded-lg font-mono text-sm">sp.</span>
          <span className="flex flex-col leading-tight">
            <span>{project.name}</span>
            <Typography.Text type="secondary" className="text-xs font-normal">{project.role}</Typography.Text>
          </span>
        </Link>
        <nav aria-label="平台导航" className="platform-nav h-full min-w-0">
          <Menu
            className="platform-menu h-full"
            mode="horizontal"
            selectedKeys={[isDeploymentPlatform && canAccessDeployment ? '/deploy' : '/']}
            items={platformItems}
          />
        </nav>
        <div className="app-header-actions ml-auto flex shrink-0 items-center gap-3 pr-6">
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
        </div>
      </Header>
      <Layout>
        {showDeploymentNavigation && (
          <Sider width={216} theme="light" className="app-sidebar hidden! lg:block!">
            <nav aria-label="部署平台导航" className="sticky top-0 py-4">{deploymentMenu}</nav>
          </Sider>
        )}
        <Content id="main" tabIndex={-1} className="min-w-0">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </Content>
      </Layout>
      {showDeploymentNavigation && (
        <Drawer
          title="部署平台"
          placement="left"
          size={260}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: '12px 0' } }}
        >
          {deploymentMenu}
        </Drawer>
      )}
    </Layout>
  );
}
