export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type SessionStatus = 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'
export type DbType = 'mssql' | 'postgres' | 'mysql' | 'oracle'

/** SQL Server access level — determines which assessments are run */
export type AccessLevel = 'db_datareader' | 'view_database_state' | 'db_owner' | 'sysadmin'

export const ACCESS_LEVEL_OPTIONS: { value: AccessLevel; label: string; description: string }[] = [
  {
    value: 'db_datareader',
    label: 'db_datareader (Basic)',
    description: 'Catalog reads, schema analysis, basic security checks',
  },
  {
    value: 'view_database_state',
    label: 'VIEW DATABASE STATE',
    description: 'Adds performance DMVs: missing indexes, fragmentation, index usage, statistics',
  },
  {
    value: 'db_owner',
    label: 'db_owner',
    description: 'Adds object-level permission auditing',
  },
  {
    value: 'sysadmin',
    label: 'sysadmin (Full)',
    description: 'Adds msdb access (agent jobs, backup history), server config, linked servers, login security',
  },
]

/** Minimum required access level per assessment tab */
export const TAB_MIN_ACCESS: Record<string, AccessLevel> = {
  // db_datareader
  schemas: 'db_datareader',
  tables: 'db_datareader',
  columns: 'db_datareader',
  views: 'db_datareader',
  stored_procedures: 'db_datareader',
  functions: 'db_datareader',
  indexes: 'db_datareader',
  relationships: 'db_datareader',
  index_coverage: 'db_datareader',
  null_analysis: 'db_datareader',
  insertion_frequency: 'db_datareader',
  db_users_roles: 'db_datareader',
  orphaned_users: 'db_datareader',
  db_owner_members: 'db_datareader',
  dynamic_sql_usage: 'db_datareader',
  clr_assemblies: 'db_datareader',
  tde_status: 'db_datareader',
  column_encryption: 'db_datareader',
  pii_indicators: 'db_datareader',
  cross_db_references: 'db_datareader',
  replication_status: 'db_datareader',
  service_broker: 'db_datareader',
  version_features: 'db_datareader',
  trustworthy_databases: 'db_datareader',
  deprecated_data_types: 'db_datareader',
  missing_primary_keys: 'db_datareader',
  heap_tables: 'db_datareader',
  untrusted_constraints: 'db_datareader',
  sp_naming_violations: 'db_datareader',
  duplicate_indexes: 'db_datareader',
  database_options_audit: 'db_datareader',
  // db_owner
  object_permissions: 'db_owner',
  // view_database_state
  missing_indexes: 'view_database_state',
  index_usage_stats: 'view_database_state',
  fragmentation_report: 'view_database_state',
  statistics_health: 'view_database_state',
  // sysadmin
  sql_agent_jobs: 'sysadmin',
  linked_servers: 'sysadmin',
  backup_history: 'sysadmin',
  server_configurations: 'sysadmin',
  weak_sql_logins: 'sysadmin',
  server_permissions: 'sysadmin',
  deprecated_features_in_use: 'sysadmin',
}

export const ACCESS_LEVEL_RANK: Record<AccessLevel, number> = {
  db_datareader: 1,
  view_database_state: 2,
  db_owner: 3,
  sysadmin: 4,
}

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
  access_level?: AccessLevel
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
  // Security
  db_users_roles?: Record<string, unknown>[]
  orphaned_users?: Record<string, unknown>[]
  db_owner_members?: Record<string, unknown>[]
  dynamic_sql_usage?: Record<string, unknown>[]
  clr_assemblies?: Record<string, unknown>[]
  tde_status?: Record<string, unknown>[]
  column_encryption?: Record<string, unknown>[]
  pii_indicators?: Record<string, unknown>[]
  // Features & risks
  sql_agent_jobs?: Record<string, unknown>[]
  linked_servers?: Record<string, unknown>[]
  cross_db_references?: Record<string, unknown>[]
  replication_status?: Record<string, unknown>[]
  service_broker?: Record<string, unknown>[]
  version_features?: Record<string, unknown>[]
  // New: Schema / Design (db_datareader)
  trustworthy_databases?: Record<string, unknown>[]
  deprecated_data_types?: Record<string, unknown>[]
  missing_primary_keys?: Record<string, unknown>[]
  heap_tables?: Record<string, unknown>[]
  untrusted_constraints?: Record<string, unknown>[]
  sp_naming_violations?: Record<string, unknown>[]
  duplicate_indexes?: Record<string, unknown>[]
  database_options_audit?: Record<string, unknown>[]
  // New: db_owner
  object_permissions?: Record<string, unknown>[]
  // New: Performance (view_database_state)
  missing_indexes?: Record<string, unknown>[]
  index_usage_stats?: Record<string, unknown>[]
  fragmentation_report?: Record<string, unknown>[]
  statistics_health?: Record<string, unknown>[]
  // New: Server-level (sysadmin)
  backup_history?: Record<string, unknown>[]
  server_configurations?: Record<string, unknown>[]
  weak_sql_logins?: Record<string, unknown>[]
  server_permissions?: Record<string, unknown>[]
  deprecated_features_in_use?: Record<string, unknown>[]
}

// ── Gateway ───────────────────────────────────────────────────────────────────

export interface Gateway {
  gateway_key: string
  name: string
  status: 'online' | 'offline'
  last_seen_at?: string
  created_at: string
  relay_connection_string?: string | null
}

export interface GatewayRegisterResponse {
  gateway_key: string
  name: string
  message: string
}

// ── Hybrid Connections ────────────────────────────────────────────────────────

export interface HybridConnection {
  connection_id: string
  name: string
  endpoint_host: string
  endpoint_port: number
  service_bus_namespace: string
  status: 'created' | 'provisioned' | 'config_missing' | 'error'
  created_at: string
  listener_connection_string?: string | null  // for HCM on-prem agent
  sender_connection_string?: string | null    // for SAT gateway relay config
  error_detail?: string | null
}

export interface CreateHybridConnectionRequest {
  name: string
  endpoint_host: string
  endpoint_port: number
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
  access_level?: AccessLevel
}

export interface SessionRequest {
  label?: string
  servers: ServerTarget[]
  unified_session_id?: string
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

// Lightweight workspace info returned by GET /auth/{id}/workspaces (for the picker)
export interface FabricWorkspaceInfo {
  id: string
  name: string
  type: string
  state: string
  capacity_id: string
  dataset_count: number
  report_count: number
}

export interface FabricWorkspaceItemEntry {
  id: string
  name: string
}

export interface FabricWorkspaceReportEntry {
  id: string
  name: string
  report_type: string
}

export interface FabricWorkspaceItems {
  workspace_id: string
  datasets: FabricWorkspaceItemEntry[]
  reports: FabricWorkspaceReportEntry[]
}

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

// ── Fabric: measure complexity ────────────────────────────────────────────────

export interface MeasureComplexity {
  score: number
  level: 'None' | 'Simple' | 'Moderate' | 'Complex' | 'Very Complex'
  function_count: number
  nesting_depth: number
  dependency_count: number
  complex_functions: string[]
}

export interface MeasureDependency {
  table: string
  column: string
}

export interface FabricMeasure {
  name: string
  table: string
  expression: string
  display_folder: string
  complexity: MeasureComplexity
  dependencies: MeasureDependency[]
}

export interface FabricTableColumn {
  name: string
  data_type: string
  is_calculated: boolean
  is_hidden: boolean
  expression?: string
  complexity?: MeasureComplexity
}

export interface FabricTable {
  name: string
  storage_mode: string
  is_hidden: boolean
  is_calculated: boolean
  columns?: FabricTableColumn[]
}

export interface FabricCalculatedColumn {
  name: string
  table: string
  expression: string
  data_type?: string
  complexity?: MeasureComplexity
}

export interface FabricCalculatedTable {
  name: string
  expression: string
  complexity?: MeasureComplexity
}

export interface FabricRelationship {
  from_table: string
  from_column: string
  to_table: string
  to_column: string
  cardinality: string
  cross_filter: string
  is_active: boolean
}

export interface FabricBookmark {
  id: string
  name: string
  target_page: string
}

// ── Fabric: visual field types ────────────────────────────────────────────────

export interface VisualField {
  field_type: 'column' | 'measure' | 'aggregation' | 'hierarchy'
  name: string
  table: string
  // aggregation only
  column?: string
  agg_function?: string
  // measure only
  expression?: string
  complexity?: MeasureComplexity
  dependencies?: MeasureDependency[]
}

export interface ReportVisual {
  type: string
  title: string
  field_count: number
  fields: VisualField[]
  x?: number
  y?: number
  width?: number
  height?: number
  text_content?: string
}

export interface ReportPage {
  name: string
  order: number
  visual_count: number
  visuals: ReportVisual[]
  page_width?: number
  page_height?: number
}

// ── Fabric: dataset ───────────────────────────────────────────────────────────

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
  relationship_count: number
  complexity_score: number
  info_supported: boolean
  tables: FabricTable[]
  measures: FabricMeasure[]
  calculated_columns: FabricCalculatedColumn[]
  calculated_tables: FabricCalculatedTable[]
  relationships: FabricRelationship[]
}

// ── Fabric: report ────────────────────────────────────────────────────────────

export interface FabricReport {
  id: string
  name: string
  report_type: string
  is_paginated: boolean
  dataset_id: string
  web_url: string
  page_count: number | null
  visual_count: number
  bookmark_count: number
  bookmarks: FabricBookmark[]
  layout_parsed: boolean
  pages: ReportPage[]
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
  total_relationships: number
  total_visuals: number
}

export interface FabricResults {
  assessed_at: string
  workspaces: FabricWorkspace[]
  summary: FabricSummary
}

// ── Fabric: async assessment progress ────────────────────────────────────────

export interface PhaseProgress {
  done: boolean
  count?: number   // discovery
  total?: number   // models / reports
  processed?: number
}

export interface ActivityEvent {
  ts: string
  status: 'ok' | 'error'
  name: string
  type: string
  error?: string
}

export interface AssessmentProgressState {
  assessment_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  phase: 'discovery' | 'semantic_models' | 'reports' | 'crosslinking' | 'saving'
  total_items: number
  processed_items: number
  failed_items: number
  current_item_name: string
  failure_reason: string | null
  phase_progress: {
    discovery: PhaseProgress
    semantic_models: PhaseProgress
    reports: PhaseProgress
    crosslinking: PhaseProgress
    saving: PhaseProgress
  }
  started_at: string
  estimated_completion: string | null
  errors: { item: string; error: string }[]
  activity_log: ActivityEvent[]
}

export interface FabricSessionRecord {
  fabric_session_id: string
  label?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
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

// ── Unified Assessment Session ─────────────────────────────────────────────────

export type AssessmentMode = 'source' | 'fabric' | 'both'
export type UnifiedSessionStatus =
  | 'pending'
  | 'running'
  | 'source_done'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'

export interface UnifiedSessionSourceData {
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

export interface UnifiedSessionFabricData {
  fabric_session_id: string
  label?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  created_at: string
  completed_at?: string
  error?: string
  progress_message?: string
  results?: FabricResults
}

export interface UnifiedSession {
  unified_session_id: string
  label?: string
  mode: AssessmentMode
  status: UnifiedSessionStatus
  created_at: string
  completed_at?: string
  source_session_id?: string
  fabric_session_id?: string
  source_status?: string
  fabric_status?: string
  source?: UnifiedSessionSourceData
  fabric?: UnifiedSessionFabricData
}
