import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AuthErrorPage } from './pages/AuthErrorPage';
import { LoginPage } from './pages/LoginPage';
import { LogoutPage } from './pages/LogoutPage';
import { SessionPage } from './pages/SessionPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<SessionPage />} />
        <Route path="login/:uid" element={<LoginPage />} />
        <Route path="logout" element={<LogoutPage />} />
        <Route path="auth/error" element={<AuthErrorPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
