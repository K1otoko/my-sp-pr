import { useParams } from 'react-router-dom';
import { DeploymentModuleState } from '../components/DeploymentModuleState';

export function DeployReleaseDetailPage() {
  const { releaseId = '' } = useParams();

  return (
    <DeploymentModuleState
      title="发布详情"
      description={releaseId}
      state="发布批次数据暂不可用"
    />
  );
}
