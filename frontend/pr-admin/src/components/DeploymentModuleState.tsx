import { Empty } from 'antd';
import { DeploymentPageHeader } from './DeploymentPageHeader';

export function DeploymentModuleState({
  title,
  description,
  state,
}: {
  title: string;
  description: string;
  state: string;
}) {
  return (
    <div className="space-y-6">
      <DeploymentPageHeader title={title} description={description} />
      <section className="surface-panel grid min-h-80 place-items-center px-6 py-12">
        <Empty description={state} />
      </section>
    </div>
  );
}
