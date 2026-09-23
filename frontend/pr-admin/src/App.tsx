import { Route, Routes } from 'react-router-dom';
import { AdminSessionProvider } from './auth/AdminSessionProvider';
import { SessionGate, SuperGate } from './auth/SessionGate';
import { AppLayout } from './components/AppLayout';
import { AboutPage } from './pages/AboutPage';
import { AuthErrorPage } from './pages/AuthErrorPage';
import { DeploymentDetailPage } from './pages/DeploymentDetailPage';
import { DeployEnvironmentPage } from './pages/DeployEnvironmentPage';
import { DeploymentsPage } from './pages/DeploymentsPage';
import { DeployProjectPage } from './pages/DeployProjectPage';
import { DeployProjectsPage } from './pages/DeployProjectsPage';
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
              <Route path="deploy/projects" element={<DeployProjectsPage />} />
              <Route path="deploy/projects/:projectId" element={<DeployProjectPage />} />
              <Route path="deploy/projects/:projectId/environments/:environmentId" element={<DeployEnvironmentPage />} />
              <Route path="deploy/deployments" element={<DeploymentsPage />} />
              <Route path="deploy/deployments/:deploymentId" element={<DeploymentDetailPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </AdminSessionProvider>
  );
}
