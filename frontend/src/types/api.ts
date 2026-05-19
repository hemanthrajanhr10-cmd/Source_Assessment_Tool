export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type SessionStatus = 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'
export type DbType = 'mssql' | 'postgres' | 'mysql' | 'oracle'

// ── SAP ───────────────────────────────────────────────────────────────────────

export type SapVariant =
  | 'ecc'
  | 's4hana'
  | 'bw'
  | 'hana'
  | 'crm'
  | 'srm'
  | 'scm'
  | 'pi_po'
  | 'mdg'
  | 'successfactors'

export type SapConnectivityProtocol = 'rfc' | 'jdbc' | 'rest' | 'odata'

export interface SapVariantMeta {
  value: SapVariant
  label: string
  shortLabel: string
  protocol: SapConnectivityProtocol
  description: string
}

export const SAP_VARIANTS: SapVariantMeta[] = [
  { value: 'ecc',            label: 'SAP ECC',                       shortLabel: 'ECC',           protocol: 'rfc',   description: 'ERP Central Component — RFC, ABAP programs, module volumes' },
  { value: 's4hana',         label: 'SAP S/4HANA',                   shortLabel: 'S/4HANA',       protocol: 'rfc',   description: 'On-premise & Cloud — Fiori apps, BAdIs, migration objects' },
  { value: 'bw',             label: 'SAP BW / BW/4HANA',             shortLabel: 'BW',            protocol: 'rfc',   description: 'Business Warehouse — InfoProviders, Process Chains, DTPs' },
  { value: 'hana',           label: 'SAP HANA (Standalone)',          shortLabel: 'HANA',          protocol: 'jdbc',  description: 'In-memory DB — schemas, column/row store, calculation views' },
  { value: 'crm',            label: 'SAP CRM',                       shortLabel: 'CRM',           protocol: 'rfc',   description: 'Customer Relationship Management — BPs, IC config, campaigns' },
  { value: 'srm',            label: 'SAP SRM',                       shortLabel: 'SRM',           protocol: 'rfc',   description: 'Supplier Relationship Management — vendors, POs, catalogs' },
  { value: 'scm',            label: 'SAP SCM / APO',                 shortLabel: 'SCM',           protocol: 'rfc',   description: 'Supply Chain — liveCache, planning areas, CIF systems' },
  { value: 'pi_po',          label: 'SAP PI / PO',                   shortLabel: 'PI/PO',         protocol: 'rest',  description: 'Process Integration — iFlows, adapters, message monitoring' },
  { value: 'mdg',            label: 'SAP MDG',                       shortLabel: 'MDG',           protocol: 'rfc',   description: 'Master Data Governance — governed entities, change requests' },
  { value: 'successfactors', label: 'SAP SuccessFactors',            shortLabel: 'SFSF',          protocol: 'odata', description: 'Cloud HCM — modules, employees, MDF objects, integrations' },
]

/** RFC-based connection parameters (ECC, S/4HANA, BW, CRM, SRM, SCM, MDG) */
export interface SapRfcParams {
  host: string
  sysnr: string
  client: string
  username: string
  password: string
}

/** OData/REST extension used by S/4HANA alongside RFC */
export interface SapODataParams {
  api_base_url: string
}

/** JDBC connection parameters for standalone SAP HANA */
export interface SapHanaParams {
  host: string
  port: number
  instance_number: string
  schema: string
  username: string
  password: string
}

/** REST/HTTP parameters for SAP PI/PO */
export interface SapPiPoParams {
  host: string
  port: number
  username: string
  password: string
  use_https: boolean
}

/** OAuth2 + OData parameters for SAP SuccessFactors */
export interface SapSuccessFactorsParams {
  api_url: string
  company_id: string
  client_id: string
  client_secret: string
  user_id: string
}

export interface SapAssessmentRequest {
  variant: SapVariant
  label?: string
  /** RFC variants */
  rfc?: SapRfcParams
  /** S/4HANA OData extension */
  odata?: SapODataParams
  /** HANA JDBC */
  hana?: SapHanaParams
  /** PI/PO REST */
  pi_po?: SapPiPoParams
  /** SuccessFactors OAuth2 */
  successfactors?: SapSuccessFactorsParams
}

// ── SAP Assessment Result ─────────────────────────────────────────────────────

export interface SapSystemInfo {
  system_id: string
  client: string
  basis_release: string
  kernel_version: string
  os_platform: string
  db_layer: string
}

export interface SapObjectInventory {
  total_repository_objects: number
  custom_objects: number
  standard_objects: number
  custom_ratio_pct: number
  deprecated_objects: number
}

export interface SapDataVolume {
  key_object: string
  row_count: number
  size_mb: number
}

export interface SapUserProfile {
  active_users: number
  locked_users: number
  dialog_users: number
  system_users: number
  role_count: number
  profile_count: number
}

export interface SapPerformanceIndicators {
  avg_response_ms: number
  active_background_jobs: number
  work_process_utilization_pct: number
  short_dumps_last_24h: number
}

export interface SapExtractionReadiness {
  supported_methods: string[]
  delta_enabled_objects: number
  existing_extractors: number
  odp_available: boolean
  slt_configured: boolean
}

// Variant-specific detail blocks
export interface SapEccDetails {
  z_table_count: number
  standard_table_count: number
  z_table_ratio_pct: number
  abap_program_count: number
  transport_landscape: string[]
  module_volumes: Record<string, number>
}

export interface SapS4HanaDetails {
  activated_business_functions: number
  fiori_app_count: number
  embedded_hana: boolean
  badi_count: number
  enhancement_spot_count: number
  migration_object_count: number
}

export interface SapBwDetails {
  info_cube_count: number
  dso_adso_count: number
  info_object_count: number
  composite_provider_count: number
  multi_provider_count: number
  process_chain_count: number
  transformation_count: number
  dtp_count: number
  source_system_connections: number
  query_workbook_count: number
  delta_mechanism_types: string[]
}

export interface SapHanaDetails {
  schema_count: number
  row_store_tables: number
  column_store_tables: number
  calculation_views: number
  analytic_views: number
  attribute_views: number
  stored_procedures: number
  sql_script_objects: number
  replication_status: string
  total_data_volume_gb: number
}

export interface SapCrmDetails {
  business_partner_count: number
  ic_profiles: number
  campaign_objects: number
  middleware_queues: number
  custom_objects: number
}

export interface SapSrmDetails {
  vendor_master_count: number
  shopping_cart_count: number
  purchase_order_count: number
  catalog_items: number
  workflow_tasks: number
  backend_system_connections: number
}

export interface SapScmDetails {
  live_cache_status: string
  planning_area_count: number
  model_version_count: number
  cif_connected_systems: number
  data_object_count: number
}

export interface SapPiPoDetails {
  iflow_count: number
  interface_count: number
  adapter_types: string[]
  avg_daily_messages: number
  error_rate_pct: number
  business_systems: number
}

export interface SapMdgDetails {
  governed_entity_types: number
  workflow_rule_count: number
  governance_model: string
  open_change_requests: number
  consolidation_rules: number
}

export interface SapSuccessFactorsDetails {
  active_modules: string[]
  employee_count: number
  mdf_object_count: number
  integration_center_connections: number
  replication_status: string
}

export interface SapAssessmentResult {
  job_id: string
  variant: SapVariant
  label?: string
  assessed_at: string
  status: 'completed' | 'failed'
  error?: string
  system_info?: SapSystemInfo
  object_inventory?: SapObjectInventory
  data_volumes?: SapDataVolume[]
  user_profile?: SapUserProfile
  performance?: SapPerformanceIndicators
  extraction_readiness?: SapExtractionReadiness
  // Variant-specific
  ecc?: SapEccDetails
  s4hana?: SapS4HanaDetails
  bw?: SapBwDetails
  hana?: SapHanaDetails
  crm?: SapCrmDetails
  srm?: SapSrmDetails
  scm?: SapScmDetails
  pi_po?: SapPiPoDetails
  mdg?: SapMdgDetails
  successfactors?: SapSuccessFactorsDetails
}

export interface SapJobResponse {
  job_id: string
  status: JobStatus
  message: string
}

export interface SapSessionRecord {
  job_id: string
  variant: SapVariant
  label?: string
  status: JobStatus
  created_at: string
  completed_at?: string
  error?: string
  results?: SapAssessmentResult
}

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

// ── Sage Intacct ──────────────────────────────────────────────────────────────

export interface SageIntacctCredentials {
  company_id: string
  user_id: string
  user_password: string
  sender_id: string
  sender_password: string
  entity_id?: string
}

export interface SageIntacctAssessmentRequest {
  credentials: SageIntacctCredentials
  label?: string
  include_transaction_details?: boolean
  include_custom_objects?: boolean
}

export interface SageCompanyProfile {
  company_id: string
  company_name: string
  entity_count: number
  base_currency: string
  fiscal_year_end_month: number
  timezone: string
  subscription_plan: string
  modules_enabled: string[]
}

export interface SageUserProfile {
  total_users: number
  active_users: number
  inactive_users: number
  admin_users: number
  role_count: number
  permission_groups: number
}

export interface SageChartOfAccounts {
  total_accounts: number
  active_accounts: number
  asset_accounts: number
  liability_accounts: number
  equity_accounts: number
  revenue_accounts: number
  expense_accounts: number
  other_accounts: number
  account_groups: number
}

export interface SageFinancialDimensions {
  department_count: number
  location_count: number
  class_count: number
  project_count: number
  customer_count: number
  vendor_count: number
  employee_count: number
  warehouse_count: number
  item_count: number
}

export interface SageTransactionVolumes {
  open_ar_invoices: number
  closed_ar_invoices: number
  total_ar_invoices: number
  open_ap_bills: number
  closed_ap_bills: number
  total_ap_bills: number
  gl_journal_entries: number
  purchase_orders: number
  sales_orders: number
  contracts: number
  expense_reports: number
}

export interface SageCashManagement {
  checking_accounts: number
  savings_accounts: number
  credit_card_accounts: number
  total_bank_accounts: number
}

export interface SageFixedAssets {
  total_assets: number
  active_assets: number
  disposed_assets: number
  depreciation_methods: string[]
}

export interface SageCustomization {
  custom_dimensions: number
  platform_extensions: number
  user_defined_fields: number
  custom_report_count: number
  smart_rules_count: number
  smart_events_count: number
}

export interface SageIntegrationHealth {
  web_services_version: string
  api_endpoint: string
  session_timeout_minutes: number
  multi_entity_enabled: boolean
  consolidation_enabled: boolean
}

export interface SageDataQualityFlags {
  vendors_without_gl_account: number
  customers_without_terms: number
  open_invoices_past_due: number
  accounts_with_no_activity_days: number
  duplicate_vendor_names: number
  unposted_journal_entries: number
}

export interface SageIntacctAssessmentResult {
  job_id: string
  label?: string
  assessed_at: string
  status: 'completed' | 'failed'
  error?: string
  company_profile?: SageCompanyProfile
  user_profile?: SageUserProfile
  chart_of_accounts?: SageChartOfAccounts
  financial_dimensions?: SageFinancialDimensions
  transaction_volumes?: SageTransactionVolumes
  cash_management?: SageCashManagement
  fixed_assets?: SageFixedAssets
  customization?: SageCustomization
  integration_health?: SageIntegrationHealth
  data_quality?: SageDataQualityFlags
}

export interface SageIntacctJobResponse {
  job_id: string
  status: string
  message: string
}

export interface SageIntacctSessionRecord {
  job_id: string
  label?: string
  status: string
  created_at: string
  completed_at?: string
  error?: string
  results?: SageIntacctAssessmentResult
}
