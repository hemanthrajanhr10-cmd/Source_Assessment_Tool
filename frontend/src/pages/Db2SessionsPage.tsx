import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PlusCircle, CheckCircle2, XCircle,
  Loader2, Clock, ChevronRight, AlertTriangle,
  Database, Server,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { IbmDb2Logo } from '../components/ui/SourceLogos'
import type { Db2SessionRecord } from '../types/api'

const T = {
  primary:    '#4DA8A0',
  dark:       '#25706A',
  mid:        '#6CBDB5',
  surface:    '#F0FAF9',
  light50:    '#F0FAF9',
  light100:   '#CCEFEC',
  ice:        '#A8E2DD',
  glow:       'rgba(77,168,160,0.10)',
  shadowCard: '0 2px 4px rgba(77,168,160,0.05), 0 8px 32px rgba(77,168,160,0.06)',
  shadowHover:'0 4px 12px rgba(77,168,160,0.10), 0 20px 48px rgba(77,168,160,0.10)',
  gradBtn:    'linear-gradient(135deg, #4DA8A0 0%, #6CBDB5 60%, #93CCC6 100%)',
  gradHero:   'linear-gradient(135deg, #F0FAF9 0%, #CCEFEC 100%)',
  gradSurface:'linear-gradient(180deg, #F0FAF9 0%, #CCEFEC 100%)',
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

export default function Db2SessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Db2SessionRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    api.db2ListSessions()
      .then((r) => setSessions(r.data))
      .catch((e: unknown) => setError(getApiErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen" style={{ background: T.gradSurface }}>
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: T.gradHero }}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute rounded-full" style={{
            width: '500px', height: '500px', top: '-180px', right: '-80px',
            background: `radial-gradient(circle, ${T.glow} 0%, transparent 70%)`,
          }} />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #4DA8A0, #6CBDB5)', boxShadow: '0 4px 16px rgba(77,168,160,0.30)' }}>
              <IbmDb2Logo size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: T.dark }}>IBM Db2 Assessments</h1>
              <p className="text-sm mt-0.5" style={{ color: T.primary }}>
                {loading ? 'Loading…' : `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/db2/new')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: T.gradBtn, boxShadow: '0 4px 16px rgba(77,168,160,0.35)' }}
          >
            <PlusCircle className="h-4 w-4" />
            New Assessment
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: T.primary }} />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-3 p-4 rounded-xl text-sm"
            style={{ background: 'rgba(254,242,242,0.9)', border: '1px solid #FECACA', color: '#DC2626' }}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl"
              style={{ background: T.light100 }}>
              <Database className="h-8 w-8" style={{ color: T.primary }} />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold" style={{ color: T.dark }}>No assessments yet</p>
              <p className="text-sm mt-1" style={{ color: T.primary }}>
                Run your first IBM Db2 assessment to see results here.
              </p>
            </div>
            <button
              onClick={() => navigate('/db2/new')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white mt-2"
              style={{ background: T.gradBtn, boxShadow: '0 4px 12px rgba(77,168,160,0.30)' }}
            >
              <PlusCircle className="h-4 w-4" />
              New Assessment
            </button>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="flex flex-col gap-3">
            {sessions.map((s) => {
              const cfg = statusConfig(s.status)
              const StatusIcon = cfg.icon
              const inv = s.results?.object_inventory

              return (
                <button
                  key={s.job_id}
                  onClick={() => navigate(`/db2/sessions/${s.job_id}`)}
                  className="w-full text-left rounded-2xl p-5 transition-all"
                  style={{
                    background: '#ffffff',
                    border: '1px solid rgba(108,189,181,0.25)',
                    boxShadow: T.shadowCard,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = T.shadowHover }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = T.shadowCard }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 mt-0.5"
                        style={{ background: T.light100 }}>
                        <IbmDb2Logo size={22} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate" style={{ color: '#0D1117' }}>
                            {s.label || 'IBM Db2 Assessment'}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                            <StatusIcon className={`h-3 w-3 ${s.status === 'running' ? 'animate-spin' : ''}`} />
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {s.hostname && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                              <Server className="h-3 w-3" />
                              {s.hostname}
                            </span>
                          )}
                          {s.database && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                              <Database className="h-3 w-3" />
                              {s.database}
                            </span>
                          )}
                        </div>
                        {inv && (
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {[
                              { label: 'schemas',    val: inv.schema_count },
                              { label: 'tables',     val: inv.table_count },
                              { label: 'indexes',    val: inv.index_count },
                              { label: 'procedures', val: inv.procedure_count },
                            ].map(({ label: lbl, val }) => (
                              <span key={lbl} className="text-xs font-medium px-2 py-0.5 rounded-md"
                                style={{ background: T.light50, color: T.dark, border: `1px solid ${T.light100}` }}>
                                {val} {lbl}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-xs" style={{ color: '#94A3B8' }}>{fmt(s.created_at)}</p>
                        {s.completed_at && (
                          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                            Completed {fmt(s.completed_at)}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4" style={{ color: T.mid }} />
                    </div>
                  </div>
                  {s.error && (
                    <div className="mt-3 p-2.5 rounded-lg text-xs"
                      style={{ background: 'rgba(254,242,242,0.8)', color: '#EF4444', border: '1px solid #FECACA' }}>
                      {s.error}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
