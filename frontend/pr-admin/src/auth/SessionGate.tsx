import { Alert, Button, Result, Spin } from 'antd';
import { Outlet, useLocation } from 'react-router-dom';
import { useAdminSession } from '../hooks/useAdminSession';

export function SessionGate() {
  const session = useAdminSession();
  const location = useLocation();
  if (session.loading) {
    return <div className="grid min-h-svh place-items-center"><Spin size="large" /></div>;
  }
  if (session.error) {
    return (
      <div className="mx-auto grid min-h-svh max-w-lg place-items-center px-5">
        <Alert
          type="error"
          showIcon
          title="无法确认登录状态"
          description={session.error.message}
          action={<Button onClick={session.refresh}>重试</Button>}
        />
      </div>
    );
  }
  if (!session.session?.authenticated) {
    return (
      <Result
        status="403"
        title="需要登录"
        subTitle="使用统一登录中的管理员账号进入管理平台。"
        extra={(
          <Button
            type="primary"
            onClick={() => session.login(`${location.pathname}${location.search}`)}
          >
            前往统一登录
          </Button>
        )}
      />
    );
  }
  return <Outlet />;
}

export function SuperGate() {
  const session = useAdminSession();
  if (!session.session?.authenticated || session.session.user.role !== 'super') {
    return (
      <Result
        status="403"
        title="无发布权限"
        subTitle="发布模块仅对超级管理员开放。"
        extra={<Button href="/">返回工作台</Button>}
      />
    );
  }
  return <Outlet />;
}
