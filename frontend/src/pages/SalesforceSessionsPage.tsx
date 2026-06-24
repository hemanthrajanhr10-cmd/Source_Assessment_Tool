import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PlusCircle, RefreshCw, Loader2, CheckCircle, XCircle,
  Clock, ChevronRight, BarChart3, Shield, AlertTriangle, TrendingUp,
} from 'lucide-react'
import axios from 'axios'
import { SalesforceLogo } from '../components/ui/SourceLogos'
import type { SalesforceSessionRecord } from '../types/api'

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
    completed: { icon: CheckCircle,   bg: 'rgba(5,150,105,0.10)',   color: '#065f46', label: 'Completed' },
    failed:    { icon: XCircle,       bg: 'rgba(220,38,38,0.10)',   color: '#991b1b', label: 'Failed'    },
    running:   { icon: Loader2,       bg: 'rgba(77,168,160,0.10)',  color: T.primary, label: 'Running'   },
    pending:   { icon: Clock,         bg: 'rgba(100,116,139,0.10)', color: '#475569', label: 'Pending'   },
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

function orgTypeBadge(orgType?: string) {
  if (!orgType) return null
  const isSandbox = orgType === 'Sandbox'
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      background: isSandbox ? 'rgba(217,119,6,0.10)' : T.glow,
      color: isSandbox ? '#92400e' : T.primary,
      border: isSandbox ? '1px solid rgba(217,119,6,0.22)' : `1px solid ${T.light200}`,
    }}>
      {orgType}
    </span>
  )
}

export default function SalesforceSessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SalesforceSessionRecord[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [refresh,  setRefresh]  = useState(0)

  const token = () => localStorage.getItem('sat_token') || ''

  useEffect(() => {
    setLoading(true)
    axios.get('/api/v1/salesforce/sessions', { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => { setSessions(r.data); setError('') })
      .catch(() => setError('Failed to load sessions.'))
      .finally(() => setLoading(false))
  }, [refresh])

  const completed     = sessions.filter(s => s.status === 'completed')
  const avgScore      = completed.length
    ? Math.round(completed.reduce((a, s) => a + s.overall_score, 0) / completed.length)
    : 0
  const totalCritical = completed.reduce((a, s) => a + s.critical_findings, 0)
  const totalHigh     = completed.reduce((a, s) => a + s.high_findings, 0)

  return (
    <div style={{ minHeight: '100vh', background: T.surface }}>
      {/* Hero */}
      <div style={{ background: T.gradHero, padding: '28px 32px 24px', position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${T.light100}` }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: T.glow, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: T.light50, border: `1px solid ${T.light200}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <SalesforceLogo size={26} />
            </div>
            <div>
              <h1 style={{ color: T.dark, fontSize: '20px', fontWeight: 700, margin: 0 }}>Salesforce Assessments</h1>
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
                padding: '8px 14px', borderRadius: '10px',
                border: `1.5px solid ${T.light200}`, background: '#fff',
                color: T.primary, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <RefreshCw style={{ width: '13px', height: '13px' }} />
              Refresh
            </button>
            <button
              onClick={() => navigate('/salesforce/new')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '10px', border: 'none',
                background: T.gradBtn, color: '#fff',
                fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <PlusCircle style={{ width: '13px', height: '13px' }} />
              New Assessment
            </button>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {completed.length > 0 && (
        <div style={{ background: '#fff', borderBottom: `1px solid ${T.light100}`, padding: '16px 32px' }}>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {[
              { icon: TrendingUp, label: 'Avg Score', value: `${avgScore}/100`, color: avgScore >= 80 ? '#059669' : avgScore >= 60 ? '#d97706' : '#dc2626' },
              { icon: AlertTriangle, label: 'Critical Findings', value: totalCritical.toString(), color: totalCritical > 0 ? '#dc2626' : '#059669' },
              { icon: Shield, label: 'High Findings', value: totalHigh.toString(), color: totalHigh > 0 ? '#d97706' : '#059669' },
              { icon: BarChart3, label: 'Completed', value: completed.length.toString(), color: T.primary },
            ].map(stat => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                  background: `${stat.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <stat.icon style={{ width: '14px', height: '14px', color: stat.color }} />
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>{stat.label}</p>
                  <p style={{ fontSize: '15px', fontWeight: 800, color: stat.color, margin: 0 }}>{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 48px' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '12px' }}>
            <Loader2 style={{ width: '20px', height: '20px', color: T.primary, animation: 'spin 1s linear infinite' }} />
            <span style={{ color: T.textMid, fontSize: '14px' }}>Loading sessions…</span>
          </div>
        )}

        {error && (
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)', color: '#991b1b', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: T.light100, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SalesforceLogo size={32} />
            </div>
            <p style={{ color: T.dark, fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>No Salesforce assessments yet</p>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 20px' }}>Run your first assessment to analyse your org across 8 API surfaces</p>
            <button
              onClick={() => navigate('/salesforce/new')}
              style={{
                padding: '10px 22px', borderRadius: '10px', border: 'none',
                background: T.gradBtn, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Start First Assessment
            </button>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sessions.map(s => (
              <div
                key={s.job_id}
                onClick={() => navigate(`/salesforce/sessions/${s.job_id}`)}
                style={{
                  background: '#fff', borderRadius: '14px', padding: '16px 20px',
                  border: `1px solid ${T.light100}`, cursor: 'pointer',
                  boxShadow: T.shadowCard, transition: 'all 180ms',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto auto',
                  alignItems: 'center',
                  gap: '16px',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(77,168,160,0.12), 0 1px 3px rgba(77,168,160,0.08)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = T.light200
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = T.shadowCard
                  ;(e.currentTarget as HTMLElement).style.borderColor = T.light100
                }}
              >
                {/* Label + URL */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: T.dark, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.label || s.instance_url}
                    </p>
                    {orgTypeBadge(s.org_type)}
                    {s.org_name && (
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>{s.org_name}</span>
                    )}
                  </div>
                  <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.instance_url}
                  </p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
                    {new Date(s.created_at).toLocaleString()}
                    {s.duration_seconds != null && ` · ${s.duration_seconds.toFixed(1)}s`}
                  </p>
                </div>

                {/* Status badge */}
                <div>{statusBadge(s.status)}</div>

                {/* Checks */}
                <div style={{ textAlign: 'right', minWidth: '60px' }}>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0 0 2px', textAlign: 'center' }}>Checks</p>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: T.dark, margin: 0, textAlign: 'center' }}>{s.total_checks || '—'}</p>
                </div>

                {/* Critical */}
                <div style={{ textAlign: 'right', minWidth: '60px' }}>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0 0 2px', textAlign: 'center' }}>Critical</p>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: s.critical_findings > 0 ? '#dc2626' : '#059669', margin: 0, textAlign: 'center' }}>
                    {s.status === 'completed' ? s.critical_findings : '—'}
                  </p>
                </div>

                {/* Score ring */}
                {s.status === 'completed' ? scoreRing(Math.round(s.overall_score)) : <div style={{ width: '36px' }} />}

                <ChevronRight style={{ width: '16px', height: '16px', color: '#cbd5e1', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
