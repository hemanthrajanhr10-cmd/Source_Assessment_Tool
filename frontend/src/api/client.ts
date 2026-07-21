import axios from 'axios'
import type {
  AssessmentMode,
  AssessmentProgressState,
  AssessmentRequest,
  AssessmentResponse,
  AssessmentResults,
  ConnectionTestResponse,
  ConnectivityResult,
  CreateHybridConnectionRequest,
  CreateSessionResponse,
  DatabaseInfo,
  FabricAuthStartResponse,
  FabricAuthStatus,
  FabricServicePrincipalAuthRequest,
  FabricServicePrincipalAuthResponse,
  FabricSessionRecord,
  FabricWorkspaceInfo,
  FabricPalStatus,
  FabricPalConfig,
  FabricWorkspaceItems,
  Gateway,
  GatewayRegisterResponse,
  HybridConnection,
  JobStatusResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest,
  SapAssessmentRequest,
  SapAssessmentResult,
  SapJobResponse,
  SapSessionRecord,
  SageIntacctAssessmentRequest,
  SageIntacctAssessmentResult,
  SageIntacctJobResponse,
  SageIntacctSessionRecord,
  TableauAssessmentRequest,
  TableauAssessmentResult,
  WorkbookDeepAnalysis,
  TableauJobResponse,
  TableauSessionRecord,
  SnowflakeAuthRequest,
  SnowflakeAuthStatusResponse,
  SnowflakeAssessmentRequest,
  SnowflakeAssessmentResult,
  SnowflakeJobStatusResponse,
  SnowflakeSessionRecord,
  SessionRequest,
  SessionStatusResponse,
  SetupMFAResponse,
  TokenResponse,
  UnifiedSession,
  VerifyMFARequest,
  Db2ConnectionParams,
  Db2AssessmentResult,
  Db2JobResponse,
  Db2JobStatusResponse,
  Db2SessionRecord,
  InforEngine,
  InforAssessmentRequest,
  InforAssessmentResult,
  InforJobResponse,
  InforJobStatusResponse,
  InforSessionRecord,
  DatabricksAssessmentRequest,
  DatabricksAssessmentResult,
  DatabricksJobResponse,
  DatabricksJobStatusResponse,
  DatabricksSessionRecord,
} from '../types/api'

const BASE_URL = import.meta.env.VITE_API_URL || ''

export const http = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── JWT interceptor: attach token to every request ───────────────────────────
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('sat_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── 401 interceptor: redirect to login if token expired ──────────────────────
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      const isAuthRoute = err.config?.url?.includes('/api/v1/auth/')
      if (!isAuthRoute) {
        localStorage.removeItem('sat_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  },
)

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  register: (data: RegisterRequest) =>
    http.post<TokenResponse>('/api/v1/auth/register', data),

  login: (data: LoginRequest) =>
    http.post<TokenResponse>('/api/v1/auth/login', data),

  requestExtension: (data: { email: string; requested_days: number }) =>
    http.post<{ message: string }>('/api/v1/auth/request-extension', data),

  verifyMFA: (data: VerifyMFARequest) =>
    http.post<TokenResponse>('/api/v1/auth/verify-mfa', data),

  setupMFA: () =>
    http.post<SetupMFAResponse>('/api/v1/auth/setup-mfa'),

  confirmMFA: (code: string) =>
    http.post('/api/v1/auth/confirm-mfa', { code }),

  me: () =>
    http.get<MeResponse>('/api/v1/auth/me'),

  oauthProviders: () =>
    http.get<{ microsoft: boolean; google: boolean; apple: boolean }>('/api/v1/auth/oauth/providers'),

  // ── Single-server assessment ──────────────────────────────────────────────
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

  downloadReport: async (jobId: string, filename: string) => {
    const res = await http.get(`/api/v1/jobs/${jobId}/report`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  downloadWordReport: async (jobId: string, filename: string) => {
    const res = await http.get(`/api/v1/jobs/${jobId}/word-report`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  // ── Gateway ───────────────────────────────────────────────────────────────
  registerGateway: (name: string) =>
    http.post<GatewayRegisterResponse>('/api/v1/gateway/register', { name }),

  listGateways: () =>
    http.get<Gateway[]>('/api/v1/gateway/list'),

  setGatewayRelay: (gateway_key: string, relay_connection_string: string) =>
    http.post<{ ok: boolean; relay_configured: boolean }>('/api/v1/gateway/relay/config', {
      gateway_key,
      relay_connection_string,
    }),

  getAgentDownloadUrl: () =>
    `${BASE_URL}/api/v1/gateway/download`,

  // ── Hybrid Connections ────────────────────────────────────────────────────
  createHybridConnection: (data: CreateHybridConnectionRequest) =>
    http.post<HybridConnection>('/api/v1/hybrid-connections', data),

  listHybridConnections: () =>
    http.get<HybridConnection[]>('/api/v1/hybrid-connections'),

  deleteHybridConnection: (connectionId: string) =>
    http.delete(`/api/v1/hybrid-connections/${connectionId}`),

  rebindHybridConnection: (connectionId: string) =>
    http.post<{ ok: boolean; message: string }>(`/api/v1/hybrid-connections/${connectionId}/rebind`, {}),

  // ── Session (multi-server) ────────────────────────────────────────────────
  detectConnectivity: (servers: { server: string; port: number }[]) =>
    http.post<ConnectivityResult[]>('/api/v1/detect-connectivity', { servers }),

  listDatabases: (connection: {
    db_type?: string; server: string; port: number; database: string
    username: string; password: string
    trust_server_certificate: boolean; encrypt: boolean
    gcp_sa_key?: string; gcp_private_ip?: boolean; azure_managed_identity?: boolean
  }) =>
    http.post<DatabaseInfo[]>('/api/v1/list-databases', { connection }),

  createSession: (data: SessionRequest) =>
    http.post<CreateSessionResponse>('/api/v1/sessions', data),

  listSessions: () =>
    http.get<SessionStatusResponse[]>('/api/v1/sessions'),

  getSessionStatus: (sessionId: string) =>
    http.get<SessionStatusResponse>(`/api/v1/sessions/${sessionId}/status`),

  cancelSession: (sessionId: string) =>
    http.post(`/api/v1/sessions/${sessionId}/cancel`),

  getSessionReportUrl: (sessionId: string) =>
    `${BASE_URL}/api/v1/sessions/${sessionId}/report`,

  downloadSessionReport: async (sessionId: string, filename: string) => {
    const res = await http.get(`/api/v1/sessions/${sessionId}/report`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  downloadSessionWordReport: async (sessionId: string, filename: string) => {
    const res = await http.get(`/api/v1/sessions/${sessionId}/word-report`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
  // ── Fabric Workspace Assessment ───────────────────────────────────────────
  fabricAuthStart: () =>
    http.post<FabricAuthStartResponse>('/api/v1/fabric/auth/start'),

  fabricAuthServicePrincipal: (data: FabricServicePrincipalAuthRequest) =>
    http.post<FabricServicePrincipalAuthResponse>('/api/v1/fabric/auth/service-principal', data),

  fabricAuthStatus: (authId: string) =>
    http.get<FabricAuthStatus>(`/api/v1/fabric/auth/${authId}/status`),

  fabricListWorkspaces: (authId: string) =>
    http.get<FabricWorkspaceInfo[]>(`/api/v1/fabric/auth/${authId}/workspaces`),

  fabricListWorkspaceItems: (authId: string, workspaceIds: string[]) =>
    http.post<FabricWorkspaceItems[]>(`/api/v1/fabric/auth/${authId}/workspace-items`, {
      workspace_ids: workspaceIds,
    }),

  createFabricSession: (data: {
    auth_id: string
    label?: string
    workspace_ids: string[]
    dataset_ids: string[]
    report_ids: string[]
    dataflow_ids: string[]
    unified_session_id?: string
  }) =>
    http.post<{ fabric_session_id: string; status: string }>('/api/v1/fabric/sessions', data),

  listFabricSessions: () =>
    http.get<FabricSessionRecord[]>('/api/v1/fabric/sessions'),

  getFabricSession: (sessionId: string) =>
    http.get<FabricSessionRecord>(`/api/v1/fabric/sessions/${sessionId}`),

  cancelFabricSession: (sessionId: string) =>
    http.post(`/api/v1/fabric/sessions/${sessionId}/cancel`),

  // ── Unified Assessment Sessions ───────────────────────────────────────────
  createUnifiedSession: (data: { mode: AssessmentMode; label?: string }) =>
    http.post<{ unified_session_id: string; mode: AssessmentMode; status: string }>(
      '/api/v1/unified-sessions',
      data,
    ),

  listUnifiedSessions: () =>
    http.get<UnifiedSession[]>('/api/v1/unified-sessions'),

  getUnifiedSession: (id: string) =>
    http.get<UnifiedSession>(`/api/v1/unified-sessions/${id}`),

  getFabricSessionProgress: (sessionId: string) =>
    http.get<AssessmentProgressState>(`/api/v1/fabric/sessions/${sessionId}/progress`),

  downloadFabricExcel: async (sessionId: string, label?: string) => {
    const res = await http.get(
      `/api/v1/fabric/sessions/${sessionId}/export/excel`,
      { responseType: 'blob' },
    )
    const filename = `${(label || 'fabric-assessment').replace(/\s+/g, '_')}_${sessionId.slice(0, 8)}.xlsx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  downloadFabricWord: async (sessionId: string, label?: string, regenerate = false) => {
    const params = regenerate ? '?regenerate=true' : ''
    const res = await http.get(
      `/api/v1/fabric/sessions/${sessionId}/export/word${params}`,
      { responseType: 'blob' },
    )
    const filename = `${(label || 'fabric-assessment').replace(/\s+/g, '_')}_${sessionId.slice(0, 8)}.docx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  // ── Fabric PAL (Partner Admin Link) ───────────────────────────────────────
  getFabricPalConfig: () =>
    http.get<FabricPalConfig>('/api/v1/fabric/pal/config'),

  getFabricPalStatus: (sessionId: string) =>
    http.get<FabricPalStatus>(`/api/v1/fabric/sessions/${sessionId}/pal-status`),

  linkFabricPal: (sessionId: string, aadAccessToken: string) =>
    http.post<FabricPalStatus>(`/api/v1/fabric/sessions/${sessionId}/pal-link`, {
      aad_access_token: aadAccessToken,
    }),

  // ── SAP Assessments ───────────────────────────────────────────────────────
  sapTestConnection: (data: SapAssessmentRequest) =>
    http.post<{ success: boolean; message: string; system_info?: Record<string, string> }>(
      '/api/v1/sap/test-connection',
      data,
    ),

  sapStartAssessment: (data: SapAssessmentRequest) =>
    http.post<SapJobResponse>('/api/v1/sap/assess', data),

  sapGetJobStatus: (jobId: string) =>
    http.get<{ job_id: string; status: string; progress_message?: string; error?: string }>(
      `/api/v1/sap/jobs/${jobId}/status`,
    ),

  sapGetJobResults: (jobId: string) =>
    http.get<SapAssessmentResult>(`/api/v1/sap/jobs/${jobId}/results`),

  sapListSessions: () =>
    http.get<SapSessionRecord[]>('/api/v1/sap/sessions'),

  sapDownloadReport: async (jobId: string, label?: string) => {
    const res = await http.get(`/api/v1/sap/jobs/${jobId}/report`, { responseType: 'blob' })
    const filename = `${(label || 'sap-assessment').replace(/\s+/g, '_')}_${jobId.slice(0, 8)}.xlsx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  // ── Sage Intacct Assessments ──────────────────────────────────────────────
  sageTestConnection: (data: SageIntacctAssessmentRequest) =>
    http.post<{ success: boolean; message: string; company_name?: string }>(
      '/api/v1/sage-intacct/test-connection',
      data,
    ),

  sageStartAssessment: (data: SageIntacctAssessmentRequest) =>
    http.post<SageIntacctJobResponse>('/api/v1/sage-intacct/assess', data),

  sageGetJobStatus: (jobId: string) =>
    http.get<{ job_id: string; status: string; progress_message?: string; error?: string }>(
      `/api/v1/sage-intacct/jobs/${jobId}/status`,
    ),

  sageGetJobResults: (jobId: string) =>
    http.get<SageIntacctAssessmentResult>(`/api/v1/sage-intacct/jobs/${jobId}/results`),

  sageListSessions: () =>
    http.get<SageIntacctSessionRecord[]>('/api/v1/sage-intacct/sessions'),

  sageDownloadExcelReport: async (jobId: string, label?: string) => {
    const res = await http.get(`/api/v1/sage-intacct/jobs/${jobId}/report`, { responseType: 'blob' })
    const filename = `${(label || 'sage-intacct-assessment').replace(/\s+/g, '_')}_${jobId.slice(0, 8)}.xlsx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  sageDownloadWordReport: async (jobId: string, label?: string) => {
    const res = await http.get(`/api/v1/sage-intacct/jobs/${jobId}/word-report`, { responseType: 'blob' })
    const filename = `${(label || 'sage-intacct-assessment').replace(/\s+/g, '_')}_${jobId.slice(0, 8)}.docx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  // ── Tableau Assessments ───────────────────────────────────────────────────
  tableauTestConnection: (data: TableauAssessmentRequest) =>
    http.post<{ success: boolean; message: string; server_version?: string; site_id?: string }>(
      '/api/v1/tableau/test-connection',
      data,
    ),

  tableauStartAssessment: (data: TableauAssessmentRequest) =>
    http.post<TableauJobResponse>('/api/v1/tableau/assess', data),

  tableauGetJobStatus: (jobId: string) =>
    http.get<{ job_id: string; status: string; progress_message?: string; error?: string }>(
      `/api/v1/tableau/jobs/${jobId}/status`,
    ),

  tableauGetJobResults: (jobId: string) =>
    http.get<TableauAssessmentResult>(`/api/v1/tableau/jobs/${jobId}/results`),

  tableauListSessions: () =>
    http.get<TableauSessionRecord[]>('/api/v1/tableau/sessions'),

  tableauDownloadExcelReport: async (jobId: string, label?: string) => {
    const res = await http.get(`/api/v1/tableau/jobs/${jobId}/report`, { responseType: 'blob' })
    const filename = `${(label || 'tableau-assessment').replace(/\s+/g, '_')}_${jobId.slice(0, 8)}.xlsx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  tableauDownloadWordReport: async (jobId: string, label?: string) => {
    const res = await http.get(`/api/v1/tableau/jobs/${jobId}/word-report`, { responseType: 'blob' })
    const filename = `${(label || 'tableau-assessment').replace(/\s+/g, '_')}_${jobId.slice(0, 8)}.docx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  tableauRegenerateWordReport: async (jobId: string, label?: string) => {
    const res = await http.post(`/api/v1/tableau/jobs/${jobId}/regenerate-word-report`, {}, { responseType: 'blob' })
    const filename = `${(label || 'tableau-assessment').replace(/\s+/g, '_')}_${jobId.slice(0, 8)}_ai.docx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  tableauGetWorkbookAnalysis: (jobId: string) =>
    http.get<WorkbookDeepAnalysis[]>(`/api/v1/tableau/jobs/${jobId}/workbook-analysis`),

  // ── Snowflake Assessments ─────────────────────────────────────────────────
  snowflakeInitAuth: (data: SnowflakeAuthRequest) =>
    http.post<{ auth_id: string }>('/api/v1/snowflake/init-auth', data),

  snowflakeAuthStatus: (authId: string) =>
    http.get<SnowflakeAuthStatusResponse>(`/api/v1/snowflake/auth-status/${authId}`),

  snowflakeAssess: (data: SnowflakeAssessmentRequest) =>
    http.post<{ job_id: string; status: string }>('/api/v1/snowflake/assess', data),

  snowflakeJobStatus: (jobId: string) =>
    http.get<SnowflakeJobStatusResponse>(`/api/v1/snowflake/jobs/${jobId}/status`),

  snowflakeJobResults: (jobId: string) =>
    http.get<SnowflakeAssessmentResult>(`/api/v1/snowflake/jobs/${jobId}/results`),

  snowflakeListSessions: () =>
    http.get<SnowflakeSessionRecord[]>('/api/v1/snowflake/sessions'),

  snowflakeDownloadExcel: async (jobId: string) => {
    const res = await http.get(`/api/v1/snowflake/jobs/${jobId}/report`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `snowflake_assessment_${jobId.slice(0, 8)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  },

  snowflakeDownloadWord: async (jobId: string) => {
    const res = await http.get(`/api/v1/snowflake/jobs/${jobId}/word-report`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `snowflake_assessment_${jobId.slice(0, 8)}.docx`
    a.click()
    URL.revokeObjectURL(url)
  },

  // ── IBM Db2 Assessments ───────────────────────────────────────────────────
  db2TestConnection: (data: Db2ConnectionParams) =>
    http.post<{ success: boolean; message: string; service_level?: string; host_name?: string }>(
      '/api/v1/db2/test-connection',
      data,
    ),

  db2Assess: (data: Db2ConnectionParams) =>
    http.post<Db2JobResponse>('/api/v1/db2/assess', data),

  db2JobStatus: (jobId: string) =>
    http.get<Db2JobStatusResponse>(`/api/v1/db2/jobs/${jobId}/status`),

  db2JobResults: (jobId: string) =>
    http.get<Db2AssessmentResult>(`/api/v1/db2/jobs/${jobId}/results`),

  db2ListSessions: () =>
    http.get<Db2SessionRecord[]>('/api/v1/db2/sessions'),

  db2DownloadExcel: async (jobId: string, label?: string) => {
    const res = await http.get(`/api/v1/db2/jobs/${jobId}/report`, { responseType: 'blob' })
    const filename = `${(label || 'ibm_db2_assessment').replace(/\s+/g, '_')}_${jobId.slice(0, 8)}.xlsx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  // ── Infor CloudSuite Assessments ──────────────────────────────────────────
  inforTestConnection: (data: InforAssessmentRequest) =>
    http.post<{ ok: boolean; tenant_id?: string; tenant_name?: string; detected_engine?: InforEngine; engine_label?: string; ion_api_version?: string; error?: string }>(
      '/api/v1/infor/test-connection',
      data,
    ),

  inforStartAssessment: (data: InforAssessmentRequest) =>
    http.post<InforJobResponse>('/api/v1/infor/assess', data),

  inforGetJobStatus: (jobId: string) =>
    http.get<InforJobStatusResponse>(`/api/v1/infor/jobs/${jobId}/status`),

  inforGetJobResults: (jobId: string) =>
    http.get<InforAssessmentResult>(`/api/v1/infor/jobs/${jobId}/results`),

  inforListSessions: () =>
    http.get<InforSessionRecord[]>('/api/v1/infor/sessions'),

  inforDownloadExcel: async (jobId: string, engine?: string, label?: string) => {
    const res = await http.get(`/api/v1/infor/jobs/${jobId}/report`, { responseType: 'blob' })
    const filename = `infor_${engine || 'assessment'}_${(label || '').replace(/\s+/g, '_')}_${jobId.slice(0, 8)}.xlsx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  // ── Databricks Assessments ────────────────────────────────────────────────
  databricksTestConnection: (data: DatabricksAssessmentRequest) =>
    http.post<{ ok: boolean; user_name?: string; workspace_url?: string; error?: string }>(
      '/api/v1/databricks/test-connection',
      data,
    ),

  databricksStartAssessment: (data: DatabricksAssessmentRequest) =>
    http.post<DatabricksJobResponse>('/api/v1/databricks/assess', data),

  databricksGetJobStatus: (jobId: string) =>
    http.get<DatabricksJobStatusResponse>(`/api/v1/databricks/jobs/${jobId}/status`),

  databricksGetJobResults: (jobId: string) =>
    http.get<DatabricksAssessmentResult>(`/api/v1/databricks/jobs/${jobId}/results`),

  databricksListSessions: () =>
    http.get<DatabricksSessionRecord[]>('/api/v1/databricks/sessions'),

  databricksDownloadExcel: async (jobId: string, label?: string) => {
    const res = await http.get(`/api/v1/databricks/jobs/${jobId}/report`, { responseType: 'blob' })
    const filename = `databricks_${(label || 'assessment').replace(/\s+/g, '_')}_${jobId.slice(0, 8)}.xlsx`
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

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
