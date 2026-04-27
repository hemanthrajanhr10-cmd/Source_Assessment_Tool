import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import Spinner from './components/ui/Spinner'

const NewAssessmentPage      = lazy(() => import('./pages/NewAssessmentPage'))
const JobsPage               = lazy(() => import('./pages/JobsPage'))
const JobDetailPage          = lazy(() => import('./pages/JobDetailPage'))
const HybridConnectionPage   = lazy(() => import('./pages/GatewayPage'))
const SessionsPage           = lazy(() => import('./pages/SessionsPage'))
const SessionDetailPage      = lazy(() => import('./pages/SessionDetailPage'))
const FabricAssessmentPage   = lazy(() => import('./pages/FabricAssessmentPage'))
const FabricSessionsPage     = lazy(() => import('./pages/FabricSessionsPage'))
const FabricSessionDetailPage = lazy(() => import('./pages/FabricSessionDetailPage'))
const LoginPage              = lazy(() => import('./pages/LoginPage'))
const RegisterPage           = lazy(() => import('./pages/RegisterPage'))
const MFASetupPage           = lazy(() => import('./pages/MFASetupPage'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Spinner size="lg" className="text-amber-500" />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Spinner size="lg" className="text-amber-500" />
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
    <Suspense fallback={<PageFallback />}>
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
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/" element={<NewAssessmentPage />} />
                    <Route path="/sessions" element={<SessionsPage />} />
                    <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
                    <Route path="/jobs" element={<JobsPage />} />
                    <Route path="/jobs/:jobId" element={<JobDetailPage />} />
                    <Route path="/gateway" element={<HybridConnectionPage />} />
                    <Route path="/hybrid-connection" element={<HybridConnectionPage />} />
                    <Route path="/fabric/new" element={<FabricAssessmentPage />} />
                    <Route path="/fabric/sessions" element={<FabricSessionsPage />} />
                    <Route path="/fabric/sessions/:sessionId" element={<FabricSessionDetailPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
