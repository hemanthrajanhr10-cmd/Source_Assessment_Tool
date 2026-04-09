import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import NewAssessmentPage from './pages/NewAssessmentPage'
import JobsPage from './pages/JobsPage'
import JobDetailPage from './pages/JobDetailPage'
import GatewayPage from './pages/GatewayPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<NewAssessmentPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:jobId" element={<JobDetailPage />} />
        <Route path="/gateway" element={<GatewayPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
