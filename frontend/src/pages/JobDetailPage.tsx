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
  HardDrive,
} from 'lucide-react'
import { api } from '../api/client'
import { StatusBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Loader3D from '../components/ui/Loader3D'
import DataTable, { type ColumnDef } from '../components/ui/DataTable'
import type { AccessLevel, AssessmentResults } from '../types/api'
import { ACCESS_LEVEL_OPTIONS, ACCESS_LEVEL_RANK, TAB_MIN_ACCESS } from '../types/api'
import { formatDateTime, elapsed } from '../utils/dateTime'

function AccessLevelBadge({ level }: { level: AccessLevel }) {
  const opt = ACCESS_LEVEL_OPTIONS.find((o) => o.value === level)
  const colors: Record<AccessLevel, string> = {
    db_datareader:       'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    view_database_state: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    db_owner:            'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    sysadmin:            'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[level]}`}>
      <ShieldCheck className="h-3 w-3" />
      {opt?.label ?? level}
    </span>
  )
}

function LockedTabOverlay({ requiredLevel, currentLevel }: { requiredLevel: AccessLevel; currentLevel: AccessLevel }) {
  const opt = ACCESS_LEVEL_OPTIONS.find((o) => o.value === requiredLevel)
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div
        className="flex items-center justify-center h-14 w-14 rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(99,102,241,0.04) 100%)',
          border: '1px solid rgba(196,181,253,0.30)',
          boxShadow: 'var(--elevation-1)',
        }}
      >
        <Lock className="h-6 w-6 text-slate-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">Assessment skipped</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
          Requires <span className="font-semibold text-slate-600">{opt?.label ?? requiredLevel}</span> access.
          Currently running as <span className="font-semibold text-slate-600">{currentLevel}</span>.
        </p>
      </div>
      <p className="text-xs text-slate-400">Re-run with a higher access level to unlock this section.</p>
    </div>
  )
}

function pctCell(value: unknown) {
  const n = Number(value)
  if (isNaN(n)) return <span className="text-slate-300">—</span>
  const pct = n.toFixed(1) + '%'
  const cls =
    n > 75 ? 'bg-red-50 text-red-700'     :
    n > 25 ? 'bg-amber-50 text-amber-700' :
              'bg-emerald-50 text-emerald-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {pct}
    </span>
  )
}

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

interface TabDef {
  id: string
  label: string
  icon: React.ReactNode
  getData: (r: AssessmentResults) => Record<string, unknown>[] | undefined
  columns?: ColumnDef[]
  emptyMessage?: string
}

const TABS: TabDef[] = [
  { id: 'schemas',        label: 'Schemas',       icon: <Database className="h-3.5 w-3.5" />,       getData: (r) => r.schemas,        emptyMessage: 'No schemas found.' },
  { id: 'tables',         label: 'Tables',        icon: <Table2 className="h-3.5 w-3.5" />,          getData: (r) => r.tables,         emptyMessage: 'No tables found.' },
  { id: 'columns',        label: 'Columns',       icon: <Columns className="h-3.5 w-3.5" />,         getData: (r) => r.columns,        emptyMessage: 'No columns found.' },
  { id: 'views',          label: 'Views',         icon: <Eye className="h-3.5 w-3.5" />,             getData: (r) => r.views,          emptyMessage: 'No views found.' },
  { id: 'stored_procedures', label: 'Stored Procs', icon: <Code2 className="h-3.5 w-3.5" />,        getData: (r) => r.stored_procedures, emptyMessage: 'No stored procedures found.' },
  { id: 'functions',      label: 'Functions',     icon: <FunctionSquare className="h-3.5 w-3.5" />,  getData: (r) => r.functions,      emptyMessage: 'No functions found.' },
  { id: 'indexes',        label: 'Indexes',       icon: <ListTree className="h-3.5 w-3.5" />,        getData: (r) => r.indexes,        emptyMessage: 'No indexes found.' },
  { id: 'relationships',  label: 'Relationships', icon: <GitMerge className="h-3.5 w-3.5" />,        getData: (r) => r.relationships,  emptyMessage: 'No relationships found.' },
  { id: 'index_coverage', label: 'Index Coverage', icon: <BarChart2 className="h-3.5 w-3.5" />,     getData: (r) => r.index_coverage, emptyMessage: 'No index coverage data.' },
  { id: 'null_analysis',  label: 'Null Analysis', icon: <Search className="h-3.5 w-3.5" />,         getData: (r) => r.null_analysis,  emptyMessage: 'Null analysis not included.' },
  { id: 'insertion_frequency', label: 'Insertion Freq.', icon: <Activity className="h-3.5 w-3.5" />, getData: (r) => r.insertion_frequency, emptyMessage: 'No insertion frequency data.' },
  { id: 'db_users_roles', label: 'DB Users & Roles', icon: <Users className="h-3.5 w-3.5" />,       getData: (r) => r.db_users_roles, emptyMessage: 'No database users found.' },
  { id: 'orphaned_users', label: 'Orphaned Users', icon: <UserX className="h-3.5 w-3.5" />,         getData: (r) => r.orphaned_users, emptyMessage: 'No orphaned users found.' },
  { id: 'db_owner_members', label: 'DB Owner Members', icon: <ShieldAlert className="h-3.5 w-3.5" />, getData: (r) => r.db_owner_members, emptyMessage: 'No non-dbo db_owner members found.' },
  { id: 'dynamic_sql_usage', label: 'Dynamic SQL', icon: <Zap className="h-3.5 w-3.5" />,           getData: (r) => r.dynamic_sql_usage, emptyMessage: 'No dynamic SQL usage detected.' },
  { id: 'clr_assemblies', label: 'CLR Assemblies', icon: <Cpu className="h-3.5 w-3.5" />,           getData: (r) => r.clr_assemblies, emptyMessage: 'No CLR assemblies found.' },
  { id: 'tde_status',     label: 'TDE Status',    icon: <Lock className="h-3.5 w-3.5" />,            getData: (r) => r.tde_status,     emptyMessage: 'TDE status unavailable.' },
  { id: 'column_encryption', label: 'Col. Encryption', icon: <KeyRound className="h-3.5 w-3.5" />,  getData: (r) => r.column_encryption, emptyMessage: 'No Always Encrypted columns found.' },
  { id: 'pii_indicators', label: 'PII Scan',      icon: <Fingerprint className="h-3.5 w-3.5" />,     getData: (r) => r.pii_indicators, emptyMessage: 'No PII indicators detected.' },
  { id: 'sql_agent_jobs', label: 'Agent Jobs',    icon: <Bot className="h-3.5 w-3.5" />,             getData: (r) => r.sql_agent_jobs, emptyMessage: 'No SQL Agent jobs found.' },
  { id: 'linked_servers', label: 'Linked Servers', icon: <Link2 className="h-3.5 w-3.5" />,         getData: (r) => r.linked_servers, emptyMessage: 'No linked servers configured.' },
  { id: 'backup_history', label: 'Backup History', icon: <History className="h-3.5 w-3.5" />,        getData: (r) => r.backup_history, emptyMessage: 'No backup history found.' },
  { id: 'cross_db_references', label: 'Cross-DB Refs', icon: <Network className="h-3.5 w-3.5" />,   getData: (r) => r.cross_db_references, emptyMessage: 'No cross-database references found.' },
  { id: 'replication_status', label: 'Replication', icon: <GitBranch className="h-3.5 w-3.5" />,    getData: (r) => r.replication_status, emptyMessage: 'Replication status unavailable.' },
  { id: 'service_broker', label: 'Service Broker', icon: <MessageSquare className="h-3.5 w-3.5" />, getData: (r) => r.service_broker, emptyMessage: 'Service Broker status unavailable.' },
  { id: 'trustworthy_databases', label: 'Trustworthy DBs', icon: <ShieldAlert className="h-3.5 w-3.5" />, getData: (r) => r.trustworthy_databases, emptyMessage: 'No TRUSTWORTHY=ON databases.' },
  { id: 'weak_sql_logins', label: 'Weak SQL Logins', icon: <Key className="h-3.5 w-3.5" />,         getData: (r) => r.weak_sql_logins, emptyMessage: 'No SQL logins with policy violations.' },
  { id: 'server_permissions', label: 'Server Role Members', icon: <ServerCog className="h-3.5 w-3.5" />, getData: (r) => r.server_permissions, emptyMessage: 'No privileged server role members.' },
  { id: 'object_permissions', label: 'Object Permissions', icon: <KeyRound className="h-3.5 w-3.5" />, getData: (r) => r.object_permissions, emptyMessage: 'No explicit object permissions.' },
  { id: 'deprecated_data_types', label: 'Deprecated Types', icon: <AlertCircle className="h-3.5 w-3.5" />, getData: (r) => r.deprecated_data_types, emptyMessage: 'No deprecated data types.' },
  { id: 'missing_primary_keys', label: 'Missing PKs', icon: <PackageSearch className="h-3.5 w-3.5" />, getData: (r) => r.missing_primary_keys, emptyMessage: 'All tables have a primary key.' },
  { id: 'heap_tables',    label: 'Heap Tables',   icon: <Layers className="h-3.5 w-3.5" />,          getData: (r) => r.heap_tables,    emptyMessage: 'No heap tables found.' },
  { id: 'untrusted_constraints', label: 'Untrusted Constraints', icon: <AlertTriangle className="h-3.5 w-3.5" />, getData: (r) => r.untrusted_constraints, emptyMessage: 'All constraints are trusted.' },
  { id: 'sp_naming_violations', label: 'SP Naming', icon: <FlaskConical className="h-3.5 w-3.5" />, getData: (r) => r.sp_naming_violations, emptyMessage: 'No sp_ prefix violations found.' },
  { id: 'duplicate_indexes', label: 'Duplicate Indexes', icon: <Wrench className="h-3.5 w-3.5" />,  getData: (r) => r.duplicate_indexes, emptyMessage: 'No duplicate indexes detected.' },
  { id: 'missing_indexes', label: 'Missing Indexes', icon: <TrendingUp className="h-3.5 w-3.5" />,  getData: (r) => r.missing_indexes, emptyMessage: 'No missing index recommendations.' },
  { id: 'index_usage_stats', label: 'Index Usage', icon: <BarChart className="h-3.5 w-3.5" />,      getData: (r) => r.index_usage_stats, emptyMessage: 'No index usage statistics.' },
  { id: 'fragmentation_report', label: 'Fragmentation', icon: <BarChart2 className="h-3.5 w-3.5" />, getData: (r) => r.fragmentation_report, emptyMessage: 'No significant fragmentation.' },
  { id: 'statistics_health', label: 'Statistics Health', icon: <Activity className="h-3.5 w-3.5" />, getData: (r) => r.statistics_health, emptyMessage: 'Statistics are up to date.' },
  { id: 'database_options_audit', label: 'DB Options', icon: <Settings className="h-3.5 w-3.5" />,  getData: (r) => r.database_options_audit, emptyMessage: 'Database options unavailable.' },
  { id: 'server_configurations', label: 'Server Config', icon: <ServerCog className="h-3.5 w-3.5" />, getData: (r) => r.server_configurations, emptyMessage: 'Server configuration unavailable.' },
  { id: 'deprecated_features_in_use', label: 'Deprecated Features', icon: <MonitorCheck className="h-3.5 w-3.5" />, getData: (r) => r.deprecated_features_in_use, emptyMessage: 'No deprecated features in use.' },
  { id: 'version_features', label: 'Version & Features', icon: <MonitorCheck className="h-3.5 w-3.5" />, getData: (r) => r.version_features, emptyMessage: 'Version features unavailable.' },
]

function buildNullAnalysisColumns(data: Record<string, unknown>[]): ColumnDef[] | undefined {
  if (!data.length) return undefined
  return Object.keys(data[0]).map((key) => ({
    key,
    header: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    align: (key.includes('count') || key.includes('percentage') || key.includes('rows')) ? 'right' as const : 'left' as const,
    render: key.includes('percentage') || key.includes('pct') ? pctCell : undefined,
  }))
}

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

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['job-status', jobId],
    queryFn: () => api.getJobStatus(jobId!).then((r) => r.data),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'pending' || s === 'running' ? 2000 : false
    },
    enabled: !!jobId,
  })

  const { data: results, isLoading: resultsLoading } = useQuery({
    queryKey: ['job-results', jobId],
    queryFn: () => api.getJobResults(jobId!).then((r) => r.data),
    enabled: status?.status === 'completed',
    staleTime: Infinity,
  })

  const isRunning = status?.status === 'pending' || status?.status === 'running'
  const progress = guessProgress(status?.progress_message)

  if (statusLoading) {
    return <Loader3D message="Loading results" size="lg" />
  }

  if (!status) {
    return (
      <div
        className="rounded-2xl p-10 text-center text-slate-500"
        style={{
          background: '#ffffff',
          boxShadow: 'var(--elevation-2)',
          border: '1px solid rgba(226,232,240,0.80)',
        }}
      >
        <p className="font-medium">Job not found.</p>
        <Link to="/jobs" className="mt-2 inline-block text-sm text-violet-600 hover:text-violet-700 transition-colors">
          Back to Jobs
        </Link>
      </div>
    )
  }

  const overview = results?.overview

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-400" aria-label="Breadcrumb">
        <Link to="/jobs" className="hover:text-slate-700 transition-colors">Jobs</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="text-slate-600 font-medium truncate max-w-xs">
          {status.label ?? <span className="font-mono text-xs">{jobId?.slice(0, 8)}…</span>}
        </span>
      </nav>

      {/* ── Job Header Panel ─────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: '#ffffff',
          boxShadow: 'var(--elevation-3)',
          border: '1px solid rgba(226,232,240,0.70)',
        }}
      >
        {/* Top accent line */}
        <div
          className="h-0.5"
          style={{ background: 'linear-gradient(90deg, #7c3aed, #6366f1, #a78bfa, transparent)' }}
          aria-hidden="true"
        />

        <div className="px-6 pt-5 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* Title + status + ID */}
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Icon badge */}
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.10) 0%, rgba(99,102,241,0.06) 100%)',
                    border: '1px solid rgba(196,181,253,0.35)',
                    boxShadow: 'var(--elevation-1)',
                  }}
                >
                  <Database className="h-4.5 w-4.5 text-violet-600" style={{ height: '18px', width: '18px' }} aria-hidden="true" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 font-display tracking-tight">
                  {status.label ?? 'Unlabeled Assessment'}
                </h1>
                <StatusBadge status={status.status} />
              </div>
              <p className="text-xs text-slate-400 font-mono pl-12">{jobId}</p>
            </div>

            {/* Download actions */}
            {status.status === 'completed' && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  disabled={downloading}
                  onClick={handleDownload}
                >
                  {downloading ? 'Downloading…' : 'Excel Report'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={downloadingWord ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  disabled={downloadingWord}
                  onClick={handleDownloadWord}
                >
                  {downloadingWord ? 'Downloading…' : 'Fabric (Word)'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Timestamps strip */}
        <div
          className="px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t"
          style={{
            borderColor: 'rgba(226,232,240,0.70)',
            background: 'linear-gradient(180deg, #FAFAFE 0%, #ffffff 100%)',
          }}
        >
          {[
            { label: 'Created',   value: formatDateTime(status.created_at) },
            { label: 'Started',   value: formatDateTime(status.started_at) },
            { label: 'Completed', value: formatDateTime(status.completed_at) },
            {
              label: 'Duration',
              value: (
                <span className="tabular-nums font-medium text-slate-700">
                  {elapsed(status.started_at, status.completed_at)}
                  {isRunning && <span className="ml-1 text-violet-400 animate-pulse">…</span>}
                </span>
              ),
            },
          ].map(({ label, value }, i) => (
            <div key={label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-200 select-none mr-4">·</span>}
              <Clock className="h-3 w-3 text-slate-300" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
              <span className="text-xs text-slate-600">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Running state — Progress panel ──────────────────────────────── */}
      {isRunning && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            boxShadow: 'var(--elevation-2)',
            border: '1px solid rgba(226,232,240,0.70)',
          }}
        >
          {/* 3D Loader centered */}
          <div className="flex flex-col items-center pt-6 pb-2">
            <Loader3D
              message={status.status === 'pending' ? 'Queued — waiting to start…' : (status.progress_message ?? 'Running assessment…')}
              size="sm"
            />
          </div>

          {/* Progress bar + percentage */}
          <div className="px-6 pb-5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400 shrink-0" aria-hidden="true" />
                <span className="text-xs text-slate-500 truncate max-w-sm">
                  {status.status === 'pending' ? 'Queued — waiting to start…' : (status.progress_message ?? 'Running assessment…')}
                </span>
              </div>
              <span
                className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: 'rgba(124,58,237,0.08)',
                  color: '#7c3aed',
                  border: '1px solid rgba(196,181,253,0.35)',
                }}
              >
                {progress}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(124,58,237,0.08)' }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #7c3aed, #6366f1)',
                }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <p className="text-[11px] text-slate-400">This page auto-refreshes every 2 seconds.</p>
          </div>
        </div>
      )}

      {/* ── Failed state ─────────────────────────────────────────────────── */}
      {status.status === 'failed' && (
        <div
          className="rounded-2xl px-6 py-5 flex items-start gap-3"
          style={{
            background: 'rgba(239,68,68,0.04)',
            border: '1px solid rgba(239,68,68,0.20)',
            boxShadow: 'var(--elevation-1)',
          }}
        >
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold text-red-600">Assessment failed</p>
            <p className="text-sm text-red-500/80 mt-1">{status.error ?? 'An unknown error occurred.'}</p>
          </div>
        </div>
      )}

      {/* ── Completed — Intelligence Brief ────────────────────────────────── */}
      {status.status === 'completed' && overview && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            boxShadow: 'var(--elevation-2)',
            border: '1px solid rgba(226,232,240,0.70)',
          }}
        >
          {/* Header row */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" style={{ height: '18px', width: '18px' }} aria-hidden="true" />
              <span className="text-sm font-semibold text-slate-800">
                {overview.database_name}
              </span>
              <span className="text-slate-300 select-none">·</span>
              <span className="text-xs text-slate-500 truncate max-w-xs">
                {overview.sql_server_version?.split('\n')[0]}
              </span>
            </div>
            {results?.access_level && (
              <AccessLevelBadge level={results.access_level as AccessLevel} />
            )}
          </div>

          {/* Data strip */}
          <div
            className="px-5 py-3 flex flex-wrap items-center gap-x-0 gap-y-2 border-t"
            style={{
              borderColor: 'rgba(226,232,240,0.70)',
              background: 'linear-gradient(180deg, #FAFAFE 0%, #F8F9FB 100%)',
            }}
          >
            {[
              { label: 'Tables',       value: overview.table_count,        icon: Table2        },
              { label: 'Views',        value: overview.view_count,         icon: Eye           },
              { label: 'Schemas',      value: overview.schema_count,       icon: Database      },
              { label: 'Stored Procs', value: overview.stored_proc_count,  icon: Code2         },
              { label: 'Functions',    value: overview.function_count,     icon: FunctionSquare },
              {
                label: 'Total Size',
                value: overview.total_size_mb != null
                  ? `${overview.total_size_mb.toLocaleString()} MB`
                  : null,
                icon: HardDrive,
              },
            ].map(({ label, value, icon: Icon }, i) => (
              <div key={label} className="flex items-center">
                {i > 0 && (
                  <div className="h-5 w-px mx-4 shrink-0" style={{ background: 'rgba(226,232,240,0.90)' }} aria-hidden="true" />
                )}
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span className="text-[11px] text-slate-500 font-medium">{label}</span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums ml-0.5">
                    {value ?? <span className="text-slate-300 font-normal">—</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results dashboard — nav sidebar + content ──────────────────── */}
      {status.status === 'completed' && (
        <div
          className="rounded-2xl overflow-hidden flex"
          style={{
            background: '#ffffff',
            boxShadow: 'var(--elevation-3)',
            border: '1px solid rgba(226,232,240,0.70)',
            minHeight: '620px',
          }}
        >
          {/* Left navigation sidebar */}
          <nav
            className="w-52 flex-shrink-0 overflow-y-auto scrollbar-thin py-3"
            style={{
              background: 'linear-gradient(180deg, #FAFAFE 0%, #F5F7FF 100%)',
              borderRight: '1px solid rgba(226,232,240,0.70)',
            }}
            aria-label="Assessment sections"
          >
            {TAB_GROUPS.map((group) => {
              const accessLevel = (results?.access_level ?? 'db_datareader') as AccessLevel
              const accessRank = ACCESS_LEVEL_RANK[accessLevel] ?? 1
              return (
                <div key={group.label} className="mb-1">
                  <p className="px-4 pt-3 pb-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-[0.14em]">
                    {group.label}
                  </p>
                  <ul role="list">
                    {group.ids.map((id) => {
                      const tab = TABS.find((t) => t.id === id)!
                      const count = results ? (tab.getData(results) ?? []).length : null
                      const isActive = activeTab === id
                      const minLevel = TAB_MIN_ACCESS[id] ?? 'db_datareader'
                      const minRank = ACCESS_LEVEL_RANK[minLevel] ?? 1
                      const isLocked = results != null && accessRank < minRank
                      return (
                        <li key={id}>
                          <button
                            onClick={() => setActiveTab(id)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 mx-1 text-xs transition-all duration-120 rounded-lg focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:outline-none ${
                              isActive
                                ? 'bg-violet-50 text-violet-700 font-semibold'
                                : isLocked
                                  ? 'text-slate-300 cursor-default'
                                  : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-800'
                            }`}
                            style={{
                              width: 'calc(100% - 8px)',
                              boxShadow: isActive ? 'var(--elevation-1)' : undefined,
                            }}
                            aria-selected={isActive}
                            role="tab"
                          >
                            <span className={`shrink-0 ${isActive ? 'text-violet-600' : isLocked ? 'text-slate-300' : 'text-slate-400'}`}>
                              {tab.icon}
                            </span>
                            <span className="truncate flex-1 text-left">{tab.label}</span>
                            {isLocked ? (
                              <Lock className="h-2.5 w-2.5 text-slate-300 shrink-0" aria-hidden="true" />
                            ) : count !== null ? (
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${
                                  isActive
                                    ? 'bg-violet-100 text-violet-600'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {count > 9999 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString()}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {resultsLoading ? (
              <Loader3D message="Loading results" size="sm" />
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
                  <div className="flex flex-col flex-1 overflow-hidden">
                    {/* Tab content header */}
                    <div
                      className="flex items-center gap-3 px-5 py-3.5 border-b flex-wrap"
                      style={{ borderColor: 'rgba(226,232,240,0.70)' }}
                    >
                      <span className="text-slate-400">{tab.icon}</span>
                      <h2 className="text-sm font-semibold text-slate-800 font-display">{tab.label}</h2>
                      <span
                        className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(124,58,237,0.07)',
                          color: '#7c3aed',
                          border: '1px solid rgba(196,181,253,0.30)',
                        }}
                      >
                        {data.length.toLocaleString()} row{data.length !== 1 ? 's' : ''}
                      </span>
                      {minRank > 1 && (
                        <span className="ml-auto text-[10px] text-slate-400 flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                          Requires {minLevel}
                        </span>
                      )}
                    </div>

                    {/* Data table */}
                    <div className="flex-1 overflow-auto p-5">
                      <DataTable
                        key={activeTab}
                        data={data}
                        columns={columns}
                        emptyMessage={tab.emptyMessage}
                        searchable
                      />
                    </div>
                  </div>
                )
              })()
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
