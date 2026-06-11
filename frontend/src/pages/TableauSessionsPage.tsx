import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart3, Plus, RefreshCw, CheckCircle2, XCircle,
  Clock, Loader2, ChevronRight, Calendar, Database,
  AlertTriangle, Globe, Target, Users,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { TableauSessionRecord } from '../types/api'
import Loader3D from '../components/ui/Loader3D'

// ── Design tokens (Ocean / Deep Atlantic) ────────────────────────────────────

const T = {
  primary: '#0056B3',
  dark:    '#003D82',
  accent:  '#0084D4',
  light50: '#EFF6FF',
  light100:'#DBEEFF',
  light200:'#BAE0FF',
  glow:    'rgba(0,86,179,0.15)',
  shadow:  '0 2px 4px rgba(0,86,179,0.04), 0 8px 24px rgba(0,86,179,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowH: '0 4px 8px rgba(0,86,179,0.06), 0 16px 40px rgba(0,86,179,0.10), 0 2px 4px rgba(0,0,0,0.04)',
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; icon: React.ElementType; dot?: string }> = {
    completed: { bg: T.light100,  text: T.dark,    icon: CheckCircle2, dot: T.primary },
    running:   { bg: '#EFF6FF',   text: '#1E40AF', icon: Loader2,      dot: '#3B82F6' },
    pending:   { bg: '#FFFBEB',   text: '#92400E', icon: Clock,         dot: '#F59E0B' },
    failed:    { bg: '#FFF5F5',   text: '#991B1B', icon: XCircle,       dot: '#EF4444' },
  }
  const c = cfg[status] ?? { bg: '#F1F5F9', text: '#475569', icon: Clock }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.bg}` }}
    >
      {c.dot && (
        <span className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ background: c.dot, boxShadow: status === 'running' ? `0 0 5px ${c.dot}` : 'none', animation: status === 'running' ? 'pulse 2s infinite' : 'none' }} />
      )}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ── Session card ──────────────────────────────────────────────────────────────

function SessionCard({ session, index }: { session: TableauSessionRecord; index: number }) {
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

  const siteName = session.results?.server_info?.site_name
  const totalWorkbooks = session.results?.workbook_summary?.total_workbooks
  const totalUsers = session.results?.user_profile?.total_users
  const totalDatasources = session.results?.datasource_summary?.total_datasources
  const serverUrl = session.server_url || session.results?.server_info?.server_url

  return (
    <div
      ref={cardRef}
      className="rounded-2xl border border-slate-200/80 bg-white cursor-pointer overflow-hidden"
      style={{ boxShadow: T.shadow, transition: 'box-shadow 200ms ease, transform 200ms cubic-bezier(0.34,1.56,0.64,1)' }}
      onClick={() => navigate(`/tableau/sessions/${session.job_id}`)}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = T.shadowH
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = T.shadow
        el.style.transform = 'translateY(0)'
      }}
    >
      {/* Card top stripe */}
      <div
        className="h-1 w-full"
        style={{
          background: session.status === 'completed'
            ? `linear-gradient(90deg, ${T.dark}, ${T.primary}, ${T.accent})`
            : session.status === 'failed'
            ? 'linear-gradient(90deg, #EF4444, #F87171)'
            : 'linear-gradient(90deg, #94A3B8, #CBD5E1)',
        }}
      />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{ background: '#F8FAFF', border: '1px solid #C5D5EC', boxShadow: `0 2px 8px ${T.glow}` }}
            >
              <img src="/logos/tableau.svg" alt="Tableau" className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {session.label || siteName || `Assessment ${session.job_id.slice(0, 8)}`}
              </p>
              {serverUrl && (
                <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                  <Globe className="h-3 w-3 shrink-0" />
                  {serverUrl}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={session.status} />
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </div>
        </div>

        {/* Metrics row */}
        {session.status === 'completed' && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex items-center gap-4 flex-wrap">
              {totalWorkbooks !== undefined && (
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 shrink-0" style={{ color: T.primary }} />
                  <span className="text-xs font-semibold text-slate-700">{totalWorkbooks.toLocaleString()}</span>
                  <span className="text-xs text-slate-400">workbooks</span>
                </div>
              )}
              {totalDatasources !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 shrink-0" style={{ color: T.primary }} />
                  <span className="text-xs font-semibold text-slate-700">{totalDatasources.toLocaleString()}</span>
                  <span className="text-xs text-slate-400">sources</span>
                </div>
              )}
              {totalUsers !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0" style={{ color: T.primary }} />
                  <span className="text-xs text-slate-400">{totalUsers.toLocaleString()} users</span>
                </div>
              )}
            </div>
            {session.results?.migration_feasibility && (() => {
              const mf = session.results.migration_feasibility
              const feasColor = { High: '#15803D', Moderate: '#B45309', Low: '#9F1239' }[mf.overall_feasibility]
              const feasBg    = { High: '#F0FDF4', Moderate: '#FFFBEB', Low: '#FFF1F2' }[mf.overall_feasibility]
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold"
                    style={{ background: feasBg, color: feasColor }}>
                    <Target className="h-3 w-3" />
                    Migration: {mf.overall_feasibility} · {mf.estimated_migration_weeks}w
                  </span>
                  <span className="text-xs text-slate-400">
                    {mf.simple_workbooks}S / {mf.moderate_workbooks}M / {mf.complex_workbooks}C / {mf.very_complex_workbooks}VC
                  </span>
                </div>
              )
            })()}
          </div>
        )}

        {/* Date + error */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="h-3 w-3" />
            {new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          {session.error && (
            <div className="flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3 w-3" />
              <span className="truncate max-w-[200px]">{session.error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TableauSessionsPage() {
  const [sessions, setSessions] = useState<TableauSessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(12px)'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 350ms ease, transform 350ms ease'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
  }, [])

  const fetchSessions = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setLoadError('')
    try {
      const { data } = await api.tableauListSessions()
      setSessions(data)
    } catch (err) {
      setLoadError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchSessions() }, [])

  const statusCounts = {
    completed: sessions.filter((s) => s.status === 'completed').length,
    running:   sessions.filter((s) => s.status === 'running' || s.status === 'pending').length,
    failed:    sessions.filter((s) => s.status === 'failed').length,
  }

  return (
    <div ref={containerRef} className="space-y-6">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: '#F8FAFF', border: '1px solid #C5D5EC', boxShadow: `0 2px 8px rgba(0,86,179,0.10)` }}
          >
            <img src="/logos/tableau.svg" alt="Tableau" className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Tableau Assessments</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {sessions.length > 0
                ? `${sessions.length} assessment${sessions.length !== 1 ? 's' : ''} · Power BI migration analysis included`
                : 'Source assessment + Power BI migration analysis'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchSessions(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-600
                       transition-all duration-150 disabled:opacity-50"
            style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.light200; (e.currentTarget as HTMLButtonElement).style.color = T.primary }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = ''; (e.currentTarget as HTMLButtonElement).style.color = '' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <Link
            to="/tableau/new"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-150"
            style={{
              background: `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`,
              boxShadow: '0 2px 8px rgba(0,86,179,0.35), inset 0 1px 0 rgba(255,255,255,0.16)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)' }}
          >
            <Plus className="h-4 w-4" />
            New Assessment
          </Link>
        </div>
      </div>

      {/* ── Status summary ────────────────────────────────────── */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Completed', count: statusCounts.completed, color: T.primary, bg: T.light100 },
            { label: 'Running / Pending', count: statusCounts.running, color: '#1E40AF', bg: '#EFF6FF' },
            { label: 'Failed', count: statusCounts.failed, color: '#991B1B', bg: '#FFF5F5' },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className="rounded-xl px-4 py-3 text-center"
              style={{ background: bg, border: `1px solid ${bg}` }}>
              <p className="text-xl font-bold tabular-nums" style={{ color }}>{count}</p>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────── */}
      {loadError && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────── */}
      {loading && <Loader3D message="Loading assessments…" />}

      {/* ── Empty ─────────────────────────────────────────────── */}
      {!loading && sessions.length === 0 && !loadError && (
        <div
          className="rounded-2xl border border-slate-200/80 p-12 flex flex-col items-center text-center"
          style={{ boxShadow: T.shadow, background: `linear-gradient(135deg, ${T.light50} 0%, white 100%)` }}
        >
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4 overflow-hidden"
            style={{ background: '#F8FAFF', border: '1px solid #C5D5EC', boxShadow: `0 6px 20px ${T.glow}` }}
          >
            <img src="/logos/tableau.svg" alt="Tableau" className="h-12 w-12" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">No Tableau assessments yet</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-sm">
            Connect to a Tableau Server or Tableau Cloud instance to run your first assessment.
          </p>
          <Link
            to="/tableau/new"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`, boxShadow: '0 2px 8px rgba(0,86,179,0.35)' }}
          >
            <Plus className="h-4 w-4" />
            Start First Assessment
          </Link>
        </div>
      )}

      {/* ── Session list ──────────────────────────────────────── */}
      {!loading && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((session, i) => (
            <SessionCard key={session.job_id} session={session} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
