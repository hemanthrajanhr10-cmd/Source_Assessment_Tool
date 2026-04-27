import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import NewAssessmentPage from './pages/NewAssessmentPage'
import JobsPage from './pages/JobsPage'
import JobDetailPage from './pages/JobDetailPage'
import GatewayPage from './pages/GatewayPage'
import SessionsPage from './pages/SessionsPage'
import SessionDetailPage from './pages/SessionDetailPage'
import FabricAssessmentPage from './pages/FabricAssessmentPage'
import FabricSessionsPage from './pages/FabricSessionsPage'
import FabricSessionDetailPage from './pages/FabricSessionDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MFASetupPage from './pages/MFASetupPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route
        path="/setup-mfa"
        element={
          <RequireAuth>
            <MFASetupPage />
          </RequireAuth>
        }
      />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/" element={<NewAssessmentPage />} />
                <Route path="/sessions" element={<SessionsPage />} />
                <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/jobs/:jobId" element={<JobDetailPage />} />
                <Route path="/gateway" element={<GatewayPage />} />
                <Route path="/fabric/new" element={<FabricAssessmentPage />} />
                <Route path="/fabric/sessions" element={<FabricSessionsPage />} />
                <Route path="/fabric/sessions/:sessionId" element={<FabricSessionDetailPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
