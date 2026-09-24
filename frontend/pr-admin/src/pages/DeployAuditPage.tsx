import { DeploymentModuleState } from '../components/DeploymentModuleState';

export function DeployAuditPage() {
  return (
    <DeploymentModuleState
      title="审计"
      description="部署平台高风险操作记录。"
      state="审计查询接口暂不可用"
    />
  );
}
