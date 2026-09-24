import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminSessionProvider } from './auth/AdminSessionProvider';
import { SessionGate, SuperGate } from './auth/SessionGate';
import { AppLayout } from './components/AppLayout';
import { AboutPage } from './pages/AboutPage';
import { AuthErrorPage } from './pages/AuthErrorPage';
import { DeployAuditPage } from './pages/DeployAuditPage';
import { DeploymentDetailPage } from './pages/DeploymentDetailPage';
import { DeployEnvironmentPage } from './pages/DeployEnvironmentPage';
import { DeployOverviewPage } from './pages/DeployOverviewPage';
import { DeployProjectPage } from './pages/DeployProjectPage';
import { DeployProjectsPage } from './pages/DeployProjectsPage';
import { DeployRepositoriesPage } from './pages/DeployRepositoriesPage';
import { DeployRepositoryDetailPage } from './pages/DeployRepositoryDetailPage';
import { DeployReleaseCreatePage } from './pages/DeployReleaseCreatePage';
import { DeployReleaseDetailPage } from './pages/DeployReleaseDetailPage';
import { DeployReleasesPage } from './pages/DeployReleasesPage';
import { DeployTargetDetailPage } from './pages/DeployTargetDetailPage';
import { DeployTargetsPage } from './pages/DeployTargetsPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <AdminSessionProvider>
      <Routes>
        <Route path="auth/error" element={<AuthErrorPage />} />
        <Route element={<SessionGate />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="about" element={<AboutPage />} />
            <Route element={<SuperGate />}>
              <Route path="deploy" element={<DeployOverviewPage />} />
              <Route path="deploy/repositories" element={<DeployRepositoriesPage />} />
              <Route path="deploy/repositories/:repositoryId" element={<DeployRepositoryDetailPage />} />
              <Route path="deploy/projects" element={<DeployProjectsPage />} />
              <Route path="deploy/projects/:projectId" element={<DeployProjectPage />} />
              <Route path="deploy/projects/:projectId/environments/:environmentId" element={<DeployEnvironmentPage />} />
              <Route path="deploy/targets" element={<DeployTargetsPage />} />
              <Route path="deploy/targets/:targetKey" element={<DeployTargetDetailPage />} />
              <Route path="deploy/releases" element={<DeployReleasesPage />} />
              <Route path="deploy/releases/new" element={<DeployReleaseCreatePage />} />
              <Route path="deploy/releases/:releaseId" element={<DeployReleaseDetailPage />} />
              <Route path="deploy/audit" element={<DeployAuditPage />} />
              <Route path="deploy/deployments" element={<Navigate to="/deploy/releases" replace />} />
              <Route path="deploy/deployments/:deploymentId" element={<DeploymentDetailPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </AdminSessionProvider>
  );
}
