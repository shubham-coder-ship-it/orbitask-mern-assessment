import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import { LoadingState } from './components/States.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import RequestsPage from './pages/RequestsPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import TeamPage from './pages/TeamPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function Gate({ children, mode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ paddingTop: 80 }}><LoadingState label="Loading Orbitask…" /></div>;
  if (mode === 'private' && !user) return <Navigate to="/login" replace />;
  if (mode === 'public' && user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Gate mode="public"><LoginPage /></Gate>} />
      <Route path="/register" element={<Gate mode="public"><RegisterPage /></Gate>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<Gate mode="private"><AppLayout /></Gate>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
