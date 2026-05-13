/**
 * UnifiedSessionsPage — list of all unified assessment sessions for the current user.
 */

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, Layers3, Database, Zap, CheckCircle2, XCircle,
  Clock, Loader2, AlertTriangle, ChevronRight,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { UnifiedSession } from '../types/api'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { formatDateTime, elapsed } from '../utils/dateTime'

const MODE_META: Record<string, { label: string; icon: React.ElementType; gradient: string }> = {
  source: { label: 'Source DB',         icon: Database, gradient: 'linear-gradient(135deg, #7D4A20, #A06535)' },
  fabric: { label: 'Fabric',            icon: Zap,      gradient: 'linear-gradient(135deg, #7D4A20, #0ea5e9)' },
  both:   { label: 'Full Assessment',   icon: Layers3,  gradient: 'linear-gradient(135deg, #7D4A20, #0ea5e9)' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:     { label: 'Pending',   color: 'text-slate-600', bg: 'bg-slate-100',   icon: Clock },
  running:     { label: 'Running',   color: 'text-blue-700',  bg: 'bg-blue-50',     icon: Loader2 },
  source_done: { label: 'Source done', color: 'text-amber-700', bg: 'bg-amber-50',  icon: Clock },
  completed:   { label: 'Completed', color: 'text-earth-700', bg: 'bg-earth-50', icon: CheckCircle2 },
  partial:     { label: 'Partial',   color: 'text-amber-700', bg: 'bg-amber-50',    icon: AlertTriangle },
  failed:      { label: 'Failed',    color: 'text-red-700',   bg: 'bg-red-50',      icon: XCircle },
  cancelled:   { label: 'Cancelled', color: 'text-slate-500', bg: 'bg-slate-100',   icon: XCircle },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color} ${cfg.bg}`}>
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  )
}

function SessionCard({ session, onClick }: { session: UnifiedSession; onClick: () => void }) {
  const meta = MODE_META[session.mode] || MODE_META.both
  const Icon = meta.icon
  const isLive = !['completed', 'failed', 'cancelled'].includes(session.status)

  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-200 bg-white
                 hover:border-earth-200 hover:bg-earth-50/20 hover:shadow-md transition-all duration-150 text-left"
      style={{ boxShadow: 'var(--elevation-1)' }}
    >
      {/* Mode icon */}
      <div
        className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: meta.gradient, boxShadow: '0 3px 10px rgba(125,74,32,0.2)' }}
      >
        <Icon className="h-5 w-5 text-white" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {session.label ? (
            <span className="text-sm font-semibold text-slate-900 truncate">{session.label}</span>
          ) : (
            <span className="text-sm font-semibold text-slate-400 italic">Unlabelled</span>
          )}
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
            style={{
              background: 'rgba(125,74,32,0.07)',
              color: '#7D4A20',
              border: '1px solid rgba(224,176,122,0.30)',
            }}
          >
            {meta.label}
          </span>
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] text-blue-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
              </span>
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
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
      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-earth-500 transition-colors shrink-0" />
    </button>
  )
}

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
        <Spinner size="lg" />
        <p className="text-sm text-slate-500">Loading sessions…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">All Assessment Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Unified sessions combining Source Database and Fabric assessments.
          </p>
        </div>
        <Button onClick={() => navigate('/unified/new')}>
          <Plus className="h-4 w-4 mr-1.5" /> New Assessment
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {getApiErrorMessage(error)}
        </div>
      )}

      {/* Session list */}
      {sessions.length === 0 ? (
        <div
          className="flex flex-col items-center gap-4 py-16 rounded-2xl border-2 border-dashed border-slate-200"
        >
          <Layers3 className="h-10 w-10 text-slate-300" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600">No unified assessments yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Start a new assessment to assess your databases and Fabric workspaces together.
            </p>
          </div>
          <Button onClick={() => navigate('/unified/new')}>
            <Plus className="h-4 w-4 mr-1.5" /> New Assessment
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <SessionCard
              key={session.unified_session_id}
              session={session}
              onClick={() => navigate(`/unified/sessions/${session.unified_session_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
