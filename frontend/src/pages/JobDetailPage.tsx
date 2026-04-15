import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight, Download, AlertTriangle, CheckCircle2, Loader2,
  Clock, Database, Table2, Columns, Eye,
  Code2, FunctionSquare, ListTree, GitMerge,
  BarChart2, Activity, Search,
  Users, UserX, ShieldAlert, Zap, Cpu, Lock, KeyRound, Fingerprint,
  Bot, Link2, Network, GitBranch, MessageSquare, MonitorCheck,
} from 'lucide-react'
import { api } from '../api/client'
import { StatusBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import StatCard from '../components/ui/StatCard'
import DataTable, { type ColumnDef } from '../components/ui/DataTable'
import type { AssessmentResults } from '../types/api'

/* ─── helpers ─── */
function formatDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatDuration(start?: string, end?: string): string {
  if (!start) return '—'
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
  if (ms < 1000) return '<1s'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  return `${mins}m ${secs % 60}s`
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
    emptyMessage: 'No SQL Agent jobs found or msdb access denied.',
  },
  {
    id: 'linked_servers',
    label: 'Linked Servers',
    icon: <Link2 className="h-4 w-4" />,
    getData: (r) => r.linked_servers,
    emptyMessage: 'No linked servers configured.',
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
  'SQL Agent', 'Linked servers', 'Cross-database', 'Replication',
  'Service Broker', 'Version',
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

  const handleDownload = useCallback(async () => {
    if (!jobId || downloading) return
    setDownloading(true)
    try {
      await api.downloadReport(jobId, `sql_assessment_${jobId.slice(0, 8)}.xlsx`)
    } finally {
      setDownloading(false)
    }
  }, [jobId, downloading])

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
            <Button
              variant="secondary"
              size="sm"
              leftIcon={downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              disabled={downloading}
              onClick={handleDownload}
              className="shrink-0"
            >
              {downloading ? 'Downloading…' : 'Download Report (.xlsx)'}
            </Button>
          )}
        </div>

        {/* Timestamps */}
        <div className="border-t border-slate-100 px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 text-sm">
          {[
            { label: 'Created',   value: formatDate(status.created_at) },
            { label: 'Started',   value: formatDate(status.started_at) },
            { label: 'Completed', value: formatDate(status.completed_at) },
            {
              label: 'Duration',
              value: (
                <span className="tabular-nums">
                  {formatDuration(status.started_at, status.completed_at)}
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
            <p className="text-sm font-medium text-emerald-700">
              Assessment complete — <span className="font-bold">{overview.database_name}</span> on{' '}
              {overview.sql_server_version?.split('\n')[0]}
            </p>
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

      {/* Results tabs */}
      {status.status === 'completed' && (
        <div className="card overflow-hidden">
          {/* Tab bar */}
          <div className="border-b border-slate-200 overflow-x-auto scrollbar-thin">
            <div className="flex min-w-max px-2 pt-2">
              {TABS.map((tab) => {
                const count = results ? (tab.getData(results) ?? []).length : null
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium
                      border-b-2 transition-colors duration-150 whitespace-nowrap
                      ${isActive
                        ? 'border-brand-600 text-brand-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
                    `}
                    aria-selected={isActive}
                    role="tab"
                  >
                    {tab.icon}
                    {tab.label}
                    {count !== null && (
                      <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold
                        ${isActive ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                        {count.toLocaleString()}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="p-5">
            {resultsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size="lg" className="text-brand-500" />
              </div>
            ) : results ? (
              (() => {
                const tab = TABS.find((t) => t.id === activeTab)!
                const data = tab.getData(results) ?? []
                const columns = tab.id === 'null_analysis'
                  ? buildNullAnalysisColumns(data)
                  : tab.columns
                return (
                  <DataTable
                    data={data}
                    columns={columns}
                    emptyMessage={tab.emptyMessage}
                    searchable
                  />
                )
              })()
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
