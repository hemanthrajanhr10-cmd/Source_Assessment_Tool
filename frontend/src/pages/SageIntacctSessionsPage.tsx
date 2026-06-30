import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2, Plus, RefreshCw, CheckCircle2, XCircle,
  Clock, Loader2, ChevronRight, Calendar,
  AlertTriangle,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { SageIntacctSessionRecord } from '../types/api'
import Loader3D from '../components/ui/Loader3D'
import { SageIntacctLogo } from '../components/ui/SourceLogos'
import { useSessionFilter } from '../hooks/useSessionFilter'
import SessionFilterBar from '../components/ui/SessionFilterBar'

// ── Design tokens (Ocean theme) ───────────────────────────────────────────────

const SAGE = {
  primary: '#4DA8A0',
  mid:     '#6CBDB5',
  accent:  '#93CCC6',
  light50: '#F0FAF9',
  light100:'#CCEFEC',
  light200:'#A8E2DD',
  glow:    'rgba(77,168,160,0.15)',
  shadow:  '0 2px 4px rgba(77,168,160,0.04), 0 8px 24px rgba(77,168,160,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowH: '0 4px 8px rgba(77,168,160,0.06), 0 16px 40px rgba(77,168,160,0.10), 0 2px 4px rgba(0,0,0,0.04)',
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; icon: React.ElementType; dot?: string }> = {
    completed: { bg: '#F0FAF9', text: '#25706A', icon: CheckCircle2, dot: '#4DA8A0' },
    running:   { bg: '#EFF6FF', text: '#1E40AF', icon: Loader2,      dot: '#3B82F6' },
    pending:   { bg: '#FFFBEB', text: '#92400E', icon: Clock,         dot: '#F59E0B' },
    failed:    { bg: '#FFF5F5', text: '#991B1B', icon: XCircle,       dot: '#EF4444' },
  }
  const c = cfg[status] ?? { bg: '#F1F5F9', text: '#475569', icon: Clock }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.bg}` }}
    >
      {c.dot && (
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{
            background: c.dot,
            boxShadow: status === 'running' ? `0 0 5px ${c.dot}` : 'none',
            animation: status === 'running' ? 'pulse 2s infinite' : 'none',
          }}
        />
      )}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ── Session row card ──────────────────────────────────────────────────────────

function SessionCard({ session, index }: { session: SageIntacctSessionRecord; index: number }) {
  const navigate = useNavigate()
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(12px)'
    const t = setTimeout(() => {
      el.style.transition = 'opacity 300ms cubic-bezier(0,0,0.2,1), transform 300ms cubic-bezier(0,0,0.2,1)'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    }, index * 60)
    return () => clearTimeout(t)
  }, [index])

  const companyName = session.results?.company_profile?.company_name
  const totalAccounts = session.results?.chart_of_accounts?.total_accounts
  const totalUsers = session.results?.user_profile?.total_users
  const modulesCount = session.results?.company_profile?.modules_enabled?.length

  const createdAt = new Date(session.created_at)
  const dateStr = createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      ref={cardRef}
      onClick={() => navigate(`/sage-intacct/sessions/${session.job_id}`)}
      className="group cursor-pointer rounded-2xl border border-slate-200/80 bg-white overflow-hidden"
      style={{
        boxShadow: SAGE.shadow,
        transition: 'box-shadow 240ms ease, transform 240ms cubic-bezier(0.34,1.56,0.64,1), border-color 240ms ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = SAGE.shadowH
        el.style.transform = 'translateY(-2px)'
        el.style.borderColor = SAGE.light200
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = SAGE.shadow
        el.style.transform = 'translateY(0)'
        el.style.borderColor = ''
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/sage-intacct/sessions/${session.job_id}`) }}
      aria-label={`View ${companyName || session.label || session.job_id.slice(0, 8)} assessment`}
    >
      {/* Top accent stripe */}
      <div
        className="h-1 w-full"
        style={{
          background: session.status === 'completed'
            ? `linear-gradient(90deg, ${SAGE.primary}, ${SAGE.accent})`
            : session.status === 'running'
            ? 'linear-gradient(90deg, #2563EB, #60A5FA)'
            : session.status === 'failed'
            ? 'linear-gradient(90deg, #DC2626, #F87171)'
            : 'linear-gradient(90deg, #94A3B8, #CBD5E1)',
        }}
      />

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{
                background: SAGE.light50,
                border: `1px solid ${SAGE.light200}`,
                boxShadow: `0 4px 12px ${SAGE.glow}`,
              }}
            >
              <SageIntacctLogo size={28} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">
                {companyName || session.label || `Job ${session.job_id.slice(0, 8)}`}
              </p>
              {session.label && companyName && (
                <p className="text-xs text-slate-400 truncate">{session.label}</p>
              )}
              <p className="text-[10px] font-mono text-slate-300 mt-0.5">{session.job_id.slice(0, 16)}…</p>
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <StatusBadge status={session.status} />
          </div>
        </div>

        {/* Metrics row */}
        {session.status === 'completed' && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: 'GL Accounts', value: totalAccounts?.toLocaleString() ?? '–' },
              { label: 'Users', value: totalUsers?.toLocaleString() ?? '–' },
              { label: 'Modules', value: modulesCount?.toString() ?? '–' },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl px-3 py-2 text-center"
                style={{ background: SAGE.light50, border: `1px solid ${SAGE.light200}` }}
              >
                <p className="text-base font-bold" style={{ color: SAGE.primary }}>{value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {session.status === 'failed' && session.error && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 truncate">{session.error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            <span>{dateStr} at {timeStr}</span>
          </div>
          <ChevronRight
            className="h-4 w-4 text-slate-300 transition-all duration-150 group-hover:translate-x-0.5"
            style={{ color: SAGE.mid }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4"
        style={{
          background: `linear-gradient(135deg, ${SAGE.light50} 0%, ${SAGE.light100} 100%)`,
          border: `2px dashed ${SAGE.light200}`,
        }}
      >
        <Building2 className="h-7 w-7" style={{ color: SAGE.primary, opacity: 0.5 }} />
      </div>
      <p className="text-base font-semibold text-slate-700 mb-1">No assessments yet</p>
      <p className="text-sm text-slate-400 mb-6 max-w-xs">
        Start your first Sage Intacct assessment to extract financial data and generate reports.
      </p>
      <Link
        to="/sage-intacct/new"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-150"
        style={{
          background: `linear-gradient(135deg, ${SAGE.primary} 0%, ${SAGE.mid} 100%)`,
          boxShadow: `0 2px 8px ${SAGE.glow}`,
        }}
      >
        <Plus className="h-4 w-4" /> Start Assessment
      </Link>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SageIntacctSessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SageIntacctSessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  const { filter, filtered: filteredRaw, setField, reset, isActive } = useSessionFilter(sessions)
  const filtered = filteredRaw as SageIntacctSessionRecord[]

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(-8px)'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 300ms ease, transform 300ms ease'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
  }, [])

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    else setRefreshing(true)
    try {
      const { data } = await api.sageListSessions()
      setSessions(data)
      setError('')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  // Auto-refresh while any session is running or pending
  useEffect(() => {
    const hasActive = sessions.some((s) => s.status === 'running' || s.status === 'pending')
    if (!hasActive) return
    const interval = setInterval(() => load(false), 3000)
    return () => clearInterval(interval)
  }, [sessions])

  const completed = sessions.filter((s) => s.status === 'completed').length
  const running = sessions.filter((s) => s.status === 'running' || s.status === 'pending').length
  const failed = sessions.filter((s) => s.status === 'failed').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div ref={headerRef} className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center overflow-hidden"
          style={{
            background: SAGE.light50,
            border: `1px solid ${SAGE.light200}`,
            boxShadow: `0 4px 14px ${SAGE.glow}`,
          }}
        >
          <SageIntacctLogo size={28} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sage Intacct Assessments</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {sessions.length} total · {completed} completed · {running} running · {failed} failed
          </p>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <SessionFilterBar
        filter={filter}
        onField={setField}
        onReset={reset}
        isActive={isActive}
        totalCount={sessions.length}
        filteredCount={filtered.length}
        actions={
          <>
            <button
              onClick={() => load(false)}
              disabled={refreshing}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                background: '#FFFFFF', border: `1.5px solid ${SAGE.light200}`, color: '#404555',
                cursor: 'pointer', transition: 'all 0.15s', opacity: refreshing ? 0.4 : 1,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = SAGE.primary
                ;(e.currentTarget as HTMLButtonElement).style.color = SAGE.primary
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = SAGE.light200
                ;(e.currentTarget as HTMLButtonElement).style.color = '#404555'
              }}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => navigate('/sage-intacct/new')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: `linear-gradient(135deg, ${SAGE.primary}, ${SAGE.mid})`,
                color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: `0 4px 16px ${SAGE.glow}`,
                transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${SAGE.glow}`
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 16px ${SAGE.glow}`
              }}
            >
              <Plus className="h-4 w-4" />
              New Assessment
            </button>
          </>
        }
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && <Loader3D message="Loading assessments…" />}

      {/* Sessions grid */}
      {!loading && sessions.length === 0 && <EmptyState />}
      {!loading && sessions.length > 0 && filtered.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0D1117', margin: '0 0 8px' }}>No sessions match your filters</h3>
          <p style={{ fontSize: 12, color: '#767A8C', margin: '0 0 16px' }}>Try adjusting your search or filter criteria.</p>
          <button onClick={reset} style={{
            padding: '8px 18px', borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: `linear-gradient(135deg, ${SAGE.primary}, ${SAGE.mid})`,
            color: '#fff', border: 'none', cursor: 'pointer',
          }}>Clear filters</button>
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((session, i) => (
            <SessionCard key={session.job_id} session={session} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
