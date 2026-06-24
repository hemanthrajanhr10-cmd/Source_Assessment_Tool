import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, Layers3, Database, Zap, CheckCircle2, XCircle,
  Clock, Loader2, AlertTriangle, ChevronRight,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { UnifiedSession } from '../types/api'
import { formatDateTime, elapsed } from '../utils/dateTime'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string
  textCls: string
  bgCls: string
  borderCls: string
  icon: React.ElementType
}> = {
  pending:     { label: 'Pending',      textCls: 'text-slate-500',  bgCls: 'bg-[rgba(113,113,122,0.1)]',   borderCls: 'border-[rgba(113,113,122,0.2)]',  icon: Clock },
  running:     { label: 'Running',      textCls: 'text-[#60a5fa]',  bgCls: 'bg-[rgba(96,165,250,0.1)]',    borderCls: 'border-[rgba(96,165,250,0.2)]',   icon: Loader2 },
  source_done: { label: 'Source done',  textCls: 'text-[#6CBDB5]',  bgCls: 'bg-[rgba(251,191,36,0.08)]',   borderCls: 'border-[rgba(251,191,36,0.2)]',   icon: Clock },
  completed:   { label: 'Completed',    textCls: 'text-[#34d399]',  bgCls: 'bg-[rgba(52,211,153,0.1)]',    borderCls: 'border-[rgba(52,211,153,0.2)]',   icon: CheckCircle2 },
  partial:     { label: 'Partial',      textCls: 'text-[#6CBDB5]',  bgCls: 'bg-[rgba(251,191,36,0.08)]',   borderCls: 'border-[rgba(251,191,36,0.2)]',   icon: AlertTriangle },
  failed:      { label: 'Failed',       textCls: 'text-[#f87171]',  bgCls: 'bg-[rgba(248,113,113,0.1)]',   borderCls: 'border-[rgba(248,113,113,0.2)]',  icon: XCircle },
  cancelled:   { label: 'Cancelled',    textCls: 'text-[#52525b]',  bgCls: 'bg-[rgba(82,82,91,0.1)]',      borderCls: 'border-[rgba(82,82,91,0.2)]',     icon: XCircle },
}

const MODE_META: Record<string, { label: string; icon: React.ElementType; gradient: string }> = {
  source: { label: 'Source DB',       icon: Database, gradient: 'linear-gradient(135deg, rgba(77,168,160,0.25), rgba(77,168,160,0.08))' },
  fabric: { label: 'Fabric',          icon: Zap,      gradient: 'linear-gradient(135deg, rgba(96,165,250,0.2), rgba(96,165,250,0.06))' },
  both:   { label: 'Full Assessment', icon: Layers3,  gradient: 'linear-gradient(135deg, rgba(77,168,160,0.2), rgba(96,165,250,0.12))' },
}

const MODE_ICON_COLOR: Record<string, string> = {
  source: 'text-ocean-600',
  fabric: 'text-[#60a5fa]',
  both: 'text-ocean-600',
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border
      ${cfg.textCls} ${cfg.bgCls} ${cfg.borderCls}`}>
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  )
}

// ── Session card ──────────────────────────────────────────────────────────────

function SessionCard({ session, onClick }: { session: UnifiedSession; onClick: () => void }) {
  const meta      = MODE_META[session.mode] || MODE_META.both
  const iconColor = MODE_ICON_COLOR[session.mode] || 'text-ocean-600'
  const Icon      = meta.icon
  const isLive    = !['completed', 'failed', 'cancelled'].includes(session.status)

  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white
                 hover:border-[rgba(77,168,160,0.35)] hover:bg-[rgba(77,168,160,0.02)]
                 transition-all duration-150 text-left"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)' }}
    >
      {/* Mode icon */}
      <div
        className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border border-[rgba(255,255,255,0.06)]"
        style={{ background: meta.gradient }}
      >
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {session.label ? (
            <span className="text-sm font-semibold text-slate-900 truncate">{session.label}</span>
          ) : (
            <span className="text-sm font-semibold text-[#52525b] italic">Unlabelled</span>
          )}
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0
                           bg-[rgba(77,168,160,0.08)] text-ocean-600 border border-[rgba(77,168,160,0.2)]">
            {meta.label}
          </span>
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] text-[#60a5fa]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#60a5fa] opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#60a5fa]" />
              </span>
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-[#52525b]">
          <span className="font-mono">{session.unified_session_id.slice(0, 8)}</span>
          <span>·</span>
          <span>{formatDateTime(session.created_at)}</span>
          {session.completed_at && (
            <>
              <span>·</span>
              <span>{elapsed(session.created_at, session.completed_at)}</span>
            </>
          )}
        </div>
      </div>

      <StatusBadge status={session.status} />
      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-ocean-600 transition-colors shrink-0" />
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UnifiedSessionsPage() {
  const navigate = useNavigate()

  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ['unified-sessions'],
    queryFn: async () => {
      const { data } = await api.listUnifiedSessions()
      return data
    },
    refetchInterval: 10000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-600" />
        <p className="text-sm text-slate-500">Loading sessions…</p>
      </div>
    )
  }

  const active    = sessions.filter(s => !['completed', 'failed', 'cancelled'].includes(s.status))
  const completed = sessions.filter(s => s.status === 'completed')
  const rest      = sessions.filter(s => s.status !== 'completed' && ['completed', 'failed', 'cancelled'].includes(s.status))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: 'Syne, system-ui, sans-serif' }}>
            Assessment Reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Unified sessions combining Source Database and Fabric assessments.
          </p>
        </div>
        <button
          onClick={() => navigate('/unified/new')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                     bg-[#4DA8A0] text-white hover:bg-[#6CBDB5] transition-colors
                     focus:outline-none focus:ring-2 focus:ring-[rgba(77,168,160,0.4)]"
          style={{ boxShadow: '0 0 20px rgba(77,168,160,0.2)' }}
        >
          <Plus className="h-4 w-4" />
          New Assessment
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)] text-[#f87171] text-sm">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {getApiErrorMessage(error)}
        </div>
      )}

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 rounded-xl border border-dashed border-slate-200">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[rgba(77,168,160,0.08)] border border-[rgba(77,168,160,0.15)]">
            <Layers3 className="h-6 w-6 text-ocean-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-400">No assessments yet</p>
            <p className="text-xs text-[#52525b] mt-1 max-w-xs">
              Start a new assessment to analyze your databases and Fabric workspaces together.
            </p>
          </div>
          <button
            onClick={() => navigate('/unified/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                       bg-[#4DA8A0] text-white hover:bg-[#6CBDB5] transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Assessment
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-1">In Progress</p>
              <div className="space-y-2">
                {active.map(session => (
                  <SessionCard
                    key={session.unified_session_id}
                    session={session}
                    onClick={() => navigate(`/unified/sessions/${session.unified_session_id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-1">Completed</p>
              <div className="space-y-2">
                {completed.map(session => (
                  <SessionCard
                    key={session.unified_session_id}
                    session={session}
                    onClick={() => navigate(`/unified/sessions/${session.unified_session_id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-1">Other</p>
              <div className="space-y-2">
                {rest.map(session => (
                  <SessionCard
                    key={session.unified_session_id}
                    session={session}
                    onClick={() => navigate(`/unified/sessions/${session.unified_session_id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

