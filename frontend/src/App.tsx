import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import SplashScreen from './components/ui/SplashScreen'

const NewAssessmentPage          = lazy(() => import('./pages/NewAssessmentPage'))
const JobsPage                   = lazy(() => import('./pages/JobsPage'))
const JobDetailPage              = lazy(() => import('./pages/JobDetailPage'))
const HybridConnectionPage       = lazy(() => import('./pages/GatewayPage'))
const SessionsPage               = lazy(() => import('./pages/SessionsPage'))
const SessionDetailPage          = lazy(() => import('./pages/SessionDetailPage'))
const FabricAssessmentPage       = lazy(() => import('./pages/FabricAssessmentPage'))
const FabricSessionsPage         = lazy(() => import('./pages/FabricSessionsPage'))
const FabricSessionDetailPage    = lazy(() => import('./pages/FabricSessionDetailPage'))
const UnifiedAssessmentPage      = lazy(() => import('./pages/UnifiedAssessmentPage'))
const UnifiedSessionsPage        = lazy(() => import('./pages/UnifiedSessionsPage'))
const UnifiedSessionDetailPage   = lazy(() => import('./pages/UnifiedSessionDetailPage'))
const SapAssessmentPage          = lazy(() => import('./pages/SapAssessmentPage'))
const SapSessionsPage            = lazy(() => import('./pages/SapSessionsPage'))
const SapSessionDetailPage       = lazy(() => import('./pages/SapSessionDetailPage'))
const SageIntacctAssessmentPage  = lazy(() => import('./pages/SageIntacctAssessmentPage'))
const SageIntacctSessionsPage    = lazy(() => import('./pages/SageIntacctSessionsPage'))
const SageIntacctSessionDetailPage = lazy(() => import('./pages/SageIntacctSessionDetailPage'))
const TableauAssessmentPage        = lazy(() => import('./pages/TableauAssessmentPage'))
const TableauSessionsPage          = lazy(() => import('./pages/TableauSessionsPage'))
const TableauSessionDetailPage     = lazy(() => import('./pages/TableauSessionDetailPage'))
const SnowflakeAssessmentPage      = lazy(() => import('./pages/SnowflakeAssessmentPage'))
const SnowflakeSessionsPage        = lazy(() => import('./pages/SnowflakeSessionsPage'))
const SnowflakeSessionDetailPage   = lazy(() => import('./pages/SnowflakeSessionDetailPage'))
const DataverseAssessmentPage      = lazy(() => import('./pages/DataverseAssessmentPage'))
const DataverseSessionsPage        = lazy(() => import('./pages/DataverseSessionsPage'))
const DataverseSessionDetailPage   = lazy(() => import('./pages/DataverseSessionDetailPage'))
const SalesforceAssessmentPage     = lazy(() => import('./pages/SalesforceAssessmentPage'))
const SalesforceSessionsPage       = lazy(() => import('./pages/SalesforceSessionsPage'))
const SalesforceSessionDetailPage  = lazy(() => import('./pages/SalesforceSessionDetailPage'))
const LoginPage                    = lazy(() => import('./pages/LoginPage'))
const RegisterPage               = lazy(() => import('./pages/RegisterPage'))
const MFASetupPage               = lazy(() => import('./pages/MFASetupPage'))
const OAuthCallbackPage          = lazy(() => import('./pages/OAuthCallbackPage'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth()

  // Show splash only on initial load when there is no token yet.
  // If a token is already present, render the layout immediately so the sidebar
  // never disappears during background re-validation after login.
  if (isLoading && !token) {
    return <SplashScreen />
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <Routes>
        {/* Public auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* OAuth SSO callback — public, processes ?token= from backend redirect */}
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />

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
                <Suspense fallback={<SplashScreen />}>
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
                    <Route path="/unified/new" element={<UnifiedAssessmentPage />} />
                    <Route path="/unified/sessions" element={<UnifiedSessionsPage />} />
                    <Route path="/unified/sessions/:sessionId" element={<UnifiedSessionDetailPage />} />
                    <Route path="/sap/new" element={<SapAssessmentPage />} />
                    <Route path="/sap/sessions" element={<SapSessionsPage />} />
                    <Route path="/sap/sessions/:jobId" element={<SapSessionDetailPage />} />
                    <Route path="/sage-intacct/new" element={<SageIntacctAssessmentPage />} />
                    <Route path="/sage-intacct/sessions" element={<SageIntacctSessionsPage />} />
                    <Route path="/sage-intacct/sessions/:jobId" element={<SageIntacctSessionDetailPage />} />
                    <Route path="/tableau/new" element={<TableauAssessmentPage />} />
                    <Route path="/tableau/sessions" element={<TableauSessionsPage />} />
                    <Route path="/tableau/sessions/:jobId" element={<TableauSessionDetailPage />} />
                    <Route path="/snowflake/new" element={<SnowflakeAssessmentPage />} />
                    <Route path="/snowflake/sessions" element={<SnowflakeSessionsPage />} />
                    <Route path="/snowflake/sessions/:jobId" element={<SnowflakeSessionDetailPage />} />
                    <Route path="/dataverse/new" element={<DataverseAssessmentPage />} />
                    <Route path="/dataverse/sessions" element={<DataverseSessionsPage />} />
                    <Route path="/dataverse/sessions/:jobId" element={<DataverseSessionDetailPage />} />
                    <Route path="/salesforce/new" element={<SalesforceAssessmentPage />} />
                    <Route path="/salesforce/sessions" element={<SalesforceSessionsPage />} />
                    <Route path="/salesforce/sessions/:jobId" element={<SalesforceSessionDetailPage />} />
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
