import { Button, Result } from 'antd';
import { useSearchParams } from 'react-router-dom';

const messages: Record<string, string> = {
  AUTH_FLOW_INVALID: '登录流程已过期或无法验证，请重新开始。',
  AUTH_UNAVAILABLE: '统一登录服务暂时不可用，请稍后重试。',
  FORBIDDEN: '当前账号没有管理平台访问权限。',
};

export function AuthErrorPage() {
  const [params] = useSearchParams();
  const code = params.get('code') ?? 'AUTH_FLOW_INVALID';
  return (
    <Result
      status="error"
      title="登录未完成"
      subTitle={messages[code] ?? messages.AUTH_FLOW_INVALID}
      extra={<Button type="primary" href="/api/admin/auth/login">重新登录</Button>}
    />
  );
}
