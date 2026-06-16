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
  ssis_msdb_packages: 'sysadmin',
  sql_agent_job_schedules: 'sysadmin',
  sql_agent_job_steps: 'sysadmin',
  ssas_linked_servers: 'sysadmin',
  // view_database_state
  wait_statistics: 'view_database_state',
  query_store_top_queries: 'view_database_state',
  // db_datareader (extended)
  schema_classification: 'db_datareader',
  view_complexity: 'db_datareader',
  database_files: 'db_datareader',
  ssis_catalog_packages: 'db_datareader',
  ssis_execution_history: 'db_datareader',
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
  sp_complexity?: Record<string, unknown>[]
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
  // Extended engine assessment
  schema_classification?: Record<string, unknown>[]
  view_complexity?: Record<string, unknown>[]
  database_files?: Record<string, unknown>[]
  ssis_catalog_packages?: Record<string, unknown>[]
  ssis_execution_history?: Record<string, unknown>[]
  ssis_msdb_packages?: Record<string, unknown>[]
  sql_agent_job_schedules?: Record<string, unknown>[]
  sql_agent_job_steps?: Record<string, unknown>[]
  ssas_linked_servers?: Record<string, unknown>[]
  wait_statistics?: Record<string, unknown>[]
  query_store_top_queries?: Record<string, unknown>[]
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
  gcp_sa_key?: string
  gcp_private_ip?: boolean
  azure_managed_identity?: boolean
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

export interface TableSourceFeed {
  source_type: string
  feed_description: string
  latency: string
  recommended: string
  recommendation_reason: string
}

export interface TableStorageMigration {
  table: string
  current_mode: string
  recommended_mode: string
  reason: string
}

export interface ModelStorageRecommendation {
  current_mode: string
  overall_recommended: string
  risk_level: 'Low' | 'Medium' | 'High'
  summary: string
  mode_breakdown: Record<string, number>
  tables_to_migrate: TableStorageMigration[]
}

export interface FabricTable {
  name: string
  storage_mode: string
  is_hidden: boolean
  is_calculated: boolean
  columns?: FabricTableColumn[]
  source_feeds?: TableSourceFeed
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
  storage_recommendation?: ModelStorageRecommendation
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

// ── Tableau ───────────────────────────────────────────────────────────────────

export interface TableauCredentials {
  server_url: string
  site_name?: string
  username?: string
  password?: string
  token_name?: string
  token_secret?: string
}

export interface TableauAssessmentRequest {
  credentials: TableauCredentials
  label?: string
  include_permissions?: boolean
  include_extract_health?: boolean
  include_flows?: boolean
}

export interface TableauServerInfo {
  server_url: string
  site_name: string
  server_version: string
  site_id: string
  content_url: string
}

export interface TableauWorkbook {
  id: string
  name: string
  project_name: string
  owner_name: string
  created_at?: string
  updated_at?: string
  view_count: number
  size_mb: number
  show_tabs: boolean
  tag_count: number
}

export interface TableauView {
  id: string
  name: string
  workbook_name: string
  owner_name: string
  view_type: string
  total_views: number
}

export interface TableauDatasource {
  id: string
  name: string
  project_name: string
  owner_name: string
  datasource_type: string
  content_url: string
  created_at?: string
  updated_at?: string
  is_certified: boolean
  is_published: boolean
  size_mb: number
  connection_type: string
  has_extracts: boolean
  tag_count: number
}

export interface TableauUserProfile {
  total_users: number
  active_users: number
  admin_users: number
  site_admin_users: number
  creator_users: number
  explorer_users: number
  viewer_users: number
  unlicensed_users: number
}

export interface TableauGroup {
  id: string
  name: string
  domain_name?: string
  member_count: number
}

export interface TableauProject {
  id: string
  name: string
  description?: string
  content_permissions: string
  workbook_count: number
  datasource_count: number
}

export interface TableauFlow {
  id: string
  name: string
  project_name: string
  owner_name: string
  created_at?: string
  updated_at?: string
}

export interface TableauExtractHealth {
  total_schedules: number
  active_schedules: number
  suspended_schedules: number
  total_refresh_jobs: number
  successful_jobs: number
  failed_jobs: number
  cancelled_jobs: number
  stale_datasources: number
}

export interface TableauDataQualityFlags {
  workbooks_with_no_views: number
  datasources_with_no_workbooks: number
  users_with_no_activity: number
  failed_extract_jobs: number
  stale_extracts_over_7_days: number
  uncertified_published_datasources: number
}

export interface TableauWorkbookSummary {
  total_workbooks: number
  total_views: number
  total_sheets: number
  total_dashboards: number
  workbooks_with_extracts: number
  avg_views_per_workbook: number
}

export interface TableauDatasourceSummary {
  total_datasources: number
  published_datasources: number
  embedded_datasources: number
  certified_datasources: number
  extract_datasources: number
  live_datasources: number
  connection_types: string[]
}

export interface WorkbookMigrationScore {
  workbook_name: string
  project_name: string
  owner_name: string
  data_source_complexity: number
  calc_field_complexity: number
  table_calc_complexity: number
  dashboard_action_complexity: number
  rls_complexity: number
  extension_complexity: number
  viz_type_complexity: number
  parameter_complexity: number
  total_score: number
  complexity_level: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex'
  migration_blockers: string[]
  migration_warnings: string[]
  pbi_equivalent_notes: string[]
  view_count: number
  size_mb: number
}

export interface FeatureMapping {
  tableau: string
  power_bi: string
  feasibility: 'Direct' | 'Moderate' | 'Complex'
  notes: string
}

export interface MigrationFeasibilityReport {
  total_workbooks_assessed: number
  simple_workbooks: number
  moderate_workbooks: number
  complex_workbooks: number
  very_complex_workbooks: number
  overall_feasibility: 'High' | 'Moderate' | 'Low'
  estimated_migration_weeks: number
  has_lod_expressions: boolean
  has_table_calculations: boolean
  has_tableau_extensions: boolean
  has_viz_in_tooltip: boolean
  has_custom_geocoding: boolean
  has_rls: boolean
  has_custom_sql: boolean
  has_prep_flows: boolean
  has_embedded_analytics: boolean
  has_parameter_actions: boolean
  migratable_connections: string[]
  complex_connections: string[]
  feature_mapping: FeatureMapping[]
  workbook_scores: WorkbookMigrationScore[]
  migration_blockers: string[]
  recommended_migration_order: string[]
}

export interface CalcFieldSummary {
  name: string
  formula: string
  datatype: string
  role: string
  is_lod: boolean
  lod_type?: string
  is_table_calc: boolean
  table_calc_type?: string
  dependencies: string[]
  nested_lod_count: number
}

export interface LODSummary {
  name: string
  formula: string
  lod_type: string
  is_nested: boolean
}

export interface TableCalcSummary {
  name: string
  formula: string
  calc_type: string
}

export interface ParameterSummary {
  name: string
  caption?: string
  datatype: string
  current_value?: string
  allowable_values_type: string
  list_values: string[]
}

export interface DatasourceDetailSummary {
  name: string
  connection_type: string
  has_custom_sql: boolean
  has_extract: boolean
  join_count: number
  join_types: string[]
  has_stored_proc: boolean
}

export interface MarkTypeEntry {
  worksheet: string
  mark_type: string
  has_dual_axis: boolean
  has_viz_in_tooltip: boolean
}

export interface DashboardSummaryEntry {
  name: string
  object_count: number
  has_floating_objects: boolean
  has_device_layouts: boolean
  device_types: string[]
}

export interface ActionSummaryEntry {
  name: string
  action_type: string
  source_sheet?: string
  target_sheet?: string
}

export interface SetSummaryEntry {
  name: string
  set_type: string
  member_count: number
  is_combined: boolean
}

export interface HierarchySummaryEntry {
  name: string
  levels: string[]
}

export interface ExtensionSummaryEntry {
  name: string
  url?: string
  version?: string
  is_dashboard_extension: boolean
}

export interface WorkbookDeepAnalysis {
  workbook_name: string
  parse_errors: string[]

  // §3 Data model
  datasource_details: DatasourceDetailSummary[]
  has_data_blending: boolean
  has_cross_database_join: boolean
  has_custom_sql: boolean
  has_stored_procedures: boolean

  // §4 Fields
  total_dimensions: number
  total_measures: number
  total_hidden_fields: number

  // §5 Calculated fields
  calc_fields: CalcFieldSummary[]
  total_calc_fields: number

  // §6 LOD
  lod_expressions: LODSummary[]
  total_lod_count: number
  has_nested_lod: boolean
  lod_type_counts: Record<string, number>

  // §7 Table calcs
  table_calcs: TableCalcSummary[]
  total_table_calc_count: number
  table_calc_types_used: string[]

  // §8 Parameters
  parameters: ParameterSummary[]
  total_parameter_count: number
  has_parameter_actions: boolean

  // §9 Filters
  extract_filter_count: number
  datasource_filter_count: number
  context_filter_count: number
  dimension_filter_count: number
  measure_filter_count: number
  total_filter_count: number

  // §10 Sorting
  sort_count: number
  custom_sort_count: number

  // §11 Sets
  sets: SetSummaryEntry[]
  has_set_actions: boolean
  combined_set_count: number

  // §12 Groups & hierarchies
  group_count: number
  hierarchy_count: number
  hierarchies: HierarchySummaryEntry[]

  // §13 Mark types
  mark_types: MarkTypeEntry[]
  has_viz_in_tooltip: boolean
  has_custom_marks: boolean
  unique_mark_types: string[]

  // §14 Dashboards
  dashboards: DashboardSummaryEntry[]
  total_dashboards: number
  has_floating_objects: boolean
  has_device_layouts: boolean

  // §15 Actions
  actions: ActionSummaryEntry[]
  filter_action_count: number
  highlight_action_count: number
  url_action_count: number
  set_action_count: number
  parameter_action_count: number

  // §16 Formatting
  has_custom_number_formats: boolean
  custom_font_count: number

  // §20 Stories
  story_count: number
  story_point_count: number

  // §21 Extensions
  extensions: ExtensionSummaryEntry[]
  total_extensions: number

  // §23 Embedded analytics
  has_javascript_api: boolean
  has_embedding_params: boolean

  // Refined migration scores
  refined_calc_field_complexity?: number
  refined_table_calc_complexity?: number
  refined_parameter_complexity?: number
  refined_rls_complexity?: number
  refined_extension_complexity?: number
  refined_viz_type_complexity?: number
  refined_dashboard_action_complexity?: number
  refined_total_score?: number
  refined_complexity_level?: string

  raw_worksheet_count: number
}

export interface TableauAssessmentResult {
  job_id: string
  label?: string
  assessed_at: string
  status: 'completed' | 'failed'
  error?: string
  server_info?: TableauServerInfo
  workbook_summary?: TableauWorkbookSummary
  datasource_summary?: TableauDatasourceSummary
  user_profile?: TableauUserProfile
  extract_health?: TableauExtractHealth
  data_quality?: TableauDataQualityFlags
  migration_feasibility?: MigrationFeasibilityReport
  workbook_deep_analysis?: WorkbookDeepAnalysis[]
  projects?: TableauProject[]
  workbooks?: TableauWorkbook[]
  datasources?: TableauDatasource[]
  views?: TableauView[]
  users_list?: Record<string, string>[]
  groups?: TableauGroup[]
  flows?: TableauFlow[]
  permissions?: TableauPermissionEntry[]
}

export interface TableauPermissionEntry {
  workbook_or_datasource_name: string
  grantee_name: string
  grantee_type: string
  capability_name: string
  capability_mode: string
}

export interface TableauJobResponse {
  job_id: string
  status: string
  message: string
}

export interface TableauSessionRecord {
  job_id: string
  label?: string
  status: string
  server_url?: string
  created_at: string
  completed_at?: string
  error?: string
  results?: TableauAssessmentResult
}

// ── Snowflake ─────────────────────────────────────────────────────────────────

export type SnowflakeAuthMethod =
  | 'username_password'
  | 'browser_sso'
  | 'browser_sso_cached'
  | 'mfa_push'
  | 'mfa_totp'
  | 'key_pair'
  | 'oauth_token'
  | 'oauth_auth_code'
  | 'oauth_client_credentials'
  | 'workload_identity'
  | 'toml_profile'

export interface SnowflakeCredentials {
  auth_method: SnowflakeAuthMethod
  // Common connection fields
  account?: string
  username?: string
  role?: string
  warehouse?: string
  database?: string
  // Password-based (username_password, mfa_push, mfa_totp)
  password?: string
  // MFA TOTP
  passcode?: string
  // Key-pair
  private_key_path?: string
  private_key_passphrase?: string
  // OAuth — bring your own token
  oauth_token?: string
  // OAuth flows (auth_code + client_credentials)
  oauth_client_id?: string
  oauth_client_secret?: string
  oauth_auth_url?: string
  oauth_token_url?: string
  oauth_scope?: string
  // Workload Identity
  workload_identity_provider?: string
  // TOML profile
  toml_connection_name?: string
}

export interface SnowflakeAuthRequest {
  credentials: SnowflakeCredentials
}

export interface SnowflakeAuthResponse {
  auth_id: string
  status: string
  message: string
}

export interface SnowflakeAuthStatusResponse {
  auth_id: string
  status: 'pending' | 'authenticated' | 'failed'
  auth_method?: string
  account?: string
  current_user?: string
  current_role?: string
  error?: string
}

export interface SnowflakeAssessmentRequest {
  auth_id: string
  label?: string
  include_query_history?: boolean
  include_storage_usage?: boolean
  include_warehouse_metering?: boolean
  include_login_history?: boolean
  include_access_history?: boolean
  include_governance?: boolean
  include_integrations?: boolean
  max_databases?: number
}

export interface SnowflakeAccountInfo {
  account_name: string
  organization_name?: string
  account_locator?: string
  cloud_provider?: string
  region?: string
  edition?: string
  snowflake_version?: string
  current_role?: string
  current_warehouse?: string
  current_user?: string
  default_data_retention_days?: number
}

export interface SnowflakeWarehouse {
  name: string
  state: string
  wh_type: string
  size: string
  auto_suspend: number
  auto_resume: boolean
  cluster_count?: number
  max_cluster_count?: number
  running: number
  queued: number
  is_default: boolean
  owner?: string
  comment?: string
  scaling_policy?: string
}

export interface SnowflakeWarehouseMetrics {
  total_warehouses: number
  active_warehouses: number
  suspended_warehouses: number
  warehouses_by_size: Record<string, number>
  multi_cluster_warehouses: number
}

export interface SnowflakeDatabase {
  name: string
  origin?: string
  owner?: string
  comment?: string
  retention_time: number
  created_on?: string
  is_default: boolean
  is_transient: boolean
}

export interface SnowflakeSchema {
  database_name: string
  name: string
  owner?: string
  retention_time: number
  comment?: string
  is_managed_access: boolean
  is_transient: boolean
}

export interface SnowflakeTable {
  database_name: string
  schema_name: string
  name: string
  table_type: string
  row_count?: number
  bytes?: number
  clustering_key?: string
  is_transient: boolean
  retention_time: number
  created?: string
  last_altered?: string
}

export interface SnowflakeDatabaseSummary {
  total_databases: number
  total_schemas: number
  total_tables: number
  total_views: number
  total_external_tables: number
  total_materialized_views: number
  total_size_bytes: number
}

export interface SnowflakeObjectInventory {
  stages: number
  pipes: number
  tasks: number
  streams: number
  procedures: number
  functions: number
  sequences: number
  file_formats: number
  dynamic_tables: number
  shares_outbound: number
  shares_inbound: number
  resource_monitors: number
  network_policies: number
  masking_policies: number
  row_access_policies: number
}

export interface SnowflakeUserProfile {
  total_users: number
  disabled_users: number
  users_without_mfa: number
  admin_users: number
  service_accounts: number
  total_roles: number
  custom_roles: number
  system_roles: number
}

export interface SnowflakeSecurityPosture {
  network_policies_count: number
  users_without_mfa: number
  users_with_default_role_public: number
  masking_policies_count: number
  row_access_policies_count: number
  shares_total: number
  resource_monitors_count: number
}

export interface SnowflakeQueryMetrics {
  total_queries_last_7d: number
  failed_queries_last_7d: number
  avg_execution_ms: number
  p95_execution_ms: number
  bytes_scanned_total: number
  bytes_spilled_local: number
  bytes_spilled_remote: number
  partitions_scanned_pct: number
  most_expensive_queries: Record<string, unknown>[]
  query_error_types: Record<string, number>
  query_types: Record<string, number>
}

export interface SnowflakeStorageMetrics {
  storage_bytes: number
  stage_bytes: number
  failsafe_bytes: number
  total_bytes: number
  trend: Record<string, unknown>[]
}

export interface SnowflakeCostMetrics {
  credits_used_last_30d: number
  compute_credits: number
  cloud_services_credits: number
  top_warehouses_by_credit: Record<string, unknown>[]
  by_service_type: Record<string, unknown>[]
  daily_trend: Record<string, unknown>[]
}

export interface SnowflakeLoginHistory {
  total_logins_30d: number
  failed_logins_30d: number
  unique_users_30d: number
  client_types: Record<string, number>
  failed_reasons: Record<string, number>
}

export interface SnowflakeAccessHistory {
  total_access_events_30d: number
  distinct_objects_accessed: number
  top_users_by_access: Record<string, unknown>[]
}

export interface SnowflakeIntegrations {
  storage_integrations: Record<string, unknown>[]
  notification_integrations: Record<string, unknown>[]
  security_integrations: Record<string, unknown>[]
  api_integrations: Record<string, unknown>[]
  catalog_integrations: Record<string, unknown>[]
}

export interface SnowflakeGovernance {
  projection_policies: number
  aggregation_policies: number
  authentication_policies: number
  password_policies: number
  session_policies: number
  total_tags: number
  tags: Record<string, unknown>[]
}

export interface SnowflakeAlertsSummary {
  total_alerts: number
  enabled_alerts: number
  alerts: Record<string, unknown>[]
}

export interface SnowflakeReplication {
  replication_groups: number
  failover_groups: number
  replicated_databases: Record<string, unknown>[]
}

export interface SnowflakeOperationalMetrics {
  auto_clustering_credits: number
  auto_clustering_bytes_reclustered: number
  auto_clustering_tables: number
  pipe_credits: number
  pipe_files_inserted: number
  pipe_bytes_inserted: number
  task_runs_7d: number
  task_succeeded_7d: number
  task_failed_7d: number
  search_opt_credits: number
  mv_refresh_credits: number
  data_transfer_bytes: number
  data_transfer_by_cloud: Record<string, number>
}

export interface SnowflakeAssessmentResult {
  job_id: string
  label?: string
  assessed_at: string
  status: 'completed' | 'failed'
  error?: string
  account_info?: SnowflakeAccountInfo
  warehouse_metrics?: SnowflakeWarehouseMetrics
  database_summary?: SnowflakeDatabaseSummary
  object_inventory?: SnowflakeObjectInventory
  user_profile?: SnowflakeUserProfile
  security_posture?: SnowflakeSecurityPosture
  login_history?: SnowflakeLoginHistory
  access_history?: SnowflakeAccessHistory
  integrations?: SnowflakeIntegrations
  governance?: SnowflakeGovernance
  alerts?: SnowflakeAlertsSummary
  replication?: SnowflakeReplication
  query_metrics?: SnowflakeQueryMetrics
  storage_metrics?: SnowflakeStorageMetrics
  cost_metrics?: SnowflakeCostMetrics
  operational_metrics?: SnowflakeOperationalMetrics
  warehouses?: SnowflakeWarehouse[]
  databases?: SnowflakeDatabase[]
  schemas?: SnowflakeSchema[]
  tables?: SnowflakeTable[]
  users?: Record<string, unknown>[]
  roles?: Record<string, unknown>[]
}

export interface SnowflakeJobResponse {
  job_id: string
  status: string
  message: string
}

export interface SnowflakeJobStatusResponse {
  job_id: string
  status: string
  label?: string
  progress_message?: string
  error?: string
  created_at: string
  completed_at?: string
}

export interface SnowflakeSessionRecord {
  job_id: string
  label?: string
  status: string
  account?: string
  created_at: string
  completed_at?: string
  error?: string
  results?: SnowflakeAssessmentResult
}

// ─── Dataverse Assessment ───────────────────────────────────────────────────

export type DataverseAuthMethod = 'client_credentials' | 'username_password'

export interface DataverseCredentials {
  auth_method: DataverseAuthMethod
  environment_url: string
  tenant_id?: string
  client_id?: string
  client_secret?: string
  username?: string
  password?: string
}

export interface DataverseAssessmentRequest {
  credentials: DataverseCredentials
  label?: string
  include_data_volume?: boolean
  include_data_quality?: boolean
  include_security?: boolean
  include_flows?: boolean
  include_plugins?: boolean
  include_ui?: boolean
  include_audit?: boolean
  include_ai?: boolean
  max_entities?: number
}

export interface DataverseCheckResult {
  check_id: string
  name: string
  domain: string
  risk: 'critical' | 'high' | 'medium' | 'low'
  status: 'passed' | 'warning' | 'critical' | 'info' | 'error' | 'skipped'
  count?: number
  value?: Record<string, unknown>
  details?: string
  recommendation?: string
}

export interface DataverseDomainSummary {
  domain: string
  total_checks: number
  critical: number
  high: number
  medium: number
  low: number
  passed: number
  errors: number
  score: number
}

export interface DataverseAssessmentResult {
  job_id: string
  status: 'completed' | 'failed'
  environment_url: string
  organization_name?: string
  organization_version?: string
  total_checks: number
  critical_findings: number
  high_findings: number
  medium_findings: number
  low_findings: number
  overall_score: number
  domain_summaries: DataverseDomainSummary[]
  check_results: DataverseCheckResult[]
  errors: string[]
  completed_at?: string
  duration_seconds?: number
}

export interface DataverseJobResponse {
  job_id: string
  status: string
  message: string
}

export interface DataverseJobStatusResponse {
  job_id: string
  status: string
  label?: string
  progress_message?: string
  error?: string
  created_at: string
  completed_at?: string
  checks_completed: number
  total_checks: number
}

export interface DataverseSessionRecord {
  job_id: string
  status: string
  label?: string
  environment_url: string
  organization_name?: string
  total_checks: number
  critical_findings: number
  high_findings: number
  overall_score: number
  created_at: string
  completed_at?: string
  duration_seconds?: number
}

// ── Salesforce ────────────────────────────────────────────────────────────────

export type SalesforceAuthMethod =
  | 'username_password'
  | 'oauth_client_credentials'
  | 'connected_app_token'

export type SalesforceApiScope =
  | 'rest_api'
  | 'metadata_api'
  | 'tooling_api'
  | 'bulk_api'
  | 'analytics_api'
  | 'security'
  | 'automation'
  | 'integration'

export interface SalesforceCredentials {
  auth_method: SalesforceAuthMethod
  instance_url: string
  api_version?: string
  username?: string
  password?: string
  security_token?: string
  client_id?: string
  client_secret?: string
  access_token?: string
}

export interface SalesforceAssessmentRequest {
  credentials: SalesforceCredentials
  label?: string
  api_scopes?: SalesforceApiScope[]
  include_objects?: boolean
  include_fields?: boolean
  include_relationships?: boolean
  include_validation?: boolean
  include_apex?: boolean
  include_flows?: boolean
  include_security?: boolean
  include_bulk?: boolean
  include_analytics?: boolean
  include_integrations?: boolean
  max_objects?: number
}

export interface SalesforceCheckResult {
  check_id: string
  name: string
  domain: string
  api_surface: string
  risk: 'critical' | 'high' | 'medium' | 'low'
  status: 'passed' | 'warning' | 'critical' | 'info' | 'error' | 'skipped'
  count?: number
  value?: unknown
  details?: string
  recommendation?: string
}

export interface SalesforceDomainSummary {
  domain: string
  api_surface: string
  total_checks: number
  critical: number
  high: number
  medium: number
  low: number
  passed: number
  errors: number
  score: number
}

export interface SalesforceAssessmentResult {
  job_id: string
  status: 'completed' | 'failed'
  instance_url: string
  org_name?: string
  org_id?: string
  org_type?: string
  sf_version?: string
  total_checks: number
  critical_findings: number
  high_findings: number
  medium_findings: number
  low_findings: number
  overall_score: number
  custom_object_count: number
  standard_object_count: number
  total_field_count: number
  apex_class_count: number
  flow_count: number
  active_user_count: number
  profile_count: number
  permission_set_count: number
  domain_summaries: SalesforceDomainSummary[]
  check_results: SalesforceCheckResult[]
  errors: string[]
  completed_at?: string
  duration_seconds?: number
}

export interface SalesforceJobResponse {
  job_id: string
  status: string
  message: string
}

export interface SalesforceJobStatusResponse {
  job_id: string
  status: string
  label?: string
  progress_message?: string
  error?: string
  created_at: string
  completed_at?: string
  checks_completed: number
  total_checks: number
}

export interface SalesforceSessionRecord {
  job_id: string
  status: string
  label?: string
  instance_url: string
  org_name?: string
  org_type?: string
  total_checks: number
  critical_findings: number
  high_findings: number
  overall_score: number
  created_at: string
  completed_at?: string
  duration_seconds?: number
}
