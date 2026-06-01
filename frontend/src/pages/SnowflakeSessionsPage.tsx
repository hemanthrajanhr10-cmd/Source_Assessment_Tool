import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Snowflake, PlusCircle, CheckCircle2, XCircle,
  Loader2, Clock, ChevronRight, Database,
  AlertTriangle,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { SnowflakeSessionRecord } from '../types/api'

// ── Ocean design tokens ───────────────────────────────────────────────────────

const T = {
  primary:    '#00B8E6',
  dark:       '#0A1628',
  mid:        '#0099CC',
  accent:     '#00D4FF',
  surface:    '#EBF4FF',
  light50:    '#F0F8FF',
  light100:   '#E0F2FF',
  ice:        '#B8D4E8',
  glow:       'rgba(0,184,230,0.15)',
  shadowCard: '0 2px 4px rgba(0,184,230,0.05), 0 8px 32px rgba(0,184,230,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowHover:'0 4px 12px rgba(0,184,230,0.10), 0 20px 48px rgba(0,184,230,0.12)',
  gradBtn:    'linear-gradient(135deg, #0099CC 0%, #00B8E6 60%, #00D4FF 100%)',
  gradHero:   'linear-gradient(135deg, #0A1628 0%, #0D2040 50%, #102848 100%)',
  gradSurface:'linear-gradient(180deg, #F0F8FF 0%, #E8F4FF 100%)',
}

function statusConfig(status: string) {
  switch (status) {
    case 'completed':
      return { icon: CheckCircle2, color: '#10B981', bg: 'rgba(236,253,245,0.9)', border: '#A7F3D0', label: 'Completed' }
    case 'failed':
      return { icon: XCircle, color: '#EF4444', bg: 'rgba(254,242,242,0.9)', border: '#FECACA', label: 'Failed' }
    case 'running':
      return { icon: Loader2, color: T.primary, bg: T.light50, border: T.ice, label: 'Running' }
    default:
      return { icon: Clock, color: '#94A3B8', bg: 'rgba(241,245,249,0.9)', border: '#E2E8F0', label: 'Pending' }
  }
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

export default function SnowflakeSessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SnowflakeSessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.snowflakeListSessions()
      .then((r) => setSessions(r.data))
      .catch((e: unknown) => setError(getApiErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen" style={{ background: T.gradSurface }}>
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: T.gradHero }}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute rounded-full"
            style={{
              width: '500px', height: '500px', top: '-180px', right: '-80px',
              background: 'radial-gradient(circle, rgba(0,184,230,0.07) 0%, transparent 70%)',
            }}
          />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(0,184,230,0.15)',
                border: '1px solid rgba(0,212,255,0.20)',
              }}
            >
              <Snowflake className="h-6 w-6" style={{ color: T.accent }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Snowflake Assessments</h1>
              <p className="text-sm" style={{ color: 'rgba(176,212,232,0.8)' }}>
                {loading ? 'Loading…' : `${sessions.length} assessment${sessions.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/snowflake/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #0099CC 0%, #00B8E6 100%)',
              boxShadow: '0 2px 12px rgba(0,184,230,0.40)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,184,230,0.55)' }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,184,230,0.40)' }}
          >
            <PlusCircle className="h-4 w-4" />
            New Assessment
          </button>
        </div>
      </div>

      {/* Wave */}
      <div className="h-5 overflow-hidden" style={{ background: T.gradHero }}>
        <svg viewBox="0 0 1440 20" fill="none" preserveAspectRatio="none" style={{ width: '100%', height: '20px' }}>
          <path d="M0 0 Q360 20 720 10 Q1080 0 1440 18 L1440 20 L0 20Z" fill="#EBF4FF" />
        </svg>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: T.primary }} />
            <span className="text-sm" style={{ color: '#64748B' }}>Loading assessments…</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl text-sm" style={{ background: 'rgba(254,242,242,0.9)', border: '1px solid #FECACA', color: '#DC2626' }}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div
            className="rounded-2xl p-16 text-center"
            style={{ background: 'rgba(255,255,255,0.9)', border: `1px solid ${T.ice}`, boxShadow: T.shadowCard }}
          >
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: T.light100, border: `1px solid ${T.ice}` }}
            >
              <Snowflake className="h-8 w-8" style={{ color: T.primary }} />
            </div>
            <h3 className="text-base font-bold mb-2" style={{ color: T.dark }}>No assessments yet</h3>
            <p className="text-sm mb-6" style={{ color: '#64748B' }}>
              Run your first Snowflake assessment to see results here.
            </p>
            <button
              onClick={() => navigate('/snowflake/new')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: T.gradBtn, boxShadow: '0 2px 12px rgba(0,184,230,0.40)' }}
            >
              <PlusCircle className="h-4 w-4" />
              Start First Assessment
            </button>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="space-y-3">
            {sessions.map((session) => {
              const sc = statusConfig(session.status)
              const StatusIcon = sc.icon
              const res = session.results
              return (
                <button
                  key={session.job_id}
                  onClick={() => navigate(`/snowflake/sessions/${session.job_id}`)}
                  className="w-full text-left rounded-2xl p-5 transition-all duration-200 group"
                  style={{
                    background: 'rgba(255,255,255,0.96)',
                    border: `1px solid ${T.ice}`,
                    boxShadow: T.shadowCard,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = T.shadowHover
                    e.currentTarget.style.borderColor = T.primary
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = T.shadowCard
                    e.currentTarget.style.borderColor = T.ice
                    e.currentTarget.style.transform = ''
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: T.light100, border: `1px solid ${T.ice}` }}
                      >
                        <Database className="h-5 w-5" style={{ color: T.primary }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: T.dark }}>
                          {session.label || session.account || 'Snowflake Assessment'}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {session.account && (
                            <span className="text-[11px]" style={{ color: '#64748B' }}>
                              {session.account}
                            </span>
                          )}
                          <span className="text-[11px]" style={{ color: '#94A3B8' }}>
                            {fmt(session.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Quick stats */}
                      {res?.database_summary && session.status === 'completed' && (
                        <div className="hidden md:flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs font-bold" style={{ color: T.dark }}>
                              {res.database_summary.total_databases}
                            </p>
                            <p className="text-[9px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>databases</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold" style={{ color: T.dark }}>
                              {res.database_summary.total_tables}
                            </p>
                            <p className="text-[9px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>tables</p>
                          </div>
                          {res.user_profile && (
                            <div className="text-right">
                              <p className="text-xs font-bold" style={{ color: T.dark }}>
                                {res.user_profile.total_users}
                              </p>
                              <p className="text-[9px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>users</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status badge */}
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                        style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
                      >
                        <StatusIcon
                          className={`h-3 w-3 ${session.status === 'running' ? 'animate-spin' : ''}`}
                        />
                        {sc.label}
                      </div>
                      <ChevronRight
                        className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                        style={{ color: T.ice }}
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
