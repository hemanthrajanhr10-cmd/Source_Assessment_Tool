/**
 * UnifiedSessionDetailPage — consolidated report for a unified assessment session.
 *
 * Layout:
 *   - Sticky summary bar: session ID, mode badge, status, refresh
 *   - Source Assessment section (collapsible) — shown only when mode includes 'source'
 *   - Fabric Assessment section (collapsible) — shown only when mode includes 'fabric'
 *   - Unified Reports download panel — shown when at least one side is complete
 *   - Comparison table — shown only when mode === 'both' and both are completed
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, RefreshCw, CheckCircle2, XCircle, Clock,
  Loader2, Database, Zap, Layers3, AlertTriangle,
  ChevronDown, ChevronUp, FileText, Download, BarChart2,
  Server, Building2, FileSpreadsheet,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { UnifiedSession, UnifiedSessionStatus } from '../types/api'
import { formatDateTime } from '../utils/dateTime'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string
  textCls: string
  bgCls: string
  borderCls: string
  icon: React.ElementType
}> = {
  pending:      { label: 'Pending',                      textCls: 'text-[#71717a]', bgCls: 'bg-[rgba(113,113,122,0.1)]',  borderCls: 'border-[rgba(113,113,122,0.2)]',  icon: Clock },
  running:      { label: 'Running',                      textCls: 'text-[#60a5fa]', bgCls: 'bg-[rgba(96,165,250,0.1)]',   borderCls: 'border-[rgba(96,165,250,0.2)]',   icon: Loader2 },
  source_done:  { label: 'Source done — awaiting Fabric', textCls: 'text-[#fbbf24]', bgCls: 'bg-[rgba(251,191,36,0.08)]',  borderCls: 'border-[rgba(251,191,36,0.2)]',   icon: Clock },
  completed:    { label: 'Completed',                    textCls: 'text-[#34d399]', bgCls: 'bg-[rgba(52,211,153,0.1)]',   borderCls: 'border-[rgba(52,211,153,0.2)]',   icon: CheckCircle2 },
  partial:      { label: 'Partial',                      textCls: 'text-[#fbbf24]', bgCls: 'bg-[rgba(251,191,36,0.08)]',  borderCls: 'border-[rgba(251,191,36,0.2)]',   icon: AlertTriangle },
  failed:       { label: 'Failed',                       textCls: 'text-[#f87171]', bgCls: 'bg-[rgba(248,113,113,0.1)]',  borderCls: 'border-[rgba(248,113,113,0.2)]',  icon: XCircle },
  cancelled:    { label: 'Cancelled',                    textCls: 'text-[#52525b]', bgCls: 'bg-[rgba(82,82,91,0.1)]',     borderCls: 'border-[rgba(82,82,91,0.2)]',     icon: XCircle },
}

const JOB_STATUS: Record<string, string> = {
  completed: 'text-[#34d399]',
  running:   'text-[#60a5fa]',
  failed:    'text-[#f87171]',
  pending:   'text-[#71717a]',
  cancelled: 'text-[#52525b]',
}

const MODE_LABELS: Record<string, string> = {
  source: 'Source DB Only',
  fabric: 'Fabric Only',
  both:   'Full Assessment',
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: UnifiedSessionStatus | string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border
      ${cfg.textCls} ${cfg.bgCls} ${cfg.borderCls}`}>
      <Icon className={`h-3.5 w-3.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────

function CollapsibleSection({
  title, icon: Icon, iconGradient, defaultOpen = true, badge, children,
}: {
  title: string; icon: React.ElementType; iconGradient: string; defaultOpen?: boolean
  badge?: React.ReactNode; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      className="rounded-xl border border-[#3f3f46] bg-[#18181b] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left"
      >
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border border-[rgba(255,255,255,0.06)]"
          style={{ background: iconGradient }}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className="flex-1 text-sm font-bold text-[#f4f4f5]">{title}</span>
        {badge}
        {open
          ? <ChevronUp className="h-4 w-4 text-[#52525b]" />
          : <ChevronDown className="h-4 w-4 text-[#52525b]" />}
      </button>
      {open && <div className="border-t border-[#27272a]">{children}</div>}
    </div>
  )
}

// ── Source section body ───────────────────────────────────────────────────────

function SourceSectionBody({ session, onViewDashboard }: { session: UnifiedSession; onViewDashboard?: () => void }) {
  const src = session.source
  if (!src) {
    return (
      <div className="px-5 py-6 text-center text-sm text-[#52525b]">
        Source assessment has not started yet.
      </div>
    )
  }

  const canDownload = src.jobs?.some(j => j.status === 'completed')
  const canNavigate = src.status === 'completed' || src.status === 'partial'

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total jobs',  value: src.total_jobs },
          { label: 'Completed',   value: src.completed_jobs, positive: true },
          { label: 'Failed',      value: src.failed_jobs,    failure: src.failed_jobs > 0 },
        ].map(({ label, value, positive, failure }) => (
          <div key={label}
            className="rounded-xl border border-[#3f3f46] bg-[#27272a] px-4 py-3 text-center">
            <p className={`text-xl font-bold font-mono ${
              failure ? 'text-[#f87171]' : positive ? 'text-[#34d399]' : 'text-[#f4f4f5]'
            }`}>{value}</p>
            <p className="text-[10px] text-[#71717a] mt-0.5 uppercase tracking-widest">{label}</p>
          </div>
        ))}
      </div>

      {/* Jobs list */}
      {src.jobs && src.jobs.length > 0 && (
        <div className="space-y-1.5">
          {src.jobs.map(job => (
            <div key={job.job_id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#3f3f46] bg-[#27272a]">
              <Server className="h-4 w-4 text-[#52525b] shrink-0" />
              <span className="text-sm text-[#a1a1aa] flex-1">
                <span className="font-medium text-[#f4f4f5]">{job.server}</span>
                {job.database && <span className="text-[#71717a]"> / {job.database}</span>}
              </span>
              <span className={`text-xs font-semibold capitalize ${JOB_STATUS[job.status] || 'text-[#71717a]'}`}>
                {job.status === 'running' && job.progress_message
                  ? job.progress_message.length > 40 ? job.progress_message.slice(0, 40) + '…' : job.progress_message
                  : job.status}
              </span>
              {job.status === 'running'   && <Loader2     className="h-3.5 w-3.5 animate-spin text-[#60a5fa] shrink-0" />}
              {job.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-[#34d399] shrink-0" />}
              {job.status === 'failed'    && <XCircle      className="h-3.5 w-3.5 text-[#f87171] shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {/* Downloads */}
      {canDownload && src.session_id && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => api.downloadSessionReport(src.session_id, `source_${src.session_id.slice(0, 8)}.xlsx`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                       border border-[#3f3f46] bg-[#27272a] text-[#a1a1aa] hover:border-[rgba(52,211,153,0.3)] hover:text-[#34d399]
                       transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Source Excel
          </button>
          <button
            onClick={() => api.downloadSessionWordReport(src.session_id, `source_${src.session_id.slice(0, 8)}.docx`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                       border border-[#3f3f46] bg-[#27272a] text-[#a1a1aa] hover:border-[rgba(96,165,250,0.3)] hover:text-[#60a5fa]
                       transition-colors"
          >
            <FileText className="h-3.5 w-3.5" /> Source Word
          </button>
        </div>
      )}

      {/* View dashboard */}
      <div className="pt-1 border-t border-[#27272a]">
        {canNavigate && onViewDashboard ? (
          <button
            onClick={onViewDashboard}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl
                       bg-[rgba(245,158,11,0.06)] hover:bg-[rgba(245,158,11,0.1)]
                       border border-[rgba(245,158,11,0.2)] transition-colors group"
          >
            <span className="text-sm font-medium text-[#f59e0b]">View Full Dashboard</span>
            <ArrowRight className="h-4 w-4 text-[#f59e0b] group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#27272a] border border-[#3f3f46] opacity-40 cursor-default">
            <span className="text-sm text-[#71717a]">Not Assessed</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#3f3f46] text-[#71717a]">Unavailable</span>
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
      <div className="px-5 py-6 text-center text-sm text-[#52525b]">
        {session.mode === 'both' && !['completed', 'partial'].includes(session.source?.status ?? '')
          ? 'Fabric assessment will start after source assessment is submitted.'
          : 'Fabric assessment has not started yet.'}
      </div>
    )
  }

  const summary    = fab.results?.summary
  const workspaces = fab.results?.workspaces || []
  const canNavigate = fab.status === 'completed'

  return (
    <div className="px-5 py-4 space-y-4">
      {fab.status === 'running' && (
        <div className="flex items-center gap-2 text-sm text-[#60a5fa] bg-[rgba(96,165,250,0.08)] rounded-xl px-4 py-3 border border-[rgba(96,165,250,0.2)]">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          {fab.progress_message || 'Assessment in progress…'}
        </div>
      )}
      {fab.status === 'failed' && (
        <div className="flex items-start gap-2 text-sm text-[#f87171] bg-[rgba(248,113,113,0.08)] rounded-xl px-4 py-3 border border-[rgba(248,113,113,0.2)]">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {fab.error || 'Assessment failed.'}
        </div>
      )}

      {/* Summary metrics */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Workspaces', value: summary.workspace_count },
            { label: 'Datasets',   value: summary.dataset_count },
            { label: 'Reports',    value: summary.report_count },
            { label: 'Measures',   value: summary.total_measures },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-[#3f3f46] bg-[#27272a] px-4 py-3 text-center">
              <p className="text-xl font-bold font-mono text-[#f4f4f5]">{value}</p>
              <p className="text-[10px] text-[#71717a] mt-0.5 uppercase tracking-widest">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Workspace list */}
      {workspaces.length > 0 && (
        <div className="space-y-1.5">
          {workspaces.map(ws => (
            <div key={ws.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#3f3f46] bg-[#27272a]">
              <Building2 className="h-4 w-4 text-[#60a5fa] shrink-0" />
              <span className="flex-1 text-sm font-medium text-[#f4f4f5]">{ws.name}</span>
              <span className="text-xs text-[#52525b]">{ws.dataset_count} models · {ws.report_count} reports</span>
            </div>
          ))}
        </div>
      )}

      {/* Fabric download */}
      {fab.status === 'completed' && fab.fabric_session_id && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => api.downloadFabricExcel(fab.fabric_session_id, fab.label)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                       border border-[#3f3f46] bg-[#27272a] text-[#a1a1aa] hover:border-[rgba(52,211,153,0.3)] hover:text-[#34d399]
                       transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Fabric Excel
          </button>
        </div>
      )}

      {/* View dashboard */}
      <div className="pt-1 border-t border-[#27272a]">
        {canNavigate && onViewDashboard ? (
          <button
            onClick={onViewDashboard}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl
                       bg-[rgba(245,158,11,0.06)] hover:bg-[rgba(245,158,11,0.1)]
                       border border-[rgba(245,158,11,0.2)] transition-colors group"
          >
            <span className="text-sm font-medium text-[#f59e0b]">View Full Dashboard</span>
            <ArrowRight className="h-4 w-4 text-[#f59e0b] group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#27272a] border border-[#3f3f46] opacity-40 cursor-default">
            <span className="text-sm text-[#71717a]">Not Assessed</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#3f3f46] text-[#71717a]">Unavailable</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Unified Reports Panel ─────────────────────────────────────────────────────

function UnifiedReportsPanel({ session, sessionId }: { session: UnifiedSession; sessionId: string }) {
  const srcDone = session.source?.status === 'completed' || session.source?.status === 'partial'
  const fabDone = session.fabric?.status === 'completed'
  const hasAny  = srcDone || fabDone

  if (!hasAny) return null

  return (
    <div
      className="rounded-xl border border-[rgba(245,158,11,0.3)] bg-[#18181b] overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.04) 0%, rgba(18,18,27,1) 60%)',
        boxShadow: '0 0 32px rgba(245,158,11,0.08), 0 1px 3px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(245,158,11,0.15)]">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <Download className="h-4 w-4 text-[#f59e0b]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#f4f4f5]">Unified Assessment Reports</p>
          <p className="text-xs text-[#71717a] mt-0.5">Download combined Excel and Word reports for this session</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Combined Excel */}
          {srcDone && session.source?.session_id && (
            <div className="rounded-xl border border-[#3f3f46] bg-[#27272a] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-[#34d399]" />
                <span className="text-xs font-semibold text-[#f4f4f5] uppercase tracking-wider">Excel Report</span>
              </div>
              <p className="text-xs text-[#71717a]">Full source database findings — schema, complexity, PII signals, and more.</p>
              <button
                onClick={() => api.downloadSessionReport(session.source!.session_id, `unified_source_${sessionId.slice(0, 8)}.xlsx`)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold
                           bg-[rgba(52,211,153,0.1)] text-[#34d399] border border-[rgba(52,211,153,0.25)]
                           hover:bg-[rgba(52,211,153,0.18)] transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Download Source Excel
              </button>
            </div>
          )}

          {/* Source Word */}
          {srcDone && session.source?.session_id && (
            <div className="rounded-xl border border-[#3f3f46] bg-[#27272a] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#60a5fa]" />
                <span className="text-xs font-semibold text-[#f4f4f5] uppercase tracking-wider">Word Report</span>
              </div>
              <p className="text-xs text-[#71717a]">Narrative summary ready for client delivery — findings, risks, and recommendations.</p>
              <button
                onClick={() => api.downloadSessionWordReport(session.source!.session_id, `unified_source_${sessionId.slice(0, 8)}.docx`)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold
                           bg-[rgba(96,165,250,0.1)] text-[#60a5fa] border border-[rgba(96,165,250,0.25)]
                           hover:bg-[rgba(96,165,250,0.18)] transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Download Source Word
              </button>
            </div>
          )}

          {/* Fabric Excel */}
          {fabDone && session.fabric?.fabric_session_id && (
            <div className="rounded-xl border border-[#3f3f46] bg-[#27272a] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-[#34d399]" />
                <span className="text-xs font-semibold text-[#f4f4f5] uppercase tracking-wider">Fabric Excel</span>
              </div>
              <p className="text-xs text-[#71717a]">Workspace analysis — semantic models, reports, measures, and complexity scores.</p>
              <button
                onClick={() => api.downloadFabricExcel(session.fabric!.fabric_session_id, session.fabric!.label)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold
                           bg-[rgba(52,211,153,0.1)] text-[#34d399] border border-[rgba(52,211,153,0.25)]
                           hover:bg-[rgba(52,211,153,0.18)] transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Download Fabric Excel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Comparison table ──────────────────────────────────────────────────────────

function ComparisonTable({ session }: { session: UnifiedSession }) {
  const src = session.source
  const fab = session.fabric

  if (!src || !fab || fab.status !== 'completed') return null

  const fabSummary = fab.results?.summary
  const srcTotal   = src.completed_jobs

  const rows = [
    { metric: 'Databases / Workspaces assessed', source: `${srcTotal} database${srcTotal !== 1 ? 's' : ''}`, fabric: `${fabSummary?.workspace_count ?? '—'} workspace${(fabSummary?.workspace_count ?? 0) !== 1 ? 's' : ''}` },
    { metric: 'Objects / Datasets',              source: `${src.completed_jobs} jobs completed`,              fabric: `${fabSummary?.dataset_count ?? '—'} semantic models` },
    { metric: 'Reports / Visuals',               source: '—',                                                 fabric: `${fabSummary?.report_count ?? '—'} reports · ${fabSummary?.total_visuals ?? '—'} visuals` },
    { metric: 'Relationships',                   source: 'See Source report',                                 fabric: `${fabSummary?.total_relationships ?? '—'}` },
    { metric: 'Calculated objects',              source: '—',                                                 fabric: `${(fabSummary?.total_calculated_columns ?? 0) + (fabSummary?.total_calculated_tables ?? 0)} calc columns/tables` },
    { metric: 'Measures',                        source: '—',                                                 fabric: `${fabSummary?.total_measures ?? '—'}` },
  ]

  return (
    <div
      className="rounded-xl border border-[#3f3f46] bg-[#18181b] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)' }}
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#27272a]">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(96,165,250,0.15))', border: '1px solid rgba(255,255,255,0.06)' }}>
          <BarChart2 className="h-4 w-4 text-[#f4f4f5]" />
        </div>
        <span className="text-sm font-bold text-[#f4f4f5]">Side-by-Side Comparison</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#27272a]">
              <th className="text-left px-5 py-3 text-[10px] font-semibold text-[#71717a] uppercase tracking-widest w-1/3">Metric</th>
              <th className="text-left px-5 py-3 text-[10px] font-semibold text-[#f59e0b] uppercase tracking-widest w-1/3">
                <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Source DB</span>
              </th>
              <th className="text-left px-5 py-3 text-[10px] font-semibold text-[#60a5fa] uppercase tracking-widest w-1/3">
                <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Fabric</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272a]">
            {rows.map(row => (
              <tr key={row.metric} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                <td className="px-5 py-3 font-medium text-[#a1a1aa]">{row.metric}</td>
                <td className="px-5 py-3 font-mono text-[#f4f4f5]">{row.source}</td>
                <td className="px-5 py-3 font-mono text-[#f4f4f5]">{row.fabric}</td>
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
  const navigate      = useNavigate()

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
        <Loader2 className="h-8 w-8 animate-spin text-[#f59e0b]" />
        <p className="text-sm text-[#71717a]">Loading assessment report…</p>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <XCircle className="h-10 w-10 text-[#f87171]" />
        <p className="text-sm text-[#71717a]">{getApiErrorMessage(error)}</p>
        <button
          onClick={() => navigate('/unified/sessions')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                     border border-[#3f3f46] bg-[#27272a] text-[#a1a1aa] hover:border-[#52525b] hover:text-[#f4f4f5]
                     transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>
    )
  }

  const showSource     = session.mode === 'source' || session.mode === 'both'
  const showFabric     = session.mode === 'fabric' || session.mode === 'both'
  const showComparison = session.mode === 'both' &&
    session.source?.status && ['completed', 'partial'].includes(session.source.status) &&
    session.fabric?.status === 'completed'
  const isLive = !['completed', 'failed', 'cancelled'].includes(session.status)

  return (
    <div className="space-y-5">
      {/* ── Sticky summary bar ─────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 rounded-xl border border-[#3f3f46] bg-[rgba(9,9,11,0.92)] backdrop-blur-md px-5 py-4"
        style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.5)' }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate('/unified/sessions')}
            className="p-1.5 rounded-lg text-[#52525b] hover:text-[#f4f4f5] hover:bg-[#27272a] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Mode icon */}
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border border-[rgba(255,255,255,0.06)]"
            style={{
              background: session.mode === 'source'
                ? 'rgba(245,158,11,0.15)'
                : session.mode === 'fabric'
                ? 'rgba(96,165,250,0.15)'
                : 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(96,165,250,0.12))',
            }}
          >
            {session.mode === 'source' ? <Database className="h-4 w-4 text-[#f59e0b]" /> :
             session.mode === 'fabric' ? <Zap className="h-4 w-4 text-[#60a5fa]" /> :
             <Layers3 className="h-4 w-4 text-[#f59e0b]" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {session.label && (
                <span className="text-sm font-bold text-[#f4f4f5] truncate">{session.label}</span>
              )}
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md
                               bg-[rgba(245,158,11,0.08)] text-[#f59e0b] border border-[rgba(245,158,11,0.2)]">
                {MODE_LABELS[session.mode]}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="font-mono text-[10px] text-[#52525b]">
                {session.unified_session_id.slice(0, 8)}
              </span>
              {session.created_at && (
                <span className="text-[10px] text-[#52525b]">
                  Started {formatDateTime(session.created_at)}
                </span>
              )}
            </div>
          </div>

          <StatusBadge status={session.status} />

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg text-[#52525b] hover:text-[#f59e0b] hover:bg-[rgba(245,158,11,0.08)] transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {isLive && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[#60a5fa]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#60a5fa] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#60a5fa]" />
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
          iconGradient="linear-gradient(135deg, rgba(245,158,11,0.25), rgba(245,158,11,0.08))"
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
          iconGradient="linear-gradient(135deg, rgba(96,165,250,0.25), rgba(96,165,250,0.06))"
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

      {/* ── Unified Reports download panel ─────────────────────────────────── */}
      <UnifiedReportsPanel session={session} sessionId={sessionId!} />

      {/* ── Comparison table ────────────────────────────────────────────────── */}
      {showComparison && <ComparisonTable session={session} />}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!showSource && !showFabric && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Layers3 className="h-10 w-10 text-[#3f3f46]" />
          <p className="text-sm text-[#52525b]">Waiting for assessments to start…</p>
        </div>
      )}
    </div>
  )
}
