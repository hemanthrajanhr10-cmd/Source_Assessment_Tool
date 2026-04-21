import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight, Download, FileText, AlertTriangle, CheckCircle2, Loader2,
  Clock, Database, Table2, Columns, Eye,
  Code2, FunctionSquare, ListTree, GitMerge,
  BarChart2, Activity, Search,
  Users, UserX, ShieldAlert, Zap, Cpu, Lock, KeyRound, Fingerprint,
  Bot, Link2, Network, GitBranch, MessageSquare, MonitorCheck,
  ShieldCheck, AlertCircle, TrendingUp, BarChart, Layers,
  Settings, History, Key, ServerCog, FlaskConical, Wrench, PackageSearch,
} from 'lucide-react'
import { api } from '../api/client'
import { StatusBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import StatCard from '../components/ui/StatCard'
import DataTable, { type ColumnDef } from '../components/ui/DataTable'
import type { AccessLevel, AssessmentResults } from '../types/api'
import { ACCESS_LEVEL_OPTIONS, ACCESS_LEVEL_RANK, TAB_MIN_ACCESS } from '../types/api'
import { formatDateTime, elapsed } from '../utils/dateTime'

function AccessLevelBadge({ level }: { level: AccessLevel }) {
  const opt = ACCESS_LEVEL_OPTIONS.find((o) => o.value === level)
  const colors: Record<AccessLevel, string> = {
    db_datareader:       'bg-slate-100 text-slate-600 border-slate-200',
    view_database_state: 'bg-blue-50 text-blue-700 border-blue-200',
    db_owner:            'bg-amber-50 text-amber-700 border-amber-200',
    sysadmin:            'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[level]}`}>
      <ShieldCheck className="h-3 w-3" />
      {opt?.label ?? level}
    </span>
  )
}

function LockedTabOverlay({ requiredLevel, currentLevel }: { requiredLevel: AccessLevel; currentLevel: AccessLevel }) {
  const opt = ACCESS_LEVEL_OPTIONS.find((o) => o.value === requiredLevel)
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <div className="flex items-center justify-center h-14 w-14 rounded-full bg-slate-100">
        <Lock className="h-6 w-6 text-slate-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">Assessment skipped</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          This check requires <span className="font-semibold text-slate-600">{opt?.label ?? requiredLevel}</span> access.
          The assessment was run with <span className="font-semibold">{currentLevel}</span>.
        </p>
      </div>
      <p className="text-xs text-slate-400">
        Re-run the assessment with a higher access level to unlock this section.
      </p>
    </div>
  )
}

function pctCell(value: unknown) {
  const n = Number(value)
  if (isNaN(n)) return <span className="text-slate-300">—</span>
  const pct = n.toFixed(1) + '%'
  const cls =
    n > 75 ? 'bg-red-100 text-red-700' :
    n > 25 ? 'bg-amber-100 text-amber-700' :
              'bg-emerald-50 text-emerald-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {pct}
    </span>
  )
}

/* ─── tab groups for sidebar ─── */
const TAB_GROUPS = [
  {
    label: 'Core Metadata',
    ids: ['schemas', 'tables', 'columns', 'views', 'stored_procedures', 'functions',
          'indexes', 'relationships', 'index_coverage', 'null_analysis', 'insertion_frequency'],
  },
  {
    label: 'Security',
    ids: ['db_users_roles', 'orphaned_users', 'db_owner_members', 'dynamic_sql_usage',
          'clr_assemblies', 'tde_status', 'column_encryption', 'pii_indicators',
          'trustworthy_databases', 'weak_sql_logins', 'server_permissions', 'object_permissions'],
  },
  {
    label: 'Schema & Design',
    ids: ['deprecated_data_types', 'missing_primary_keys', 'heap_tables',
          'untrusted_constraints', 'sp_naming_violations', 'duplicate_indexes'],
  },
  {
    label: 'Performance',
    ids: ['missing_indexes', 'index_usage_stats', 'fragmentation_report', 'statistics_health'],
  },
  {
    label: 'Configuration',
    ids: ['database_options_audit', 'server_configurations', 'deprecated_features_in_use', 'version_features'],
  },
  {
    label: 'Features & Risks',
    ids: ['sql_agent_jobs', 'linked_servers', 'backup_history',
          'cross_db_references', 'replication_status', 'service_broker'],
  },
]

/* ─── tab definition ─── */
interface TabDef {
  id: string
  label: string
  icon: React.ReactNode
  getData: (r: AssessmentResults) => Record<string, unknown>[] | undefined
  columns?: ColumnDef[]
  emptyMessage?: string
}

const TABS: TabDef[] = [
  {
    id: 'schemas',
    label: 'Schemas',
    icon: <Database className="h-4 w-4" />,
    getData: (r) => r.schemas,
    emptyMessage: 'No schemas found.',
  },
  {
    id: 'tables',
    label: 'Tables',
    icon: <Table2 className="h-4 w-4" />,
    getData: (r) => r.tables,
    emptyMessage: 'No tables found.',
  },
  {
    id: 'columns',
    label: 'Columns',
    icon: <Columns className="h-4 w-4" />,
    getData: (r) => r.columns,
    emptyMessage: 'No columns found.',
    columns: undefined, // auto-detect
  },
  {
    id: 'views',
    label: 'Views',
    icon: <Eye className="h-4 w-4" />,
    getData: (r) => r.views,
    emptyMessage: 'No views found.',
  },
  {
    id: 'stored_procedures',
    label: 'Stored Procs',
    icon: <Code2 className="h-4 w-4" />,
    getData: (r) => r.stored_procedures,
    emptyMessage: 'No stored procedures found.',
  },
  {
    id: 'functions',
    label: 'Functions',
    icon: <FunctionSquare className="h-4 w-4" />,
    getData: (r) => r.functions,
    emptyMessage: 'No functions found.',
  },
  {
    id: 'indexes',
    label: 'Indexes',
    icon: <ListTree className="h-4 w-4" />,
    getData: (r) => r.indexes,
    emptyMessage: 'No indexes found.',
  },
  {
    id: 'relationships',
    label: 'Relationships',
    icon: <GitMerge className="h-4 w-4" />,
    getData: (r) => r.relationships,
    emptyMessage: 'No relationships found.',
  },
  {
    id: 'index_coverage',
    label: 'Index Coverage',
    icon: <BarChart2 className="h-4 w-4" />,
    getData: (r) => r.index_coverage,
    emptyMessage: 'No index coverage data.',
  },
  {
    id: 'null_analysis',
    label: 'Null Analysis',
    icon: <Search className="h-4 w-4" />,
    getData: (r) => r.null_analysis,
    emptyMessage: 'Null analysis was not included or no data available.',
    columns: undefined, // will be built with custom renderers below
  },
  {
    id: 'insertion_frequency',
    label: 'Insertion Freq.',
    icon: <Activity className="h-4 w-4" />,
    getData: (r) => r.insertion_frequency,
    emptyMessage: 'No insertion frequency data.',
  },
  // ── Security Assessment ──────────────────────────────────────────────────
  {
    id: 'db_users_roles',
    label: 'DB Users & Roles',
    icon: <Users className="h-4 w-4" />,
    getData: (r) => r.db_users_roles,
    emptyMessage: 'No database users found.',
  },
  {
    id: 'orphaned_users',
    label: 'Orphaned Users',
    icon: <UserX className="h-4 w-4" />,
    getData: (r) => r.orphaned_users,
    emptyMessage: 'No orphaned users found.',
  },
  {
    id: 'db_owner_members',
    label: 'DB Owner Members',
    icon: <ShieldAlert className="h-4 w-4" />,
    getData: (r) => r.db_owner_members,
    emptyMessage: 'No non-dbo db_owner members found.',
  },
  {
    id: 'dynamic_sql_usage',
    label: 'Dynamic SQL',
    icon: <Zap className="h-4 w-4" />,
    getData: (r) => r.dynamic_sql_usage,
    emptyMessage: 'No dynamic SQL usage detected.',
  },
  {
    id: 'clr_assemblies',
    label: 'CLR Assemblies',
    icon: <Cpu className="h-4 w-4" />,
    getData: (r) => r.clr_assemblies,
    emptyMessage: 'No CLR assemblies found.',
  },
  {
    id: 'tde_status',
    label: 'TDE Status',
    icon: <Lock className="h-4 w-4" />,
    getData: (r) => r.tde_status,
    emptyMessage: 'TDE status unavailable.',
  },
  {
    id: 'column_encryption',
    label: 'Col. Encryption',
    icon: <KeyRound className="h-4 w-4" />,
    getData: (r) => r.column_encryption,
    emptyMessage: 'No Always Encrypted columns found.',
  },
  {
    id: 'pii_indicators',
    label: 'PII Scan',
    icon: <Fingerprint className="h-4 w-4" />,
    getData: (r) => r.pii_indicators,
    emptyMessage: 'No PII indicators detected in column names.',
  },
  // ── Feature Usage & Risks ────────────────────────────────────────────────
  {
    id: 'sql_agent_jobs',
    label: 'Agent Jobs',
    icon: <Bot className="h-4 w-4" />,
    getData: (r) => r.sql_agent_jobs,
    emptyMessage: 'No SQL Agent jobs found.',
  },
  {
    id: 'linked_servers',
    label: 'Linked Servers',
    icon: <Link2 className="h-4 w-4" />,
    getData: (r) => r.linked_servers,
    emptyMessage: 'No linked servers configured.',
  },
  {
    id: 'backup_history',
    label: 'Backup History',
    icon: <History className="h-4 w-4" />,
    getData: (r) => r.backup_history,
    emptyMessage: 'No backup history found.',
  },
  {
    id: 'cross_db_references',
    label: 'Cross-DB Refs',
    icon: <Network className="h-4 w-4" />,
    getData: (r) => r.cross_db_references,
    emptyMessage: 'No cross-database references found.',
  },
  {
    id: 'replication_status',
    label: 'Replication',
    icon: <GitBranch className="h-4 w-4" />,
    getData: (r) => r.replication_status,
    emptyMessage: 'Replication status unavailable.',
  },
  {
    id: 'service_broker',
    label: 'Service Broker',
    icon: <MessageSquare className="h-4 w-4" />,
    getData: (r) => r.service_broker,
    emptyMessage: 'Service Broker status unavailable.',
  },
  // ── New: Security (higher roles) ─────────────────────────────────────────
  {
    id: 'trustworthy_databases',
    label: 'Trustworthy DBs',
    icon: <ShieldAlert className="h-4 w-4" />,
    getData: (r) => r.trustworthy_databases,
    emptyMessage: 'No databases with TRUSTWORTHY=ON found.',
  },
  {
    id: 'weak_sql_logins',
    label: 'Weak SQL Logins',
    icon: <Key className="h-4 w-4" />,
    getData: (r) => r.weak_sql_logins,
    emptyMessage: 'No SQL logins with policy violations found.',
  },
  {
    id: 'server_permissions',
    label: 'Server Role Members',
    icon: <ServerCog className="h-4 w-4" />,
    getData: (r) => r.server_permissions,
    emptyMessage: 'No privileged server role members found.',
  },
  {
    id: 'object_permissions',
    label: 'Object Permissions',
    icon: <KeyRound className="h-4 w-4" />,
    getData: (r) => r.object_permissions,
    emptyMessage: 'No explicit object permissions found.',
  },
  // ── New: Schema & Design ─────────────────────────────────────────────────
  {
    id: 'deprecated_data_types',
    label: 'Deprecated Types',
    icon: <AlertCircle className="h-4 w-4" />,
    getData: (r) => r.deprecated_data_types,
    emptyMessage: 'No deprecated data types found.',
  },
  {
    id: 'missing_primary_keys',
    label: 'Missing PKs',
    icon: <PackageSearch className="h-4 w-4" />,
    getData: (r) => r.missing_primary_keys,
    emptyMessage: 'All tables have a primary key.',
  },
  {
    id: 'heap_tables',
    label: 'Heap Tables',
    icon: <Layers className="h-4 w-4" />,
    getData: (r) => r.heap_tables,
    emptyMessage: 'No heap tables found (all have a clustered index).',
  },
  {
    id: 'untrusted_constraints',
    label: 'Untrusted Constraints',
    icon: <AlertTriangle className="h-4 w-4" />,
    getData: (r) => r.untrusted_constraints,
    emptyMessage: 'All FK and CHECK constraints are trusted.',
  },
  {
    id: 'sp_naming_violations',
    label: 'SP Naming',
    icon: <FlaskConical className="h-4 w-4" />,
    getData: (r) => r.sp_naming_violations,
    emptyMessage: 'No stored procedures with sp_ prefix found.',
  },
  {
    id: 'duplicate_indexes',
    label: 'Duplicate Indexes',
    icon: <Wrench className="h-4 w-4" />,
    getData: (r) => r.duplicate_indexes,
    emptyMessage: 'No duplicate indexes detected.',
  },
  // ── New: Performance ─────────────────────────────────────────────────────
  {
    id: 'missing_indexes',
    label: 'Missing Indexes',
    icon: <TrendingUp className="h-4 w-4" />,
    getData: (r) => r.missing_indexes,
    emptyMessage: 'No missing index recommendations from SQL Server.',
  },
  {
    id: 'index_usage_stats',
    label: 'Index Usage',
    icon: <BarChart className="h-4 w-4" />,
    getData: (r) => r.index_usage_stats,
    emptyMessage: 'No index usage statistics available.',
  },
  {
    id: 'fragmentation_report',
    label: 'Fragmentation',
    icon: <BarChart2 className="h-4 w-4" />,
    getData: (r) => r.fragmentation_report,
    emptyMessage: 'No indexes with significant fragmentation found.',
  },
  {
    id: 'statistics_health',
    label: 'Statistics Health',
    icon: <Activity className="h-4 w-4" />,
    getData: (r) => r.statistics_health,
    emptyMessage: 'Statistics are up to date.',
  },
  // ── New: Configuration ───────────────────────────────────────────────────
  {
    id: 'database_options_audit',
    label: 'DB Options',
    icon: <Settings className="h-4 w-4" />,
    getData: (r) => r.database_options_audit,
    emptyMessage: 'Database options data unavailable.',
  },
  {
    id: 'server_configurations',
    label: 'Server Config',
    icon: <ServerCog className="h-4 w-4" />,
    getData: (r) => r.server_configurations,
    emptyMessage: 'Server configuration data unavailable.',
  },
  {
    id: 'deprecated_features_in_use',
    label: 'Deprecated Features',
    icon: <MonitorCheck className="h-4 w-4" />,
    getData: (r) => r.deprecated_features_in_use,
    emptyMessage: 'No deprecated features in active use.',
  },
  {
    id: 'version_features',
    label: 'Version & Features',
    icon: <MonitorCheck className="h-4 w-4" />,
    getData: (r) => r.version_features,
    emptyMessage: 'Version features unavailable.',
  },
]

/* Build null analysis columns with pct formatting */
function buildNullAnalysisColumns(data: Record<string, unknown>[]): ColumnDef[] | undefined {
  if (!data.length) return undefined
  return Object.keys(data[0]).map((key) => ({
    key,
    header: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    align: (key.includes('count') || key.includes('percentage') || key.includes('rows')) ? 'right' as const : 'left' as const,
    render: key.includes('percentage') || key.includes('pct') ? pctCell : undefined,
  }))
}

/* ─── Progress bar ─── */
const STEPS = [
  'Database overview', 'Schemas', 'Tables', 'Columns', 'Views',
  'Stored procedures', 'Functions', 'Indexes', 'Relationships',
  'Index coverage', 'Insertion frequency',
  'Database users', 'Orphaned users', 'Excessive permissions',
  'Dynamic SQL', 'CLR', 'TDE', 'Column-level encryption', 'PII',
  'Cross-database', 'Replication', 'Service Broker', 'Version',
  'Trustworthy database', 'Deprecated data types', 'Missing primary keys',
  'Heap tables', 'Untrusted constraints', 'Stored proc naming', 'Duplicate indexes',
  'Database options', 'Object permissions',
  'Missing index recommendations', 'Index usage statistics',
  'Index fragmentation', 'Statistics health',
  'SQL Agent jobs', 'Linked servers', 'Backup history',
  'Server configurations', 'Weak SQL logins', 'Server role members', 'Deprecated features',
  'Null analysis', 'Building report',
]

function guessProgress(msg?: string): number {
  if (!msg) return 0
  const lower = msg.toLowerCase()
  const idx = STEPS.findIndex((s) => lower.includes(s.toLowerCase()))
  if (idx === -1) return 5
  return Math.round(((idx + 1) / STEPS.length) * 95)
}

/* ─── Main component ─── */
export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const [activeTab, setActiveTab] = useState('schemas')
  const [downloading, setDownloading] = useState(false)
  const [downloadingWord, setDownloadingWord] = useState(false)

  const handleDownload = useCallback(async () => {
    if (!jobId || downloading) return
    setDownloading(true)
    try {
      await api.downloadReport(jobId, `sql_assessment_${jobId.slice(0, 8)}.xlsx`)
    } finally {
      setDownloading(false)
    }
  }, [jobId, downloading])

  const handleDownloadWord = useCallback(async () => {
    if (!jobId || downloadingWord) return
    setDownloadingWord(true)
    try {
      await api.downloadWordReport(jobId, `fabric_assessment_${jobId.slice(0, 8)}.docx`)
    } finally {
      setDownloadingWord(false)
    }
  }, [jobId, downloadingWord])

  /* Poll job status */
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['job-status', jobId],
    queryFn: () => api.getJobStatus(jobId!).then((r) => r.data),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'pending' || s === 'running' ? 2000 : false
    },
    enabled: !!jobId,
  })

  /* Fetch results only when completed */
  const { data: results, isLoading: resultsLoading } = useQuery({
    queryKey: ['job-results', jobId],
    queryFn: () => api.getJobResults(jobId!).then((r) => r.data),
    enabled: status?.status === 'completed',
    staleTime: Infinity,
  })

  const isRunning = status?.status === 'pending' || status?.status === 'running'
  const progress = guessProgress(status?.progress_message)

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size="xl" className="text-brand-500" />
      </div>
    )
  }

  if (!status) {
    return (
      <div className="card p-10 text-center text-slate-500">
        <p className="font-medium">Job not found.</p>
        <Link to="/jobs" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
          Back to Jobs
        </Link>
      </div>
    )
  }

  const overview = results?.overview

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-400" aria-label="Breadcrumb">
        <Link to="/jobs" className="hover:text-slate-700 transition-colors">Jobs</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="text-slate-600 font-medium truncate max-w-xs">
          {status.label ?? <span className="font-mono text-xs">{jobId?.slice(0, 8)}…</span>}
        </span>
      </nav>

      {/* Job header card */}
      <div className="card overflow-hidden">
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">
                {status.label ?? 'Unlabeled Assessment'}
              </h1>
              <StatusBadge status={status.status} />
            </div>
            <p className="text-xs text-slate-400 font-mono">{jobId}</p>
          </div>

          {status.status === 'completed' && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                disabled={downloading}
                onClick={handleDownload}
              >
                {downloading ? 'Downloading…' : 'Excel Report'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={downloadingWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                disabled={downloadingWord}
                onClick={handleDownloadWord}
              >
                {downloadingWord ? 'Downloading…' : 'Fabric Assessment (Word)'}
              </Button>
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="border-t border-slate-100 px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 text-sm">
          {[
            { label: 'Created',   value: formatDateTime(status.created_at) },
            { label: 'Started',   value: formatDateTime(status.started_at) },
            { label: 'Completed', value: formatDateTime(status.completed_at) },
            {
              label: 'Duration',
              value: (
                <span className="tabular-nums">
                  {elapsed(status.started_at, status.completed_at)}
                  {isRunning && <span className="ml-1 text-blue-500 animate-pulse">…</span>}
                </span>
              ),
            },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {label}
              </p>
              <p className="mt-0.5 text-slate-700">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Progress (pending/running) */}
      {isRunning && (
        <div className="card px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Spinner size="sm" className="text-brand-500" />
              <span className="text-sm font-medium text-slate-700">
                {status.status === 'pending' ? 'Queued — waiting to start…' : (status.progress_message ?? 'Running…')}
              </span>
            </div>
            <span className="text-xs font-medium text-slate-400 tabular-nums">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-xs text-slate-400">This page auto-refreshes every 2 seconds.</p>
        </div>
      )}

      {/* Error */}
      {status.status === 'failed' && (
        <div className="card border-red-200 bg-red-50 px-6 py-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold text-red-700">Assessment failed</p>
            <p className="text-sm text-red-600 mt-1">{status.error ?? 'An unknown error occurred.'}</p>
          </div>
        </div>
      )}

      {/* Success banner + overview KPIs */}
      {status.status === 'completed' && overview && (
        <>
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden="true" />
            <p className="text-sm font-medium text-emerald-700 flex-1">
              Assessment complete — <span className="font-bold">{overview.database_name}</span> on{' '}
              {overview.sql_server_version?.split('\n')[0]}
            </p>
            {results?.access_level && (
              <AccessLevelBadge level={results.access_level as AccessLevel} />
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Tables"           value={overview.table_count}      icon={<Table2 className="h-5 w-5" />} />
            <StatCard label="Views"            value={overview.view_count}       icon={<Eye className="h-5 w-5" />}   accent="bg-purple-50 text-purple-600" />
            <StatCard label="Schemas"          value={overview.schema_count}     icon={<Database className="h-5 w-5" />} accent="bg-indigo-50 text-indigo-600" />
            <StatCard label="Stored Procs"     value={overview.stored_proc_count} icon={<Code2 className="h-5 w-5" />} accent="bg-amber-50 text-amber-600" />
            <StatCard label="Functions"        value={overview.function_count}   icon={<FunctionSquare className="h-5 w-5" />} accent="bg-orange-50 text-orange-600" />
            <StatCard
              label="Total Size"
              value={overview.total_size_mb != null ? `${overview.total_size_mb.toLocaleString()} MB` : '—'}
              icon={<BarChart2 className="h-5 w-5" />}
              accent="bg-emerald-50 text-emerald-600"
            />
          </div>
        </>
      )}

      {/* Results — left sidebar + content */}
      {status.status === 'completed' && (
        <div className="card overflow-hidden flex" style={{ minHeight: '600px' }}>
          {/* Left navigation sidebar */}
          <nav
            className="w-60 flex-shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto"
            aria-label="Assessment sections"
          >
            {TAB_GROUPS.map((group) => {
              const accessLevel = (results?.access_level ?? 'db_datareader') as AccessLevel
              const accessRank = ACCESS_LEVEL_RANK[accessLevel] ?? 1
              return (
                <div key={group.label}>
                  <p className="px-4 pt-4 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    {group.label}
                  </p>
                  {group.ids.map((id) => {
                    const tab = TABS.find((t) => t.id === id)!
                    const count = results ? (tab.getData(results) ?? []).length : null
                    const isActive = activeTab === id
                    const minLevel = TAB_MIN_ACCESS[id] ?? 'db_datareader'
                    const minRank = ACCESS_LEVEL_RANK[minLevel] ?? 1
                    const isLocked = results != null && accessRank < minRank
                    return (
                      <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors duration-100 ${
                          isActive
                            ? 'bg-white text-brand-700 font-semibold border-r-2 border-brand-600'
                            : isLocked
                              ? 'text-slate-400 hover:bg-slate-100'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                        aria-selected={isActive}
                        role="tab"
                      >
                        <span className={`shrink-0 ${isLocked ? 'text-slate-300' : ''}`}>{tab.icon}</span>
                        <span className="truncate flex-1 text-left">{tab.label}</span>
                        {isLocked ? (
                          <Lock className="h-3 w-3 text-slate-300 shrink-0" />
                        ) : count !== null ? (
                          <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold shrink-0 ${
                            isActive ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {count > 9999 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString()}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0 p-6 overflow-auto">
            {resultsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size="lg" className="text-brand-500" />
              </div>
            ) : results ? (
              (() => {
                const tab = TABS.find((t) => t.id === activeTab)!
                const accessLevel = (results.access_level ?? 'db_datareader') as AccessLevel
                const accessRank = ACCESS_LEVEL_RANK[accessLevel] ?? 1
                const minLevel = TAB_MIN_ACCESS[activeTab] ?? 'db_datareader'
                const minRank = ACCESS_LEVEL_RANK[minLevel] ?? 1
                const isLocked = accessRank < minRank

                if (isLocked) {
                  return <LockedTabOverlay requiredLevel={minLevel} currentLevel={accessLevel} />
                }

                const data = tab.getData(results) ?? []
                const columns = tab.id === 'null_analysis'
                  ? buildNullAnalysisColumns(data)
                  : tab.columns
                return (
                  <>
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <span className="text-slate-400">{tab.icon}</span>
                      <h2 className="text-base font-semibold text-slate-800">{tab.label}</h2>
                      <span className="text-xs text-slate-400 tabular-nums">
                        ({data.length.toLocaleString()} row{data.length !== 1 ? 's' : ''})
                      </span>
                      {minRank > 1 && (
                        <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          Requires {minLevel}
                        </span>
                      )}
                    </div>
                    <DataTable
                      key={activeTab}
                      data={data}
                      columns={columns}
                      emptyMessage={tab.emptyMessage}
                      searchable
                    />
                  </>
                )
              })()
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
