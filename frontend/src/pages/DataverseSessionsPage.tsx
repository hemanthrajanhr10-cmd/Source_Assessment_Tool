import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, PlusCircle, RefreshCw, Loader2, AlertTriangle,
  CheckCircle, XCircle, Clock, ChevronRight, BarChart3,
  TrendingUp, Shield, AlertCircle,
} from 'lucide-react'
import axios from 'axios'
import { DataverseLogo } from '../components/ui/SourceLogos'
import type { DataverseSessionRecord } from '../types/api'

const T = {
  primary:    '#4DA8A0',
  mid:        '#6CBDB5',
  accent:     '#93CCC6',
  dark:       '#25706A',
  surface:    '#F0FAF9',
  light50:    '#F0FAF9',
  light100:   '#CCEFEC',
  light200:   '#A8E2DD',
  text:       '#25706A',
  textMid:    '#4DA8A0',
  glow:       'rgba(77,168,160,0.15)',
  gradHero:   'linear-gradient(135deg, #F0FAF9 0%, #CCEFEC 100%)',
  gradBtn:    'linear-gradient(135deg, #4DA8A0 0%, #6CBDB5 100%)',
  shadowCard: '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.07)',
}

function statusBadge(status: string) {
  const map: Record<string, { icon: React.ElementType; bg: string; color: string; label: string }> = {
    completed: { icon: CheckCircle, bg: 'rgba(5,150,105,0.10)', color: '#065f46', label: 'Completed' },
    failed:    { icon: XCircle,     bg: 'rgba(220,38,38,0.10)',  color: '#991b1b', label: 'Failed' },
    running:   { icon: Loader2,     bg: 'rgba(77,168,160,0.10)', color: T.primary, label: 'Running' },
    pending:   { icon: Clock,       bg: 'rgba(100,116,139,0.10)', color: '#475569', label: 'Pending' },
  }
  const s = map[status] ?? map.pending
  const Icon = s.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '99px',
      background: s.bg, color: s.color, fontSize: '11.5px', fontWeight: 700,
    }}>
      <Icon style={{ width: '11px', height: '11px', animation: status === 'running' ? 'spin 1s linear infinite' : 'none' }} />
      {s.label}
    </span>
  )
}

function scoreRing(score: number) {
  const color = score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
        background: `conic-gradient(${color} ${score * 3.6}deg, ${T.light100} 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 0 3px #fff, 0 0 0 4px ${T.light100}`,
      }}>
        <div style={{
          width: '26px', height: '26px', borderRadius: '50%', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '9px', fontWeight: 800, color,
        }}>{score}</div>
      </div>
    </div>
  )
}

export default function DataverseSessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<DataverseSessionRecord[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [refresh,  setRefresh]  = useState(0)

  const token = () => localStorage.getItem('sat_token') || ''

  useEffect(() => {
    setLoading(true)
    axios.get('/api/v1/dataverse/sessions', { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => { setSessions(r.data); setError('') })
      .catch(() => setError('Failed to load sessions.'))
      .finally(() => setLoading(false))
  }, [refresh])

  const completed = sessions.filter(s => s.status === 'completed')
  const avgScore = completed.length
    ? Math.round(completed.reduce((a, s) => a + s.overall_score, 0) / completed.length)
    : 0
  const totalCritical = completed.reduce((a, s) => a + s.critical_findings, 0)
  const totalHigh = completed.reduce((a, s) => a + s.high_findings, 0)

  return (
    <div style={{ minHeight: '100vh', background: T.surface }}>
      {/* Hero */}
      <div style={{ background: T.gradHero, padding: '28px 32px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: T.glow, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: T.light50, border: `1px solid ${T.light200}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <DataverseLogo size={26} />
            </div>
            <div>
              <h1 style={{ color: T.dark, fontSize: '20px', fontWeight: 700, margin: 0 }}>Dataverse Assessments</h1>
              <p style={{ color: T.textMid, fontSize: '12.5px', margin: 0, marginTop: '2px' }}>
                {sessions.length} session{sessions.length !== 1 ? 's' : ''} · History and results
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setRefresh(r => r + 1)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600,
                background: 'white', border: `1px solid ${T.light200}`,
                color: T.primary, cursor: 'pointer',
              }}
            >
              <RefreshCw style={{ width: '13px', height: '13px' }} /> Refresh
            </button>
            <button
              onClick={() => navigate('/dataverse/new')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 700,
                background: T.gradBtn, border: 'none',
                color: '#fff', cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(77,168,160,0.30)',
              }}
            >
              <PlusCircle style={{ width: '13px', height: '13px' }} /> New Assessment
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {completed.length > 0 && (
        <div style={{ background: '#fff', borderBottom: `1px solid ${T.light100}`, padding: '16px 32px' }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {[
              { icon: BarChart3,    label: 'Total Sessions',     value: String(sessions.length),    color: T.primary },
              { icon: TrendingUp,   label: 'Avg Health Score',   value: `${avgScore}%`,              color: avgScore >= 80 ? '#059669' : '#d97706' },
              { icon: AlertCircle,  label: 'Critical Findings',  value: String(totalCritical),       color: totalCritical > 0 ? '#dc2626' : '#059669' },
              { icon: Shield,       label: 'High Findings',      value: String(totalHigh),           color: totalHigh > 5 ? '#d97706' : '#059669' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '9px',
                  background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon style={{ width: '15px', height: '15px', color }} />
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</p>
                  <p style={{ fontSize: '17px', fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 24px 48px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', gap: '12px', alignItems: 'center' }}>
            <Loader2 style={{ width: '20px', height: '20px', color: T.primary, animation: 'spin 1s linear infinite' }} />
            <span style={{ color: T.textMid, fontSize: '14px' }}>Loading sessions…</span>
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.20)', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <AlertTriangle style={{ width: '16px', height: '16px', color: '#dc2626' }} />
            <p style={{ fontSize: '13px', color: '#991b1b', margin: 0 }}>{error}</p>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '64px 24px',
            background: '#fff', borderRadius: '20px', border: `1px solid ${T.light100}`,
            boxShadow: T.shadowCard,
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '18px', margin: '0 auto 16px',
              background: T.light50, border: `1px solid ${T.light200}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 20px ${T.glow}`, overflow: 'hidden',
            }}>
              <DataverseLogo size={44} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: T.text, margin: '0 0 8px' }}>No assessments yet</h3>
            <p style={{ fontSize: '13.5px', color: '#64748b', margin: '0 0 20px', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto' }}>
              Run your first Dataverse assessment to uncover risks across tables, security, flows, plugins, and more.
            </p>
            <button
              onClick={() => navigate('/dataverse/new')}
              style={{
                padding: '11px 24px', borderRadius: '10px', fontSize: '13.5px', fontWeight: 700,
                background: T.gradBtn, border: 'none', color: '#fff', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                boxShadow: '0 2px 12px rgba(77,168,160,0.35)',
              }}
            >
              <PlusCircle style={{ width: '15px', height: '15px' }} /> Start First Assessment
            </button>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sessions.map(s => (
              <div
                key={s.job_id}
                onClick={() => navigate(`/dataverse/sessions/${s.job_id}`)}
                style={{
                  background: '#fff', borderRadius: '16px', padding: '18px 20px',
                  boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
                  cursor: 'pointer', transition: 'all 180ms',
                  display: 'flex', alignItems: 'center', gap: '16px',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(77,168,160,0.14), 0 8px 32px rgba(77,168,160,0.08)'
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'
                  ;(e.currentTarget as HTMLDivElement).style.borderColor = T.light200
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = T.shadowCard
                  ;(e.currentTarget as HTMLDivElement).style.transform = ''
                  ;(e.currentTarget as HTMLDivElement).style.borderColor = T.light100
                }}
              >
                {/* Score ring */}
                {s.status === 'completed' && scoreRing(Math.round(s.overall_score))}
                {s.status !== 'completed' && (
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                    background: T.light50, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Database style={{ width: '16px', height: '16px', color: T.mid }} />
                  </div>
                )}

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.label || s.environment_url}
                    </p>
                    {statusBadge(s.status)}
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                    {s.organization_name && <span style={{ fontWeight: 600, color: T.textMid }}>{s.organization_name} · </span>}
                    {s.environment_url}
                  </p>
                  <div style={{ display: 'flex', gap: '14px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {s.total_checks > 0 && (
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{s.total_checks} checks</span>
                    )}
                    {s.critical_findings > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>
                        {s.critical_findings} critical
                      </span>
                    )}
                    {s.high_findings > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#d97706' }}>
                        {s.high_findings} high
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {s.duration_seconds != null && (
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{s.duration_seconds}s</span>
                    )}
                  </div>
                </div>

                <ChevronRight style={{ width: '16px', height: '16px', color: T.mid, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
