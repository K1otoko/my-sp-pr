import { Button, Result } from 'antd';
import { useSearchParams } from 'react-router-dom';

const messages: Record<string, string> = {
  AUTH_FLOW_INVALID: '登录请求未完成或已经失效，请重新发起登录。',
  AUTH_UNAVAILABLE: '登录服务暂时不可用，请稍后重试。',
  FORBIDDEN: '当前账号无法访问此应用。',
};
export function AuthErrorPage() {
  const [params] = useSearchParams();
  return <Result status="warning" title="操作未完成"
    subTitle={messages[params.get('code') ?? ''] ?? '请重新发起登录，或联系管理员。'}
    extra={<Button href="/api/auth/portal/start" type="primary">重新登录</Button>} />;
}
