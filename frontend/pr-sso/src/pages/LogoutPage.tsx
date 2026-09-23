import { useEffect } from 'react';
import { Button, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { AuthCard, AuthFailure, AuthLoading } from '../components/AuthStatus';
import { useLogoutContext } from '../hooks/useAuth';

export function LogoutPage() {
  const [params] = useSearchParams();
  const context = useLogoutContext(params.get('flow') ?? '');
  useEffect(() => {
    const policy = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    if (!policy) return;
    const previous = policy.content;
    // no-referrer 会令原生表单 POST 的 Origin 为 null；只允许同源引用信息。
    policy.content = 'same-origin';
    return () => { policy.content = previous; };
  }, []);
  return (
    <AuthCard title="退出此浏览器的登录？" description="你在此浏览器中的统一登录和关联授权将结束，其他设备保持登录。">
      {context.loading ? <AuthLoading text="正在检查退出请求…" /> : context.error ? <AuthFailure error={context.error} /> : context.data ? (
        <form method="post" action={context.data.action}>
          <Typography.Paragraph type="secondary">发起应用：{context.data.clientName}</Typography.Paragraph>
          <input type="hidden" name="xsrf" value={context.data.xsrf} />
          <input type="hidden" name="logout" value="yes" />
          <div className="mt-6 flex gap-3">
            <Button href="/" className="flex-1">取消</Button>
            <Button type="primary" htmlType="submit" className="flex-1">确认退出</Button>
          </div>
        </form>
      ) : <AuthFailure error={new Error('退出请求不存在或已经失效')} />}
    </AuthCard>
  );
}
