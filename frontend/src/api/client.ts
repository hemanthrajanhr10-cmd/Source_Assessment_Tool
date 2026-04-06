import axios from 'axios'
import type {
  AssessmentRequest,
  AssessmentResponse,
  AssessmentResults,
  ConnectionTestResponse,
  JobStatusResponse,
} from '../types/api'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const http = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

export const api = {
  testConnection: (data: AssessmentRequest) =>
    http.post<ConnectionTestResponse>('/api/v1/test-connection', data),

  triggerAssessment: (data: AssessmentRequest) =>
    http.post<AssessmentResponse>('/api/v1/assess', data),

  listJobs: () =>
    http.get<JobStatusResponse[]>('/api/v1/jobs'),

  getJobStatus: (jobId: string) =>
    http.get<JobStatusResponse>(`/api/v1/jobs/${jobId}/status`),

  getJobResults: (jobId: string) =>
    http.get<AssessmentResults>(`/api/v1/jobs/${jobId}/results`),

  getReportUrl: (jobId: string) =>
    `${BASE_URL}/api/v1/jobs/${jobId}/report`,
}

export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join(', ')
    return err.message
  }
  return 'An unexpected error occurred'
}
