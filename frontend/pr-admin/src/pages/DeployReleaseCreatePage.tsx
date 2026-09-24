import { DeploymentModuleState } from '../components/DeploymentModuleState';

export function DeployReleaseCreatePage() {
  return (
    <DeploymentModuleState
      title="新建发布"
      description="创建单应用发布或同一版本的整组发布。"
      state="发布编排接口暂不可用"
    />
  );
}
