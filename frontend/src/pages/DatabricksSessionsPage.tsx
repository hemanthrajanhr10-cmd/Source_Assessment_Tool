import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Loader2, Clock,
  ChevronRight, Plus, AlertCircle, RefreshCw,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { DatabricksSessionRecord } from '../types/api'
import { DatabricksLogo } from '../components/ui/SourceLogos'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:        '#F6FFFE',
  surface:   '#FFFFFF',
  border:    '#B2DDD9',
  borderFaint:'#D4EFEC',
  teal:      '#6CBDB5',
  tealDark:  '#4DA8A0',
  tealMid:   '#93CCC6',
  tealGlow:  'rgba(108,189,181,0.18)',
  tealFaint: 'rgba(108,189,181,0.07)',
  brand:     '#FF3621',
  shadow1:   '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.08)',
  shadow2:   '0 4px 12px rgba(77,168,160,0.10), 0 16px 40px rgba(77,168,160,0.12)',
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
    completed: {
      icon: <CheckCircle2 style={{ width: 11, height: 11 }} />,
      bg: 'rgba(5,150,105,0.10)', text: '#059669', label: 'Completed',
    },
    failed: {
      icon: <XCircle style={{ width: 11, height: 11 }} />,
      bg: 'rgba(220,38,38,0.10)', text: '#DC2626', label: 'Failed',
    },
    running: {
      icon: <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />,
      bg: 'rgba(77,168,160,0.12)', text: '#4DA8A0', label: 'Running',
    },
    pending: {
      icon: <Clock style={{ width: 11, height: 11 }} />,
      bg: 'rgba(118,122,140,0.10)', text: '#767A8C', label: 'Pending',
    },
  }
  const s = map[status] ?? map.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.text,
    }}>
      {s.icon}{s.label}
    </span>
  )
}

function CloudTag({ cloud }: { cloud?: string }) {
  if (!cloud) return null
  const map: Record<string, { bg: string; text: string }> = {
    azure: { bg: 'rgba(37,99,235,0.10)',  text: '#1D4ED8' },
    aws:   { bg: 'rgba(234,88,12,0.10)',   text: '#C2410C' },
    gcp:   { bg: 'rgba(5,150,105,0.10)',   text: '#059669' },
  }
  const c = map[cloud.toLowerCase()] ?? { bg: 'rgba(118,122,140,0.10)', text: '#767A8C' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      background: c.bg, color: c.text, textTransform: 'uppercase',
    }}>
      {cloud.toUpperCase()}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function workspaceShort(url?: string): string {
  if (!url) return '—'
  try {
    return new URL(url).hostname
      .replace('.azuredatabricks.net', '')
      .replace('.cloud.databricks.com', '')
      .replace('.gcp.databricks.com', '')
  } catch {
    return url
  }
}

function SessionCard({ s, onClick }: { s: DatabricksSessionRecord; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const scoreColor = s.overall_score != null
    ? s.overall_score >= 80 ? '#059669' : s.overall_score >= 60 ? '#D97706' : '#DC2626'
    : '#767A8C'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', textAlign: 'left',
        background: D.surface, borderRadius: 16,
        border: `1.5px solid ${hovered ? D.teal : D.border}`,
        padding: '18px 20px',
        boxShadow: hovered ? D.shadow2 : D.shadow1,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
          {/* Logo slot */}
          <div style={{
            width: 40, height: 40, borderRadius: 11, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: D.surface, flexShrink: 0, marginTop: 1,
            border: `1px solid ${D.borderFaint}`,
            boxShadow: '0 2px 8px rgba(77,168,160,0.08)',
          }}>
            <DatabricksLogo size={28} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0D1117', letterSpacing: '-0.01em' }}>
                {s.label || s.workspace_name || workspaceShort(s.workspace_url)}
              </span>
              <CloudTag cloud={s.cloud} />
              <StatusBadge status={s.status} />
            </div>
            <p style={{
              fontSize: 11, color: '#767A8C', margin: 0,
              fontFamily: '"JetBrains Mono","Fira Code",monospace',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380,
            }}>
              {s.workspace_url || '—'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          {s.overall_score != null && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 10, color: '#767A8C', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Score</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: scoreColor, margin: 0, letterSpacing: '-0.02em' }}>
                {s.overall_score.toFixed(0)}%
              </p>
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#767A8C', margin: '0 0 1px' }}>{formatDate(s.created_at)}</p>
            <p style={{ fontSize: 10, color: '#B0BAC4', margin: 0 }}>{relativeTime(s.created_at)}</p>
          </div>
          <ChevronRight style={{
            width: 16, height: 16,
            color: hovered ? D.teal : '#CBD2DA',
            transition: 'color 0.15s, transform 0.15s',
            transform: hovered ? 'translateX(2px)' : 'translateX(0)',
          }} />
        </div>
      </div>

      {/* Metrics row */}
      {(s.cluster_count != null || s.warehouse_count != null || s.catalog_count != null || s.job_count != null || s.total_checks != null) && (
        <div style={{
          marginTop: 14, paddingTop: 12,
          borderTop: `1px solid ${hovered ? D.borderFaint : 'rgba(226,230,234,0.7)'}`,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          transition: 'border-color 0.2s',
        }}>
          {s.cluster_count != null && (
            <span style={{ fontSize: 11, color: '#767A8C' }}>
              <span style={{ fontWeight: 700, color: '#404555' }}>{s.cluster_count}</span> clusters
            </span>
          )}
          {s.warehouse_count != null && (
            <span style={{ fontSize: 11, color: '#767A8C' }}>
              <span style={{ fontWeight: 700, color: '#404555' }}>{s.warehouse_count}</span> warehouses
            </span>
          )}
          {s.catalog_count != null && (
            <span style={{ fontSize: 11, color: '#767A8C' }}>
              <span style={{ fontWeight: 700, color: '#404555' }}>{s.catalog_count}</span> catalogs
            </span>
          )}
          {s.job_count != null && (
            <span style={{ fontSize: 11, color: '#767A8C' }}>
              <span style={{ fontWeight: 700, color: '#404555' }}>{s.job_count}</span> jobs
            </span>
          )}
          {s.total_checks != null && (
            <span style={{ fontSize: 11, color: '#767A8C' }}>
              <span style={{ fontWeight: 700, color: '#404555' }}>{s.total_checks}</span> checks
            </span>
          )}
          {s.critical_findings != null && s.critical_findings > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>
              {s.critical_findings} critical
            </span>
          )}
          {s.high_findings != null && s.high_findings > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#D97706' }}>
              {s.high_findings} high
            </span>
          )}
          {s.critical_findings === 0 && s.high_findings === 0 && s.status === 'completed' && (
            <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>No critical findings</span>
          )}
        </div>
      )}

      {s.status === 'failed' && s.error && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(220,38,38,0.12)' }}>
          <p style={{ fontSize: 11, color: '#DC2626', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.error}
          </p>
        </div>
      )}
    </button>
  )
}

export default function DatabricksSessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<DatabricksSessionRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.databricksListSessions()
      setSessions(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ minHeight: '100vh', background: D.bg, padding: '28px 24px 56px', fontFamily: "'Inter Variable','Inter',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 13, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: D.surface, border: `1.5px solid ${D.borderFaint}`,
              boxShadow: D.shadow1, flexShrink: 0,
            }}>
              <DatabricksLogo size={30} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0D1117', margin: 0, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                Databricks Assessments
              </h1>
              <p style={{ fontSize: 11, color: '#767A8C', margin: '3px 0 0', letterSpacing: '0.01em' }}>
                Workspace · Unity Catalog · Compute · Security · MLflow
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={load}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                background: D.surface, border: `1.5px solid ${D.border}`, color: '#404555',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = D.teal
                ;(e.currentTarget as HTMLButtonElement).style.color = D.tealDark
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = D.border
                ;(e.currentTarget as HTMLButtonElement).style.color = '#404555'
              }}
            >
              <RefreshCw style={{ width: 12, height: 12 }} />
              Refresh
            </button>
            <button
              onClick={() => navigate('/databricks/new')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: `linear-gradient(135deg, ${D.tealDark}, ${D.teal})`,
                color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: `0 4px 16px ${D.tealGlow}`,
                transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${D.tealGlow}`
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 16px ${D.tealGlow}`
              }}
            >
              <Plus style={{ width: 13, height: 13 }} />
              New Assessment
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
            <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: D.teal }} />
          </div>
        ) : error ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '16px 20px', borderRadius: 12,
            background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.18)',
            color: '#DC2626', fontSize: 13,
          }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            {error}
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: D.surface, border: `1.5px solid ${D.borderFaint}`,
              boxShadow: D.shadow1, marginBottom: 20,
            }}>
              <DatabricksLogo size={48} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1117', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              No assessments yet
            </h3>
            <p style={{ fontSize: 13, color: '#767A8C', margin: '0 0 24px', maxWidth: 320, lineHeight: 1.6 }}>
              Start a new Databricks assessment to analyse workspace inventory, Unity Catalog, compute, and security posture.
            </p>
            <button
              onClick={() => navigate('/databricks/new')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 24px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                background: `linear-gradient(135deg, ${D.tealDark}, ${D.teal})`,
                color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: `0 4px 16px ${D.tealGlow}`,
                transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'}
            >
              <Plus style={{ width: 14, height: 14 }} />
              New Assessment
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map(s => (
              <SessionCard
                key={s.job_id}
                s={s}
                onClick={() => navigate(`/databricks/sessions/${s.job_id}`)}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
