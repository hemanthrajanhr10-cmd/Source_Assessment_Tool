import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, AlertCircle, RefreshCw, Loader2 } from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { DatabricksSessionRecord } from '../types/api'
import { DatabricksLogo } from '../components/ui/SourceLogos'
import { useSessionFilter } from '../hooks/useSessionFilter'
import SessionFilterBar from '../components/ui/SessionFilterBar'
import { theme } from './databricks/theme'
import { Button } from './databricks/components/Button'
import { SessionStatusTag, CloudTag } from './databricks/components/StatusTag'
import GlobalStyles from './databricks/components/GlobalStyles'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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

function metricText(value: number | null | undefined, unit: string): string | null {
  return value != null ? `${value} ${unit}` : null
}

// Structured row — replaces the previous card-grid pattern. Rows are
// separated by a divider, hover is a background tint only (no shadow lift).
function SessionRow({ s, onClick }: { s: DatabricksSessionRecord; onClick: () => void }) {
  const scoreColor = s.overall_score != null
    ? s.overall_score >= 80 ? theme.color.success : s.overall_score >= 60 ? theme.color.warning : theme.color.danger
    : theme.color.inkMuted

  const metrics = [
    metricText(s.cluster_count, 'clusters'),
    metricText(s.warehouse_count, 'warehouses'),
    metricText(s.catalog_count, 'catalogs'),
    metricText(s.job_count, 'jobs'),
    metricText(s.total_checks, 'checks'),
  ].filter(Boolean) as string[]

  return (
    <button
      onClick={onClick}
      className="db-list-row"
      style={{
        width: '100%', textAlign: 'left', display: 'block',
        background: 'none', border: 'none', borderBottom: `1px solid ${theme.color.divider}`,
        padding: '14px 6px', cursor: 'pointer', transition: `background ${theme.motion.fast}ms`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 32, height: 32, borderRadius: theme.radius.sm, overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: theme.color.surface, border: `1px solid ${theme.color.border}`,
          }}>
            <DatabricksLogo size={22} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: theme.color.ink }}>
                {s.label || s.workspace_name || workspaceShort(s.workspace_url)}
              </span>
              <CloudTag cloud={s.cloud} />
              <SessionStatusTag status={s.status} />
            </div>
            <p style={{
              fontSize: 11, color: theme.color.inkMuted, margin: '2px 0 0',
              fontFamily: theme.font.mono, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', maxWidth: 420,
            }}>
              {s.workspace_url || '—'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
          {metrics.length > 0 && (
            <div style={{ display: 'flex', gap: 14 }}>
              {metrics.map(m => (
                <span key={m} style={{ fontSize: 11, color: theme.color.inkMuted, fontFamily: theme.font.mono, whiteSpace: 'nowrap' }}>{m}</span>
              ))}
            </div>
          )}
          {s.overall_score != null && (
            <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor, fontFamily: theme.font.mono, minWidth: 42, textAlign: 'right' }}>
              {s.overall_score.toFixed(0)}%
            </span>
          )}
          <span style={{ fontSize: 11, color: theme.color.inkMuted, minWidth: 78, textAlign: 'right' }} title={formatDate(s.created_at)}>
            {relativeTime(s.created_at)}
          </span>
          <ChevronRight style={{ width: 15, height: 15, color: theme.color.inkFaint, flexShrink: 0 }} />
        </div>
      </div>

      {s.status === 'failed' && s.error && (
        <p style={{ fontSize: 11, color: theme.color.danger, margin: '8px 0 0 44px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.error}
        </p>
      )}
    </button>
  )
}

export default function DatabricksSessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<DatabricksSessionRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const { filter, filtered: filteredRaw, setField, reset, isActive } = useSessionFilter(sessions)
  const filtered = filteredRaw as DatabricksSessionRecord[]

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
    <div className="db-scope" style={{ minHeight: '100vh', background: theme.color.canvas, padding: '28px 24px 56px', fontFamily: theme.font.body }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div style={{
            width: 40, height: 40, borderRadius: theme.radius.md, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: theme.color.surface, border: `1px solid ${theme.color.border}`, flexShrink: 0,
          }}>
            <DatabricksLogo size={26} />
          </div>
          <div>
            <h1 style={{ fontFamily: theme.font.display, fontSize: 18, fontWeight: 700, color: theme.color.ink, margin: 0, letterSpacing: '-0.02em' }}>
              Databricks Assessments
            </h1>
            <p style={{ fontSize: 11, color: theme.color.inkMuted, margin: '3px 0 0' }}>
              Workspace · Unity Catalog · Compute · Security · MLflow
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <SessionFilterBar
          filter={filter}
          onField={setField}
          onReset={reset}
          isActive={isActive}
          totalCount={sessions.length}
          filteredCount={filtered.length}
          actions={
            <>
              <Button variant="secondary" Icon={RefreshCw} onClick={load}>Refresh</Button>
              <Button variant="primary" Icon={Plus} onClick={() => navigate('/databricks/new')}>New Assessment</Button>
            </>
          }
        />

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
            <Loader2 style={{ width: 22, height: 22, animation: 'db-spin 1s linear infinite', color: theme.color.accent }} />
          </div>
        ) : error ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
            borderRadius: theme.radius.md, background: theme.color.dangerBg, color: theme.color.danger, fontSize: 13,
          }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            {error}
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
            <div style={{
              width: 60, height: 60, borderRadius: theme.radius.lg, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: theme.color.surface, border: `1px solid ${theme.color.border}`, marginBottom: 18,
            }}>
              <DatabricksLogo size={38} />
            </div>
            <h3 style={{ fontFamily: theme.font.display, fontSize: 15, fontWeight: 600, color: theme.color.ink, margin: '0 0 8px' }}>
              No assessments yet
            </h3>
            <p style={{ fontSize: 13, color: theme.color.inkMuted, margin: '0 0 22px', maxWidth: 320, lineHeight: 1.6 }}>
              Start a new Databricks assessment to analyse workspace inventory, Unity Catalog, compute, and security posture.
            </p>
            <Button variant="primary" Icon={Plus} onClick={() => navigate('/databricks/new')}>New Assessment</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: theme.color.ink, margin: '0 0 8px' }}>No sessions match your filters</h3>
            <p style={{ fontSize: 12, color: theme.color.inkMuted, margin: '0 0 16px' }}>Try adjusting your search or filter criteria.</p>
            <Button variant="secondary" onClick={reset}>Clear filters</Button>
          </div>
        ) : (
          <div>
            {filtered.map(s => (
              <SessionRow key={s.job_id} s={s} onClick={() => navigate(`/databricks/sessions/${s.job_id}`)} />
            ))}
          </div>
        )}
      </div>

      <GlobalStyles />
    </div>
  )
}
