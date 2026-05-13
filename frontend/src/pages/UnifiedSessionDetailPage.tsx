/**
 * UnifiedSessionDetailPage — consolidated report for a unified assessment session.
 *
 * Layout:
 *   - Sticky summary bar: session ID, mode badge, status
 *   - Source Assessment section (collapsible) — shown only when mode includes 'source'
 *   - Fabric Assessment section (collapsible) — shown only when mode includes 'fabric'
 *   - Comparison table — shown only when mode === 'both' and both are completed
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, RefreshCw, CheckCircle2, XCircle, Clock,
  Loader2, Database, Zap, Layers3, AlertTriangle,
  ChevronDown, ChevronUp, FileText, Download, BarChart2,
  Server, Building2,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { UnifiedSession, UnifiedSessionStatus } from '../types/api'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { formatDateTime } from '../utils/dateTime'

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:      { label: 'Pending',      color: 'text-slate-600', bg: 'bg-slate-100',   icon: Clock },
  running:      { label: 'Running',      color: 'text-blue-700',  bg: 'bg-blue-50',     icon: Loader2 },
  source_done:  { label: 'Source done — awaiting Fabric', color: 'text-amber-700', bg: 'bg-amber-50', icon: Clock },
  completed:    { label: 'Completed',    color: 'text-emerald-700', bg: 'bg-emerald-50', icon: CheckCircle2 },
  partial:      { label: 'Partial',      color: 'text-amber-700', bg: 'bg-amber-50',    icon: AlertTriangle },
  failed:       { label: 'Failed',       color: 'text-red-700',   bg: 'bg-red-50',      icon: XCircle },
  cancelled:    { label: 'Cancelled',    color: 'text-slate-500', bg: 'bg-slate-100',   icon: XCircle },
}

function StatusBadge({ status }: { status: UnifiedSessionStatus | string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color} ${cfg.bg}`}>
      <Icon className={`h-3.5 w-3.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  )
}

const MODE_LABELS: Record<string, string> = {
  source: 'Source DB Only',
  fabric: 'Fabric Only',
  both:   'Full Assessment',
}

const JOB_STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-600',
  running:   'text-blue-600',
  failed:    'text-red-600',
  pending:   'text-slate-500',
  cancelled: 'text-slate-400',
}

// ── Collapsible section ───────────────────────────────────────────────────────

function CollapsibleSection({
  title, icon: Icon, iconBg, defaultOpen = true, badge, children,
}: {
  title: string; icon: React.ElementType; iconBg: string; defaultOpen?: boolean
  badge?: React.ReactNode; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" style={{ boxShadow: 'var(--elevation-1)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg }}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className="flex-1 text-sm font-bold text-slate-900">{title}</span>
        {badge}
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </div>
  )
}

// ── Source section body ───────────────────────────────────────────────────────

function SourceSectionBody({ session, onViewDashboard }: { session: UnifiedSession; onViewDashboard?: () => void }) {
  const src = session.source
  if (!src) {
    return (
      <div className="px-5 py-6 text-center text-sm text-slate-400">
        Source assessment has not started yet.
      </div>
    )
  }

  const canDownload = src.jobs?.some(j => j.status === 'completed')
  const canNavigate = src.status === 'completed' || src.status === 'partial'

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total jobs', value: src.total_jobs },
          { label: 'Completed', value: src.completed_jobs, color: 'text-emerald-600' },
          { label: 'Failed', value: src.failed_jobs, color: src.failed_jobs > 0 ? 'text-red-600' : undefined },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-center">
            <p className={`text-xl font-bold ${color || 'text-slate-900'}`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* Jobs list */}
      {src.jobs && src.jobs.length > 0 && (
        <div className="space-y-1.5">
          {src.jobs.map(job => (
            <div key={job.job_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <Server className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="text-sm text-slate-700 flex-1">
                <span className="font-medium">{job.server}</span>
                {job.database && <span className="text-slate-400"> / {job.database}</span>}
              </span>
              <span className={`text-xs font-semibold capitalize ${JOB_STATUS_COLOR[job.status] || 'text-slate-500'}`}>
                {job.status === 'running' && job.progress_message
                  ? job.progress_message.length > 40
                    ? job.progress_message.slice(0, 40) + '…'
                    : job.progress_message
                  : job.status}
              </span>
              {job.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />}
              {job.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
              {job.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {/* Download buttons */}
      {canDownload && src.session_id && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => api.downloadSessionReport(src.session_id, `source_${src.session_id.slice(0, 8)}.xlsx`)}
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Download Excel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => api.downloadSessionWordReport(src.session_id, `source_${src.session_id.slice(0, 8)}.docx`)}
          >
            <FileText className="h-3.5 w-3.5 mr-1" /> Download Word
          </Button>
        </div>
      )}

      {/* View dashboard / not-assessed affordance */}
      <div className="pt-1 border-t border-slate-100">
        {canNavigate && onViewDashboard ? (
          <button
            onClick={onViewDashboard}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 hover:border-emerald-200 transition-colors cursor-pointer group"
          >
            <span className="text-sm font-medium text-emerald-800">View Full Dashboard</span>
            <ArrowRight className="h-4 w-4 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 opacity-50 cursor-default">
            <span className="text-sm text-slate-500">Not Assessed</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Unavailable</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Fabric section body ───────────────────────────────────────────────────────

function FabricSectionBody({ session, onViewDashboard }: { session: UnifiedSession; onViewDashboard?: () => void }) {
  const fab = session.fabric
  if (!fab) {
    return (
      <div className="px-5 py-6 text-center text-sm text-slate-400">
        {session.mode === 'both' && !['completed', 'partial'].includes(session.source?.status ?? '')
          ? 'Fabric assessment will start after source assessment is submitted.'
          : 'Fabric assessment has not started yet.'}
      </div>
    )
  }

  const summary = fab.results?.summary
  const workspaces = fab.results?.workspaces || []
  const canNavigate = fab.status === 'completed'

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Status / progress */}
      {fab.status === 'running' && (
        <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-xl px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          {fab.progress_message || 'Assessment in progress…'}
        </div>
      )}
      {fab.status === 'failed' && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {fab.error || 'Assessment failed.'}
        </div>
      )}

      {/* Summary metrics */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Workspaces', value: summary.workspace_count },
            { label: 'Datasets', value: summary.dataset_count },
            { label: 'Reports', value: summary.report_count },
            { label: 'Measures', value: summary.total_measures },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-center">
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Workspace list */}
      {workspaces.length > 0 && (
        <div className="space-y-1.5">
          {workspaces.map(ws => (
            <div key={ws.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <Building2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="flex-1 text-sm font-medium text-slate-800">{ws.name}</span>
              <span className="text-xs text-slate-400">{ws.dataset_count} models · {ws.report_count} reports</span>
            </div>
          ))}
        </div>
      )}

      {/* Download */}
      {fab.status === 'completed' && fab.fabric_session_id && (
        <div className="pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => api.downloadFabricExcel(fab.fabric_session_id, fab.label)}
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Download Fabric Excel
          </Button>
        </div>
      )}

      {/* View dashboard / not-assessed affordance */}
      <div className="pt-1 border-t border-slate-100">
        {canNavigate && onViewDashboard ? (
          <button
            onClick={onViewDashboard}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 hover:border-emerald-200 transition-colors cursor-pointer group"
          >
            <span className="text-sm font-medium text-emerald-800">View Full Dashboard</span>
            <ArrowRight className="h-4 w-4 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 opacity-50 cursor-default">
            <span className="text-sm text-slate-500">Not Assessed</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Unavailable</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Side-by-side comparison ───────────────────────────────────────────────────

function ComparisonTable({ session }: { session: UnifiedSession }) {
  const src = session.source
  const fab = session.fabric

  if (!src || !fab || fab.status !== 'completed') return null

  const fabSummary = fab.results?.summary
  const srcTotal = src.completed_jobs

  const rows = [
    { metric: 'Databases / Workspaces assessed', source: `${srcTotal} database${srcTotal !== 1 ? 's' : ''}`, fabric: `${fabSummary?.workspace_count ?? '—'} workspace${(fabSummary?.workspace_count ?? 0) !== 1 ? 's' : ''}` },
    { metric: 'Objects / Datasets', source: `${src.completed_jobs} jobs completed`, fabric: `${fabSummary?.dataset_count ?? '—'} semantic models` },
    { metric: 'Reports / Visuals', source: '—', fabric: `${fabSummary?.report_count ?? '—'} reports · ${fabSummary?.total_visuals ?? '—'} visuals` },
    { metric: 'Relationships', source: 'See Source report', fabric: `${fabSummary?.total_relationships ?? '—'}` },
    { metric: 'Calculated objects', source: '—', fabric: `${(fabSummary?.total_calculated_columns ?? 0) + (fabSummary?.total_calculated_tables ?? 0)} calc columns/tables` },
    { metric: 'Measures', source: '—', fabric: `${fabSummary?.total_measures ?? '—'}` },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" style={{ boxShadow: 'var(--elevation-1)' }}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #2d6a4f, #0ea5e9)' }}>
          <BarChart2 className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-bold text-slate-900">Side-by-Side Comparison</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/3">Metric</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-emerald-700 uppercase tracking-wider w-1/3">
                <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Source DB</span>
              </th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-emerald-700 uppercase tracking-wider w-1/3">
                <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Fabric</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => (
              <tr key={row.metric} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-3 font-medium text-slate-700">{row.metric}</td>
                <td className="px-5 py-3 text-slate-600">{row.source}</td>
                <td className="px-5 py-3 text-slate-600">{row.fabric}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UnifiedSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const { data: session, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['unified-session', sessionId],
    queryFn: async () => {
      const { data } = await api.getUnifiedSession(sessionId!)
      return data
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return 3000
      if (['completed', 'failed', 'cancelled'].includes(status)) return false
      return 4000
    },
    enabled: !!sessionId,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500">Loading assessment report…</p>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <XCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-slate-600">{getApiErrorMessage(error)}</p>
        <Button variant="secondary" onClick={() => navigate('/unified/sessions')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    )
  }

  const showSource = session.mode === 'source' || session.mode === 'both'
  const showFabric = session.mode === 'fabric' || session.mode === 'both'
  const showComparison = session.mode === 'both' &&
    session.source?.status && ['completed', 'partial'].includes(session.source.status) &&
    session.fabric?.status === 'completed'

  const isLive = !['completed', 'failed', 'cancelled'].includes(session.status)

  return (
    <div className="space-y-6">
      {/* ── Sticky summary bar ─────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-md px-5 py-4"
        style={{ boxShadow: '0 2px 16px rgba(45,106,79,0.08)' }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate('/unified/sessions')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Mode icon */}
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: session.mode === 'source'
                ? 'linear-gradient(135deg, #2d6a4f, #40916c)'
                : session.mode === 'fabric'
                ? 'linear-gradient(135deg, #2d6a4f, #0ea5e9)'
                : 'linear-gradient(135deg, #2d6a4f, #0ea5e9)',
            }}
          >
            {session.mode === 'source' ? <Database className="h-4.5 w-4.5 text-white" style={{ height: '18px', width: '18px' }} /> :
             session.mode === 'fabric' ? <Zap className="h-4.5 w-4.5 text-white" style={{ height: '18px', width: '18px' }} /> :
             <Layers3 className="h-4.5 w-4.5 text-white" style={{ height: '18px', width: '18px' }} />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {session.label && (
                <span className="text-sm font-bold text-slate-900 truncate">{session.label}</span>
              )}
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                style={{
                  background: 'linear-gradient(135deg, rgba(45,106,79,0.08), rgba(64,145,108,0.06))',
                  color: '#2d6a4f',
                  border: '1px solid rgba(143,202,170,0.30)',
                }}
              >
                {MODE_LABELS[session.mode]}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="font-mono text-[10px] text-slate-400">
                {session.unified_session_id.slice(0, 8)}
              </span>
              {session.created_at && (
                <span className="text-[10px] text-slate-400">
                  Started {formatDateTime(session.created_at)}
                </span>
              )}
            </div>
          </div>

          <StatusBadge status={session.status} />

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Live indicator */}
        {isLive && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            Assessment in progress — auto-refreshing every 4 seconds
          </div>
        )}
      </div>

      {/* ── Source section ─────────────────────────────────────────────────── */}
      {showSource && (
        <CollapsibleSection
          title="Source Database Assessment"
          icon={Database}
          iconBg="linear-gradient(135deg, #2d6a4f, #40916c)"
          badge={
            (session.source?.status || session.source_status)
              ? <StatusBadge status={session.source?.status || session.source_status!} />
              : undefined
          }
        >
          <SourceSectionBody
            session={session}
            onViewDashboard={
              session.source?.session_id &&
              (session.source?.status === 'completed' || session.source?.status === 'partial')
                ? () => navigate(`/sessions/${session.source!.session_id}`, {
                    state: { fromConsolidated: true, unifiedSessionId: sessionId },
                  })
                : undefined
            }
          />
        </CollapsibleSection>
      )}

      {/* ── Fabric section ─────────────────────────────────────────────────── */}
      {showFabric && (
        <CollapsibleSection
          title="Fabric Assessment"
          icon={Zap}
          iconBg="linear-gradient(135deg, #2d6a4f, #0ea5e9)"
          badge={
            (session.fabric?.status || session.fabric_status)
              ? <StatusBadge status={session.fabric?.status || session.fabric_status!} />
              : undefined
          }
        >
          <FabricSectionBody
            session={session}
            onViewDashboard={
              session.fabric?.fabric_session_id && session.fabric?.status === 'completed'
                ? () => navigate(`/fabric/sessions/${session.fabric!.fabric_session_id}`, {
                    state: { fromConsolidated: true, unifiedSessionId: sessionId },
                  })
                : undefined
            }
          />
        </CollapsibleSection>
      )}

      {/* ── Comparison table ────────────────────────────────────────────────── */}
      {showComparison && <ComparisonTable session={session} />}

      {/* ── Empty state: nothing yet ─────────────────────────────────────── */}
      {!showSource && !showFabric && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Layers3 className="h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">Waiting for assessments to start…</p>
        </div>
      )}
    </div>
  )
}
