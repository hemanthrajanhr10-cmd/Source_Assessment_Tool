import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, RefreshCw, CheckCircle2, XCircle, FileText,
  Loader2, Clock, AlertTriangle, Database, Server, StopCircle,
  ChevronDown, ChevronUp, ListChecks,
} from 'lucide-react'
import { api } from '../api/client'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import type { JobStatus, SessionJobInfo, SessionStatus } from '../types/api'
import { formatDateTime, elapsed } from '../utils/dateTime'

const ASSESSMENT_STEPS = [
  { key: 'overview',          label: 'Database overview' },
  { key: 'schemas',           label: 'Schemas' },
  { key: 'tables',            label: 'Tables' },
  { key: 'columns',           label: 'Columns' },
  { key: 'views',             label: 'Views' },
  { key: 'stored procedures', label: 'Stored procedures' },
  { key: 'functions',         label: 'Functions' },
  { key: 'indexes',           label: 'Indexes' },
  { key: 'relationships',     label: 'Relationships' },
  { key: 'index coverage',    label: 'Index coverage' },
  { key: 'insertion frequency', label: 'Insertion frequency' },
  { key: 'database users',    label: 'Database users & roles' },
  { key: 'orphaned users',    label: 'Orphaned users' },
  { key: 'excessive permissions', label: 'Excessive permissions' },
  { key: 'dynamic sql',       label: 'Dynamic SQL usage' },
  { key: 'clr',               label: 'CLR assemblies' },
  { key: 'tde',               label: 'TDE status' },
  { key: 'column-level encryption', label: 'Column encryption' },
  { key: 'pii',               label: 'PII scan' },
  { key: 'sql agent',         label: 'SQL Agent jobs' },
  { key: 'linked servers',    label: 'Linked servers' },
  { key: 'cross-database',    label: 'Cross-DB references' },
  { key: 'replication',       label: 'Replication' },
  { key: 'service broker',    label: 'Service Broker' },
  { key: 'version',           label: 'Version & features' },
  { key: 'null analysis',     label: 'Null analysis' },
  { key: 'building report',   label: 'Building Excel report' },
  { key: 'persisting results', label: 'Persisting results' },
]

function getCompletedSteps(progressMsg?: string, status?: string): number {
  if (!progressMsg) return 0
  if (status === 'completed') return ASSESSMENT_STEPS.length
  const lower = progressMsg.toLowerCase()
  const idx = ASSESSMENT_STEPS.findIndex((s) => lower.includes(s.key))
  return idx === -1 ? 0 : idx
}

function ProgressDetails({ job }: { job: SessionJobInfo }) {
  const [open, setOpen] = useState(false)
  if (job.status !== 'running' && job.status !== 'completed') return null

  const completedCount = getCompletedSteps(job.progress_message ?? undefined, job.status)
  const total = ASSESSMENT_STEPS.length

  return (
    <div className="mt-3 border border-zinc-800/70 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-zinc-900/60 hover:bg-zinc-800/40 transition-colors text-left"
      >
        <ListChecks className="h-4 w-4 text-amber-500/70 shrink-0" />
        <span className="text-xs font-semibold text-zinc-300 flex-1">
          Assessment Progress — {completedCount} / {total} steps done
        </span>
        <span className="text-xs text-zinc-600 tabular-nums mr-2">
          {Math.round((completedCount / total) * 100)}%
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-zinc-600" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />}
      </button>

      {open && (
        <div className="px-4 py-3 bg-zinc-950/40 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
          {ASSESSMENT_STEPS.map((step, i) => {
            const done = i < completedCount
            const active = i === completedCount && job.status === 'running'
            return (
              <div key={step.key} className="flex items-center gap-1.5">
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-zinc-700 shrink-0" />
                )}
                <span className={`text-xs truncate ${
                  done   ? 'text-emerald-400 font-medium' :
                  active ? 'text-blue-400 font-medium' :
                           'text-zinc-600'
                }`}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function JobStatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case 'completed':  return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
    case 'failed':     return <XCircle className="h-4 w-4 text-red-400" />
    case 'running':    return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
    case 'cancelled':  return <StopCircle className="h-4 w-4 text-zinc-500" />
    default:           return <Clock className="h-4 w-4 text-zinc-500" />
  }
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, string> = {
    completed:  'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
    failed:     'bg-red-500/10    text-red-400    ring-1 ring-red-500/20',
    running:    'bg-blue-500/10   text-blue-400   ring-1 ring-blue-500/20',
    pending:    'bg-zinc-800      text-zinc-400   ring-1 ring-zinc-700/50',
    cancelled:  'bg-zinc-800      text-zinc-500   ring-1 ring-zinc-700/50',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[status]}`}>
      <JobStatusIcon status={status} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function SessionBanner({ status, completed, total, failed }: {
  status: SessionStatus; completed: number; total: number; failed: number
}) {
  const pct = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0
  const config: Record<SessionStatus, { border: string; text: string; bg: string; icon: React.ReactNode }> = {
    pending:   { bg: 'bg-zinc-900/60',    border: 'border-zinc-800',     text: 'text-zinc-400',   icon: <Clock className="h-5 w-5" /> },
    running:   { bg: 'bg-blue-500/5',     border: 'border-blue-500/20',  text: 'text-blue-400',   icon: <Loader2 className="h-5 w-5 animate-spin" /> },
    completed: { bg: 'bg-emerald-500/5',  border: 'border-emerald-500/20', text: 'text-emerald-400', icon: <CheckCircle2 className="h-5 w-5" /> },
    partial:   { bg: 'bg-amber-500/5',    border: 'border-amber-500/20', text: 'text-amber-400',  icon: <AlertTriangle className="h-5 w-5" /> },
    failed:    { bg: 'bg-red-500/5',      border: 'border-red-500/20',   text: 'text-red-400',    icon: <XCircle className="h-5 w-5" /> },
    cancelled: { bg: 'bg-zinc-900/60',    border: 'border-zinc-800',     text: 'text-zinc-500',   icon: <StopCircle className="h-5 w-5" /> },
  }
  const { bg, border, text, icon } = config[status]

  return (
    <div className={`rounded-xl border ${bg} ${border} p-4 space-y-3`}>
      <div className={`flex items-center gap-2.5 ${text}`}>
        {icon}
        <span className="font-semibold text-sm">
          {status === 'completed'  && 'All assessments completed successfully.'}
          {status === 'partial'    && `${failed} of ${total} assessments failed. ${completed} succeeded.`}
          {status === 'failed'     && 'All assessments failed.'}
          {status === 'running'    && `Running — ${completed + failed} of ${total} done.`}
          {status === 'pending'    && 'Session queued, starting shortly…'}
          {status === 'cancelled'  && 'Session was cancelled.'}
        </span>
      </div>
      {total > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden flex">
            <div className="h-full bg-emerald-500/70 transition-all duration-500" style={{ width: `${(completed / total) * 100}%` }} />
            <div className="h-full bg-red-500/70 transition-all duration-500" style={{ width: `${(failed / total) * 100}%` }} />
          </div>
          <p className={`text-xs ${text}`}>{pct}% complete</p>
        </div>
      )}
    </div>
  )
}

function DurationCell({ job }: { job: SessionJobInfo }) {
  if (job.status === 'pending') {
    return <span className="text-zinc-700">—</span>
  }
  if (job.status === 'running') {
    const e = elapsed(job.started_at ?? undefined, undefined)
    return <span className="text-blue-400 tabular-nums">{e === '—' ? 'Starting…' : `${e} elapsed`}</span>
  }
  return <span className="tabular-nums text-zinc-500">{elapsed(job.started_at ?? undefined, job.completed_at ?? undefined)}</span>
}

function JobRow({ job, onNavigate }: { job: SessionJobInfo; onNavigate: (jobId: string) => void }) {
  return (
    <tr
      className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
      onClick={() => onNavigate(job.job_id)}
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Server className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
          <span className="text-sm font-medium text-zinc-200 truncate max-w-[160px]" title={job.server}>
            {job.server || '—'}
          </span>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
          <span className="text-sm text-zinc-300 truncate max-w-[160px]" title={job.database}>
            {job.database || '—'}
          </span>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <JobStatusBadge status={job.status} />
        {job.progress_message && job.status === 'running' && (
          <p className="text-xs text-zinc-600 mt-1 max-w-[180px] truncate">{job.progress_message}</p>
        )}
        {job.error && (
          <p className="text-xs text-red-400 mt-1 max-w-[220px] truncate" title={job.error}>
            {job.error}
          </p>
        )}
      </td>
      <td className="px-5 py-3.5 text-xs whitespace-nowrap">
        <DurationCell job={job} />
      </td>
    </tr>
  )
}

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [wordDownloading, setWordDownloading] = useState(false)

  const handleSessionWordDownload = async () => {
    if (!session || wordDownloading) return
    setWordDownloading(true)
    try {
      await api.downloadSessionWordReport(
        session.session_id,
        `fabric_assessment_${session.session_id.slice(0, 8)}.docx`,
      )
    } finally {
      setWordDownloading(false)
    }
  }

  const { data: session, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSessionStatus(sessionId!).then((r) => r.data),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const s = query.state.data
      if (!s) return false
      return s.status === 'pending' || s.status === 'running' ? 2000 : false
    },
    refetchOnMount: true,
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelSession(session?.session_id ?? ''),
    onSuccess: () => {
      setShowCancelConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size="xl" className="text-amber-500" />
      </div>
    )
  }

  if (isError || !session) {
    return (
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/sessions')}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Sessions
        </button>
        <div className="card p-8 text-center">
          <p className="font-medium text-red-400">Session not found or failed to load.</p>
        </div>
      </div>
    )
  }

  const isActive = session.status === 'pending' || session.status === 'running'

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <button
        onClick={() => navigate('/sessions')}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Sessions
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50 font-display">
            {session.label || 'Assessment Session'}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 font-mono">{session.session_id}</p>
          <p className="mt-0.5 text-xs text-zinc-600">Created {formatDateTime(session.created_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
                onClick={() => refetch()}
              >
                Refresh
              </Button>
              {!showCancelConfirm ? (
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<StopCircle className="h-3.5 w-3.5" />}
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Stop
                </Button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5">
                  <span className="text-xs text-red-400 font-medium">Stop all jobs?</span>
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? 'Stopping…' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    No
                  </button>
                </div>
              )}
            </>
          )}
          {(session.status === 'completed' || session.status === 'partial') && (
            <Button
              size="sm"
              leftIcon={wordDownloading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileText className="h-3.5 w-3.5" />}
              disabled={wordDownloading}
              onClick={handleSessionWordDownload}
            >
              {wordDownloading ? 'Downloading…' : 'Fabric Assessment (Word)'}
            </Button>
          )}
        </div>
      </div>

      <SessionBanner
        status={session.status}
        completed={session.completed_jobs}
        total={session.total_jobs}
        failed={session.failed_jobs}
      />

      {session.jobs.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-zinc-800/60 bg-zinc-900/60">
            <Database className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Databases</h2>
            <span className="ml-auto text-xs text-zinc-600">{session.jobs.length} total</span>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full divide-y divide-zinc-800/50 text-sm">
              <thead className="bg-zinc-900/80">
                <tr>
                  {['Server', 'Database', 'Status', 'Duration'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-widest whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {session.jobs.map((job) => (
                  <JobRow key={job.job_id} job={job} onNavigate={(id) => navigate(`/jobs/${id}`)} />
                ))}
              </tbody>
            </table>
          </div>

          {session.jobs.some((j) => j.status === 'running' || j.status === 'completed') && (
            <div className="px-6 pb-5 pt-2 space-y-2">
              {session.jobs
                .filter((j) => j.status === 'running' || j.status === 'completed')
                .map((job) => (
                  <ProgressDetails key={job.job_id} job={job} />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
