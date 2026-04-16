export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type SessionStatus = 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'
export type DbType = 'mssql' | 'postgres' | 'mysql' | 'oracle'

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string
  password: string
  full_name?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface VerifyMFARequest {
  email: string
  code: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  mfa_required: boolean
}

export interface MeResponse {
  user_id: string
  email: string
  full_name?: string
  mfa_enabled: boolean
  created_at: string
}

export interface SetupMFAResponse {
  secret: string
  qr_code: string
  uri: string
}

// ── Connection ────────────────────────────────────────────────────────────────

export interface ConnectionParams {
  db_type: DbType
  server: string
  port: number
  database: string
  username: string
  password: string
  trust_server_certificate: boolean
  encrypt: boolean
}

// ── Single-server assessment (legacy + still supported) ───────────────────────

export interface AssessmentRequest {
  connection: ConnectionParams
  include_null_analysis: boolean
  null_analysis_sample_limit: number
  label?: string
  gateway_key?: string
}

export interface ConnectionTestResponse {
  success: boolean
  message: string
}

export interface AssessmentResponse {
  job_id: string
  status: JobStatus
  message: string
}

export interface JobStatusResponse {
  job_id: string
  status: JobStatus
  label?: string
  created_at: string
  started_at?: string
  completed_at?: string
  error?: string
  progress_message?: string
  session_id?: string
  server_name?: string
  database_name?: string
}

export interface OverviewResult {
  database_name: string
  connected_user: string
  sql_server_version: string
  schema_count: number
  table_count: number
  view_count: number
  stored_proc_count: number
  function_count: number
  total_size_mb?: number
}

export interface AssessmentResults {
  job_id: string
  overview?: OverviewResult
  schemas: Record<string, unknown>[]
  tables: Record<string, unknown>[]
  columns: Record<string, unknown>[]
  views: Record<string, unknown>[]
  stored_procedures: Record<string, unknown>[]
  functions: Record<string, unknown>[]
  indexes: Record<string, unknown>[]
  relationships: Record<string, unknown>[]
  index_coverage: Record<string, unknown>[]
  insertion_frequency: Record<string, unknown>[]
  null_analysis: Record<string, unknown>[]
  db_users_roles?: Record<string, unknown>[]
  orphaned_users?: Record<string, unknown>[]
  db_owner_members?: Record<string, unknown>[]
  dynamic_sql_usage?: Record<string, unknown>[]
  clr_assemblies?: Record<string, unknown>[]
  tde_status?: Record<string, unknown>[]
  column_encryption?: Record<string, unknown>[]
  pii_indicators?: Record<string, unknown>[]
  sql_agent_jobs?: Record<string, unknown>[]
  linked_servers?: Record<string, unknown>[]
  cross_db_references?: Record<string, unknown>[]
  replication_status?: Record<string, unknown>[]
  service_broker?: Record<string, unknown>[]
  version_features?: Record<string, unknown>[]
}

// ── Gateway ───────────────────────────────────────────────────────────────────

export interface Gateway {
  gateway_key: string
  name: string
  status: 'online' | 'offline'
  last_seen_at?: string
  created_at: string
}

export interface GatewayRegisterResponse {
  gateway_key: string
  name: string
  message: string
}

// ── Multi-server session ──────────────────────────────────────────────────────

export interface DatabaseTarget {
  name: string
  include_null_analysis: boolean
  null_analysis_sample_limit: number
}

export interface ServerTarget {
  db_type: DbType
  server: string
  port: number
  username: string
  password: string
  trust_server_certificate: boolean
  encrypt: boolean
  databases: DatabaseTarget[]
  use_gateway: boolean
  gateway_key?: string
}

export interface SessionRequest {
  label?: string
  servers: ServerTarget[]
}

export interface CreateSessionResponse {
  session_id: string
  status: string
  total_jobs: number
}

export interface ConnectivityResult {
  server: string
  port: number
  reachable: boolean
  latency_ms: number | null
}

export interface DatabaseInfo {
  name: string
  size_mb: number | null
  state: string
}

// ── Fabric Workspace Assessment ───────────────────────────────────────────────

export interface FabricAuthStartResponse {
  auth_id: string
  user_code: string
  verification_url: string
  expires_at: string
}

export interface FabricAuthStatus {
  status: 'starting' | 'pending' | 'ready' | 'error' | 'not_found'
  error?: string
}

export interface FabricMeasure {
  name: string
  expression: string
  display_folder: string
}

export interface FabricTable {
  name: string
  storage_mode: string
  is_hidden: boolean
}

export interface FabricDataset {
  id: string
  name: string
  configured_by: string
  is_refreshable: boolean
  storage_mode: string
  web_url: string
  table_count: number
  measure_count: number
  calculated_column_count: number
  calculated_table_count: number
  complexity_score: number
  tables: FabricTable[]
  measures: FabricMeasure[]
  calculated_columns: { name: string; expression: string }[]
  calculated_tables: { name: string; expression: string }[]
}

export interface FabricReport {
  id: string
  name: string
  report_type: string
  is_paginated: boolean
  dataset_id: string
  web_url: string
  page_count: number | null
}

export interface FabricWorkspace {
  id: string
  name: string
  type: string
  state: string
  dataset_count: number
  report_count: number
  paginated_report_count: number
  datasets: FabricDataset[]
  reports: FabricReport[]
}

export interface FabricSummary {
  workspace_count: number
  dataset_count: number
  report_count: number
  paginated_report_count: number
  total_measures: number
  total_calculated_tables: number
  total_calculated_columns: number
}

export interface FabricResults {
  assessed_at: string
  workspaces: FabricWorkspace[]
  summary: FabricSummary
}

export interface FabricSessionRecord {
  fabric_session_id: string
  label?: string
  status: 'running' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  error?: string
  progress_message?: string
  results?: FabricResults
}

export interface SessionJobInfo {
  job_id: string
  server: string
  database: string
  status: JobStatus
  progress_message?: string
  error?: string
  started_at?: string
  completed_at?: string
}

export interface SessionStatusResponse {
  session_id: string
  label?: string
  status: SessionStatus
  total_jobs: number
  completed_jobs: number
  failed_jobs: number
  created_at: string
  completed_at?: string
  jobs: SessionJobInfo[]
}
