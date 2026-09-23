import { Button, Result, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <section aria-label="页面不存在" className="py-8">
      <Result
        status="404"
        styles={{ root: { paddingInline: 0 } }}
        title={<Typography.Title level={1} className="text-2xl!">这个页面还不存在。</Typography.Title>}
        subTitle="检查访问地址，或返回统一登录。"
        extra={<Button type="primary" onClick={() => void navigate('/')}>返回统一登录</Button>}
      />
    </section>
  );
}
