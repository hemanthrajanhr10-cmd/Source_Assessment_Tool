export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface ConnectionTestResponse {
  success: boolean
  message: string
}

export interface ConnectionParams {
  server: string
  port: number
  database: string
  username: string
  password: string
  trust_server_certificate: boolean
  encrypt: boolean
}

export interface AssessmentRequest {
  connection: ConnectionParams
  include_null_analysis: boolean
  null_analysis_sample_limit: number
  label?: string
  gateway_key?: string
}

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
  // Core metadata
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
  // Security assessment (optional – absent on jobs completed before this feature was added)
  db_users_roles?: Record<string, unknown>[]
  orphaned_users?: Record<string, unknown>[]
  db_owner_members?: Record<string, unknown>[]
  dynamic_sql_usage?: Record<string, unknown>[]
  clr_assemblies?: Record<string, unknown>[]
  tde_status?: Record<string, unknown>[]
  column_encryption?: Record<string, unknown>[]
  pii_indicators?: Record<string, unknown>[]
  // Feature usage & risks (optional – same reason)
  sql_agent_jobs?: Record<string, unknown>[]
  linked_servers?: Record<string, unknown>[]
  cross_db_references?: Record<string, unknown>[]
  replication_status?: Record<string, unknown>[]
  service_broker?: Record<string, unknown>[]
  version_features?: Record<string, unknown>[]
}
