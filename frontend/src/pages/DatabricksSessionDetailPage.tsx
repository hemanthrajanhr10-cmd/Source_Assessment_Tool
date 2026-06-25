import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Loader2, ArrowLeft, FileSpreadsheet,
  BarChart3, Shield, Database, Server, Activity,
  Layers, Zap, Users, AlertTriangle, Package,
  Cloud, Lock, HardDrive, GitBranch, Cpu, FlaskConical,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { DatabricksIconLogo } from '../components/ui/SourceLogos'
import type {
  DatabricksJobStatusResponse, DatabricksAssessmentResult,
  DatabricksCluster, DatabricksWarehouse, DatabricksCatalog,
  DatabricksJob, DatabricksUser, DatabricksCheckResult,
} from '../types/api'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:          '#FFF7F5',
  surface:     '#FFFFFF',
  surface2:    '#FFF7F5',
  border:      '#FFCEC4',
  borderFaint: '#FFE5DF',
  brand:       '#FF3621',
  brandMid:    '#FC5C35',
  brandLight:  '#FF7A5A',
  brandGlow:   'rgba(255,54,33,0.10)',
  brandFaint:  'rgba(255,54,33,0.05)',
  dark:        '#C0280F',
  textPrimary: '#0D1117',
  textSecond:  '#404555',
  textMuted:   '#767A8C',
  green:       '#059669',
  greenDim:    'rgba(5,150,105,0.10)',
  amber:       '#D97706',
  amberDim:    'rgba(217,119,6,0.10)',
  red:         '#DC2626',
  redDim:      'rgba(220,38,38,0.08)',
  shadow:      '0 1px 3px rgba(255,54,33,0.04), 0 4px 16px rgba(255,54,33,0.06)',
  shadowHover: '0 4px 20px rgba(255,54,33,0.14)',
  fontMono:    '"JetBrains Mono", "Fira Code", monospace',
}

type TabKey = 'overview' | 'clusters' | 'warehouses' | 'catalog' | 'jobs' | 'security' | 'integrations' | 'mlflow' | 'checks'

const fmtN   = (n?: number | null) => n == null ? '—' : n.toLocaleString()
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
  catch { return iso }
}
const truncate = (s: string, n = 80) => s.length > n ? s.slice(0, n) + '…' : s

function guessProgress(msg?: string | null): number {
  if (!msg) return 0
  const m = msg.match(/Step (\d+)\/(\d+)/)
  if (m) return Math.round(parseInt(m[1]) / parseInt(m[2]) * 100)
  return 5
}

// ── Shared micro-components ────────────────────────────────────────────────────

function Badge({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
      color, background: bg, border: `1px solid ${border}` }}>{label}</span>
  )
}

function StatCard({ icon: Icon, label, value, sub, accent = D.brand }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; accent?: string
}) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: D.surface,
      border: `1px solid ${D.border}`, boxShadow: D.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}18`, border: `1px solid ${accent}33`, flexShrink: 0 }}>
          <Icon style={{ width: 13, height: 13, color: accent }} />
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: D.textMuted }}>{label}</span>
      </div>
      <p style={{ fontSize: 20, fontWeight: 800, color: D.textPrimary, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: D.textMuted, marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

function HealthTile({ label, status, detail }: { label: string; status: 'good' | 'warn' | 'crit' | 'info'; detail: string }) {
  const cfg = {
    good: { color: D.green,  bg: D.greenDim, border: `${D.green}33`,  Icon: CheckCircle2, text: 'OK' },
    warn: { color: D.amber,  bg: D.amberDim, border: `${D.amber}33`,  Icon: AlertTriangle, text: 'WARN' },
    crit: { color: D.red,    bg: D.redDim,   border: `${D.red}33`,    Icon: XCircle,       text: 'CRITICAL' },
    info: { color: D.brand,  bg: D.brandGlow,border: `${D.brand}33`,  Icon: CheckCircle2,  text: 'INFO' },
  }[status]
  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <cfg.Icon style={{ width: 12, height: 12, color: cfg.color }} />
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: cfg.color }}>{cfg.text}</span>
      </div>
      <p style={{ fontSize: 11, fontWeight: 700, color: D.textPrimary, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 10, color: D.textMuted }}>{detail}</p>
    </div>
  )
}

function SectionCard({ title, icon: Icon, count, children }: {
  title: string; icon: React.ElementType; count?: number; children: React.ReactNode
}) {
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: 14, overflow: 'hidden', boxShadow: D.shadow }}>
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${D.borderFaint}`,
        background: `linear-gradient(135deg, ${D.surface2} 0%, ${D.surface} 100%)`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, ${D.brand}, ${D.brandMid})` }}>
          <Icon style={{ width: 12, height: 12, color: '#fff' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: D.textPrimary, flex: 1 }}>{title}</span>
        {count !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 700, color: D.brand,
            background: D.brandGlow, border: `1px solid ${D.brand}33`,
            padding: '1px 8px', borderRadius: 6 }}>{count.toLocaleString()}</span>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}

function DataTable({ cols, rows }: {
  cols: string[]
  rows: (string | number | boolean | null | undefined)[][]
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: D.surface2 }}>
            {cols.map((h) => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
                borderBottom: `1px solid ${D.borderFaint}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? D.surface2 : D.surface, borderBottom: `1px solid ${D.borderFaint}` }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '7px 12px', color: j === 0 ? D.textPrimary : D.textSecond,
                  fontFamily: j === 0 ? D.fontMono : 'inherit', fontWeight: j === 0 ? 600 : 400,
                  whiteSpace: j === 0 ? 'nowrap' : 'normal' }}>
                  {cell == null || cell === '' ? '—' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KV({ rows }: { rows: [string, string | number | boolean | undefined | null][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', padding: '14px 18px' }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          paddingBottom: 6, borderBottom: `1px solid ${D.borderFaint}` }}>
          <span style={{ fontSize: 11, color: D.textMuted }}>{k}</span>
          <span style={{ fontSize: 12, color: D.textPrimary, fontWeight: 600, fontFamily: D.fontMono,
            textAlign: 'right', maxWidth: '55%', wordBreak: 'break-word' }}>
            {v == null || v === '' ? '—' : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DatabricksSessionDetailPage() {
  const { jobId }   = useParams<{ jobId: string }>()
  const navigate    = useNavigate()
  const [status, setStatus]   = useState<DatabricksJobStatusResponse | null>(null)
  const [result, setResult]   = useState<DatabricksAssessmentResult  | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [tab, setTab]         = useState<TabKey>('overview')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!jobId) return
    try {
      const res = await api.databricksGetJobStatus(jobId)
      setStatus(res.data)
      if (res.data.status === 'completed') {
        clearInterval(pollRef.current!)
        const r = await api.databricksGetJobResults(jobId)
        setResult(r.data)
      } else if (res.data.status === 'failed') {
        clearInterval(pollRef.current!)
      }
    } catch (e) { setLoadErr(getApiErrorMessage(e)); clearInterval(pollRef.current!) }
  }, [jobId])

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchStatus])

  const jobStatus = status?.status ?? 'pending'
  const progress  = jobStatus === 'completed' ? 100 : jobStatus === 'failed' ? 0 : guessProgress(status?.progress_message)

  const wi  = result?.workspace_info
  const cs  = result?.cluster_summary
  const ws  = result?.warehouse_summary
  const uc  = result?.unity_catalog
  const js  = result?.job_summary
  const sec = result?.security_summary
  const int = result?.integration_summary
  const ml  = result?.mlflow_summary

  // ── Health scorecard ──────────────────────────────────────────────────────
  const healthTiles: { label: string; status: 'good'|'warn'|'crit'|'info'; detail: string }[] = result ? [
    {
      label: 'Clusters without Auto-Terminate',
      status: (cs?.clusters_without_autoterminate ?? 0) === 0 ? 'good' : (cs?.clusters_without_autoterminate ?? 0) <= 3 ? 'warn' : 'crit',
      detail: `${fmtN(cs?.clusters_without_autoterminate)} clusters risk runaway costs`,
    },
    {
      label: 'Unity Catalog',
      status: uc != null ? 'good' : 'warn',
      detail: uc != null ? `${fmtN(uc.catalog_count)} catalogs, ${fmtN(uc.table_count)} tables` : 'Unity Catalog not detected',
    },
    {
      label: 'Workspace Admins',
      status: (sec?.workspace_admins ?? 0) <= 5 ? 'good' : (sec?.workspace_admins ?? 0) <= 10 ? 'warn' : 'crit',
      detail: `${fmtN(sec?.workspace_admins)} workspace admin(s)`,
    },
    {
      label: 'IP Access Lists',
      status: (sec?.ip_access_list_count ?? 0) > 0 ? 'good' : 'warn',
      detail: (sec?.ip_access_list_count ?? 0) > 0 ? `${fmtN(sec?.ip_access_list_count)} access list(s) configured` : 'No IP access lists — workspace open to all IPs',
    },
    {
      label: 'DBFS Legacy Mounts',
      status: (int?.dbfs_mount_count ?? 0) === 0 ? 'good' : 'warn',
      detail: `${fmtN(int?.dbfs_mount_count)} DBFS mount(s) — migrate to Unity Catalog external locations`,
    },
    {
      label: 'Warehouses without Auto-Stop',
      status: (ws?.warehouses_without_auto_stop ?? 0) === 0 ? 'good' : 'warn',
      detail: `${fmtN(ws?.warehouses_without_auto_stop)} SQL warehouse(s) missing auto-stop`,
    },
  ] : []

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'overview',     label: 'Overview',        icon: BarChart3     },
    { key: 'clusters',     label: 'Clusters',         icon: Cpu           },
    { key: 'warehouses',   label: 'SQL Warehouses',   icon: Database      },
    { key: 'catalog',      label: 'Unity Catalog',    icon: Layers        },
    { key: 'jobs',         label: 'Jobs',             icon: Activity      },
    { key: 'security',     label: 'Users & Security', icon: Shield        },
    { key: 'integrations', label: 'Integrations',     icon: Cloud         },
    { key: 'mlflow',       label: 'MLflow & Serving', icon: FlaskConical  },
    { key: 'checks',       label: 'Checks',           icon: AlertTriangle },
  ]

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${D.bg} 0%, #FFDED7 100%)`,
        borderBottom: `1px solid ${D.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 32px' }}>
          <button onClick={() => navigate('/databricks/sessions')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
              fontSize: 12, color: D.brand, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <ArrowLeft style={{ width: 14, height: 14 }} /> Back to assessments
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${D.brand}, ${D.brandMid})`,
                boxShadow: `0 4px 16px ${D.brandGlow}` }}>
                <DatabricksIconLogo size={30} />
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: D.textPrimary, margin: 0 }}>
                  {status?.label || 'Databricks Assessment'}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                  {(status?.workspace_url || result?.workspace_url) && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: D.textMuted, fontFamily: D.fontMono }}>
                      <Server style={{ width: 11, height: 11 }} />
                      {(status?.workspace_url || result?.workspace_url)!.replace('https://', '')}
                    </span>
                  )}
                  {wi?.cloud && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                      color: D.brand, background: D.brandGlow, border: `1px solid ${D.brand}33` }}>
                      {wi.cloud.toUpperCase()}
                    </span>
                  )}
                  {wi?.region && (
                    <span style={{ fontSize: 11, color: D.textMuted }}>{wi.region}</span>
                  )}
                  <span style={{ fontSize: 10, fontFamily: D.fontMono, color: D.textMuted }}>{jobId?.slice(0, 8)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {result && (
                <button onClick={() => api.databricksDownloadExcel(jobId!, status?.label || undefined)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                    borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: `linear-gradient(135deg, ${D.brand}, ${D.brandMid})`,
                    color: '#fff', border: 'none', boxShadow: `0 2px 10px ${D.brandGlow}` }}>
                  <FileSpreadsheet style={{ width: 14, height: 14 }} /> Export Excel (9 sheets)
                </button>
              )}
              {jobStatus === 'completed' && <Badge label="Completed" color={D.green} bg={D.greenDim} border={`${D.green}33`} />}
              {jobStatus === 'failed'    && <Badge label="Failed"    color={D.red}   bg={D.redDim}   border={`${D.red}33`} />}
              {(jobStatus === 'running' || jobStatus === 'pending') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 10,
                  background: D.brandGlow, border: `1px solid ${D.brand}33`, color: D.brand, fontSize: 12, fontWeight: 700 }}>
                  <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
                  {jobStatus === 'running' ? 'Running…' : 'Pending'}
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {(jobStatus === 'running' || jobStatus === 'pending') && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: D.textMuted }}>{status?.progress_message || 'Initialising…'}</span>
                <span style={{ fontSize: 11, color: D.brand, fontWeight: 700 }}>{progress}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 5, background: D.borderFaint, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 5, width: '100%',
                  transformOrigin: 'left', transition: 'transform 0.5s ease',
                  transform: `scaleX(${progress / 100})`,
                  background: `linear-gradient(90deg, ${D.brand}, ${D.brandMid})` }} />
              </div>
            </div>
          )}

          {loadErr && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, fontSize: 12,
              background: D.redDim, border: `1px solid ${D.red}33`, color: D.red }}>{loadErr}</div>
          )}
          {jobStatus === 'failed' && status?.error && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, fontSize: 12,
              background: D.redDim, border: `1px solid ${D.red}33`, color: D.red }}>{status.error}</div>
          )}
        </div>
      </div>

      {/* Waiting spinner */}
      {!result && !loadErr && (jobStatus === 'pending' || jobStatus === 'running') && (
        <div style={{ maxWidth: 1200, margin: '60px auto', padding: '0 32px', textAlign: 'center' }}>
          <Loader2 style={{ width: 40, height: 40, color: D.brand, animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ color: D.textMuted, fontSize: 13 }}>{status?.progress_message || 'Assessment running…'}</p>
        </div>
      )}

      {result && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px 40px' }}>

          {/* ── Health Scorecard ────────────────────────────────────────────── */}
          <div style={{ paddingTop: 24, marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: D.textMuted, marginBottom: 10 }}>Health Scorecard</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              {healthTiles.map(t => <HealthTile key={t.label} {...t} />)}
            </div>
          </div>

          {/* ── Top stat cards ───────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
            <StatCard icon={Cpu}         label="Clusters"      value={fmtN(cs?.total_clusters)}   sub={`${fmtN(cs?.running_clusters)} running`} />
            <StatCard icon={Database}    label="SQL Warehouses" value={fmtN(ws?.total_warehouses)}  sub={`${fmtN(ws?.running_warehouses)} running`} />
            <StatCard icon={Layers}      label="UC Catalogs"    value={fmtN(uc?.catalog_count)}     sub={uc ? `${fmtN(uc.table_count)} tables` : 'UC not enabled'} />
            <StatCard icon={Activity}    label="Jobs"           value={fmtN(js?.total_jobs)}        sub={`${fmtN(js?.dlt_pipelines)} DLT pipelines`} />
            <StatCard icon={Users}       label="Users"          value={fmtN(sec?.total_users)}      sub={`${fmtN(sec?.admin_users)} admins`} />
            <StatCard icon={FlaskConical} label="Experiments"   value={fmtN(ml?.experiment_count)} sub={`${fmtN(ml?.registered_model_count)} models`} />
            <StatCard icon={Zap}         label="Serving Endpoints" value={fmtN(ml?.model_serving_endpoint_count)} sub={`${fmtN(ml?.running_endpoints)} running`} />
            <StatCard icon={Shield}      label="Secret Scopes"  value={fmtN(sec?.secrets_scope_count)} />
            <StatCard icon={Lock}        label="PAT Tokens"     value={fmtN(sec?.pat_count)} />
            <StatCard icon={HardDrive}   label="DBFS Mounts"    value={fmtN(int?.dbfs_mount_count)} sub="legacy — migrate to UC" accent={int && (int.dbfs_mount_count ?? 0) > 0 ? D.amber : D.brand} />
          </div>

          {/* ── Score band ───────────────────────────────────────────────────── */}
          {result.overall_score != null && (
            <div style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 14, background: D.surface,
              border: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 20, boxShadow: D.shadow }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: D.textMuted }}>Overall Score</p>
                <p style={{ fontSize: 32, fontWeight: 900, lineHeight: 1,
                  color: result.overall_score >= 80 ? D.green : result.overall_score >= 60 ? D.amber : D.red }}>
                  {result.overall_score.toFixed(0)}%
                </p>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: D.textMuted }}>
                    {fmtN(result.passed_checks)} / {fmtN(result.total_checks)} checks passed
                  </span>
                  <span style={{ fontSize: 11, color: D.textMuted }}>
                    {result.critical_findings > 0 && <span style={{ color: D.red, fontWeight: 700 }}>{result.critical_findings} critical  </span>}
                    {result.high_findings > 0 && <span style={{ color: D.amber, fontWeight: 600 }}>{result.high_findings} high</span>}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 8, background: D.borderFaint, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 8,
                    width: `${result.overall_score}%`,
                    background: result.overall_score >= 80
                      ? `linear-gradient(90deg, ${D.green}, #34d399)`
                      : result.overall_score >= 60
                        ? `linear-gradient(90deg, ${D.amber}, #fbbf24)`
                        : `linear-gradient(90deg, ${D.red}, #f87171)`,
                  }} />
                </div>
              </div>
              {result.duration_seconds != null && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 10, color: D.textMuted }}>Duration</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: D.textPrimary, fontFamily: D.fontMono }}>
                    {result.duration_seconds.toFixed(1)}s
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Tab bar ──────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 2, borderBottom: `2px solid ${D.borderFaint}`,
            marginBottom: 20, overflowX: 'auto' }}>
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                  fontSize: 12, fontWeight: tab === key ? 700 : 500, whiteSpace: 'nowrap',
                  color: tab === key ? D.brand : D.textMuted, background: 'none', border: 'none',
                  borderBottom: tab === key ? `2px solid ${D.brand}` : '2px solid transparent',
                  marginBottom: -2, cursor: 'pointer', transition: 'all 0.15s' }}>
                <Icon style={{ width: 13, height: 13 }} />{label}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: Overview                                                      */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {wi && (
                <SectionCard title="Workspace Info" icon={Server}>
                  <KV rows={[
                    ['Workspace ID',     wi.workspace_id],
                    ['Workspace Name',   wi.workspace_name],
                    ['Deployment Name',  wi.deployment_name],
                    ['Cloud',            wi.cloud?.toUpperCase()],
                    ['Region',           wi.region],
                    ['Metastore ID',     wi.metastore_id],
                  ]} />
                </SectionCard>
              )}
              {cs && (
                <SectionCard title="Cluster Summary" icon={Cpu}>
                  <KV rows={[
                    ['Total Clusters',           cs.total_clusters],
                    ['Running',                  cs.running_clusters],
                    ['Terminated',               cs.terminated_clusters],
                    ['All-Purpose',              cs.all_purpose_clusters],
                    ['Job Clusters',             cs.job_clusters],
                    ['Without Auto-Terminate',   cs.clusters_without_autoterminate],
                    ['Photon Enabled',           cs.photon_enabled_clusters],
                    ['Legacy Runtime',           cs.legacy_runtime_clusters],
                    ['Policy Compliant',         cs.policy_compliant_clusters],
                    ['Single Node',              cs.single_node_clusters],
                  ]} />
                </SectionCard>
              )}
              {ws && (
                <SectionCard title="SQL Warehouse Summary" icon={Database}>
                  <KV rows={[
                    ['Total Warehouses',          ws.total_warehouses],
                    ['Running',                   ws.running_warehouses],
                    ['Stopped',                   ws.stopped_warehouses],
                    ['Serverless',                ws.serverless_warehouses],
                    ['Classic',                   ws.classic_warehouses],
                    ['Without Auto-Stop',         ws.warehouses_without_auto_stop],
                  ]} />
                </SectionCard>
              )}
              {js && (
                <SectionCard title="Job Summary" icon={Activity}>
                  <KV rows={[
                    ['Total Jobs',                   js.total_jobs],
                    ['Continuous Jobs',              js.continuous_jobs],
                    ['Scheduled Jobs',               js.scheduled_jobs],
                    ['Multi-Task Jobs',              js.multi_task_jobs],
                    ['Failures Last 7d',             js.jobs_with_failures_last_7d],
                    ['Using All-Purpose Compute',    js.jobs_using_all_purpose_compute],
                    ['DLT Pipelines',                js.dlt_pipelines],
                  ]} />
                </SectionCard>
              )}
              {sec && (
                <SectionCard title="Security Snapshot" icon={Shield}>
                  <KV rows={[
                    ['Total Users',             sec.total_users],
                    ['Active Users',            sec.active_users],
                    ['Admin Users',             sec.admin_users],
                    ['Workspace Admins',        sec.workspace_admins],
                    ['Service Principals',      sec.service_principal_count],
                    ['Groups',                  sec.group_count],
                    ['IP Access Lists',         sec.ip_access_list_count],
                    ['Secret Scopes',           sec.secrets_scope_count],
                    ['PAT Tokens',              sec.pat_count],
                    ['Token Lifetime Config',   sec.token_lifetime_configured ? 'Yes ✓' : 'No'],
                    ['Unity Catalog Enabled',   sec.unity_catalog_enabled ? 'Yes ✓' : 'No'],
                    ['Audit Log Configured',    sec.audit_log_configured ? 'Yes ✓' : 'No'],
                  ]} />
                </SectionCard>
              )}
              {int && (
                <SectionCard title="Integration Summary" icon={Cloud}>
                  <KV rows={[
                    ['External Locations',      int.external_location_count],
                    ['Storage Credentials',     int.storage_credential_count],
                    ['Git Credentials',         int.git_credential_count],
                    ['Secret Scopes',           int.secret_scope_count],
                    ['Network Policies',        int.network_policy_count],
                    ['DBFS Mounts (legacy)',    int.dbfs_mount_count],
                    ['Delta Sharing',           int.delta_sharing_enabled ? 'Enabled ✓' : 'Disabled'],
                    ['Lakehouse Monitors',      int.lakehouse_monitor_count],
                  ]} />
                </SectionCard>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: Clusters                                                      */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'clusters' && result.clusters && (
            <SectionCard title="All Clusters" icon={Cpu} count={result.clusters.length}>
              <DataTable
                cols={['Cluster', 'Source', 'State', 'Runtime', 'Node Type', 'Workers', 'Auto-Terminate (min)', 'Policy', 'Creator']}
                rows={result.clusters.map((c: DatabricksCluster) => [
                  c.cluster_name || c.cluster_id,
                  c.cluster_source,
                  c.state,
                  c.spark_version ? truncate(c.spark_version, 30) : '—',
                  c.node_type_id,
                  c.num_workers != null ? c.num_workers : c.autoscale_min != null ? `${c.autoscale_min}–${c.autoscale_max}` : '—',
                  c.autotermination_minutes ?? '∞',
                  c.policy_id ? truncate(c.policy_id, 20) : '(none)',
                  c.creator_user_name,
                ])}
              />
            </SectionCard>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: SQL Warehouses                                                */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'warehouses' && result.warehouses && (
            <SectionCard title="SQL Warehouses" icon={Database} count={result.warehouses.length}>
              <DataTable
                cols={['Name', 'Type', 'Cluster Size', 'Min Clusters', 'Max Clusters', 'Auto-Stop (min)', 'State', 'Photon', 'Channel', 'Active Sessions', 'Creator']}
                rows={result.warehouses.map((w: DatabricksWarehouse) => [
                  w.name || w.id,
                  w.warehouse_type,
                  w.cluster_size,
                  w.min_num_clusters,
                  w.max_num_clusters,
                  w.auto_stop_mins ?? '∞',
                  w.state,
                  w.enable_photon ? 'Yes' : 'No',
                  w.channel_name,
                  w.num_active_sessions,
                  w.creator_name,
                ])}
              />
            </SectionCard>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: Unity Catalog                                                 */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'catalog' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {uc && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  <StatCard icon={Layers}     label="Catalogs"            value={fmtN(uc.catalog_count)} />
                  <StatCard icon={Database}   label="Schemas"             value={fmtN(uc.schema_count)} />
                  <StatCard icon={Package}    label="Tables"              value={fmtN(uc.table_count)} />
                  <StatCard icon={HardDrive}  label="Ext Locations"       value={fmtN(uc.external_location_count)} />
                  <StatCard icon={Lock}       label="Storage Creds"       value={fmtN(uc.storage_credential_count)} />
                  <StatCard icon={HardDrive}  label="Volumes"             value={fmtN(uc.volume_count)} />
                  <StatCard icon={GitBranch}  label="Delta Sharing"       value={uc.delta_sharing_enabled ? 'Enabled' : 'Disabled'} accent={uc.delta_sharing_enabled ? D.green : D.textMuted} />
                  <StatCard icon={Users}      label="Sharing Recipients"  value={fmtN(uc.data_sharing_recipient_count)} />
                </div>
              )}
              {!uc && (
                <div style={{ padding: '32px', textAlign: 'center', color: D.textMuted, fontSize: 13 }}>
                  <AlertTriangle style={{ width: 32, height: 32, margin: '0 auto 12px', color: D.amber }} />
                  Unity Catalog metastore not detected for this workspace.
                </div>
              )}
              {result.catalogs && result.catalogs.length > 0 && (
                <SectionCard title="Catalogs" icon={Layers} count={result.catalogs.length}>
                  <DataTable
                    cols={['Name', 'Type', 'Owner', 'Schemas', 'Tables', 'Storage Location', 'Created']}
                    rows={result.catalogs.map((c: DatabricksCatalog) => [
                      c.name, c.catalog_type, c.owner,
                      c.schema_count, c.table_count,
                      c.storage_location ? truncate(c.storage_location, 50) : '—',
                      c.created_at ? fmtDate(c.created_at) : '—',
                    ])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: Jobs                                                          */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'jobs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {js && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  <StatCard icon={Activity}   label="Total Jobs"             value={fmtN(js.total_jobs)} />
                  <StatCard icon={Activity}   label="Continuous Jobs"        value={fmtN(js.continuous_jobs)} />
                  <StatCard icon={AlertTriangle} label="Failures Last 7d"   value={fmtN(js.jobs_with_failures_last_7d)} accent={js.jobs_with_failures_last_7d > 0 ? D.amber : D.green} />
                  <StatCard icon={Layers}     label="DLT Pipelines"          value={fmtN(js.dlt_pipelines)} />
                </div>
              )}
              {result.jobs && result.jobs.length > 0 && (
                <SectionCard title="Jobs" icon={Activity} count={result.jobs.length}>
                  <DataTable
                    cols={['Job ID', 'Name', 'Schedule', 'Tasks', 'Job Clusters', 'Uses All-Purpose', 'Last Run Status', 'Creator', 'Created']}
                    rows={result.jobs.map((j: DatabricksJob) => [
                      j.job_id, j.name || '—',
                      j.schedule || 'Manual',
                      j.task_count, j.job_cluster_count,
                      j.uses_all_purpose_compute ? 'Yes ⚠' : 'No',
                      j.last_run_status || '—',
                      j.creator_user_name,
                      j.created_time ? fmtDate(j.created_time) : '—',
                    ])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: Users & Security                                              */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {sec && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <SectionCard title="Identity Summary" icon={Users}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 14 }}>
                      {[
                        { label: 'Total Users',        value: sec.total_users,            warn: false },
                        { label: 'Active Users',        value: sec.active_users,           warn: false },
                        { label: 'Admin Users',         value: sec.admin_users,            warn: (sec.admin_users ?? 0) > 5 },
                        { label: 'Workspace Admins',    value: sec.workspace_admins,       warn: (sec.workspace_admins ?? 0) > 5 },
                        { label: 'Service Principals',  value: sec.service_principal_count, warn: false },
                        { label: 'Groups',              value: sec.group_count,            warn: false },
                      ].map(({ label, value, warn }) => (
                        <div key={label} style={{ padding: '10px 12px', borderRadius: 9,
                          border: `1px solid ${D.borderFaint}`, background: warn ? D.amberDim : D.brandFaint }}>
                          <p style={{ fontSize: 9, color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</p>
                          <p style={{ fontSize: 18, fontWeight: 800, color: warn ? D.amber : D.brand }}>{fmtN(value)}</p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                  <SectionCard title="Security Controls" icon={Shield}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 14 }}>
                      {[
                        { label: 'IP Access Lists',        value: sec.ip_access_list_count,     good: (sec.ip_access_list_count ?? 0) > 0 },
                        { label: 'Secret Scopes',          value: sec.secrets_scope_count,       good: true },
                        { label: 'PAT Tokens',             value: sec.pat_count,                 good: true },
                        { label: 'Token Lifetime Config',  value: sec.token_lifetime_configured ? 'Yes' : 'No', good: sec.token_lifetime_configured },
                        { label: 'Unity Catalog',          value: sec.unity_catalog_enabled ? 'Enabled' : 'Disabled', good: sec.unity_catalog_enabled },
                        { label: 'Audit Log',              value: sec.audit_log_configured ? 'Configured' : 'Not configured', good: sec.audit_log_configured },
                      ].map(({ label, value, good }) => (
                        <div key={label} style={{ padding: '10px 12px', borderRadius: 9,
                          border: `1px solid ${D.borderFaint}`, background: good ? D.greenDim : D.amberDim }}>
                          <p style={{ fontSize: 9, color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</p>
                          <p style={{ fontSize: 14, fontWeight: 800, color: good ? D.green : D.amber }}>
                            {typeof value === 'number' ? fmtN(value) : value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              )}
              {result.users && result.users.length > 0 && (
                <SectionCard title="Users" icon={Users} count={result.users.length}>
                  <DataTable
                    cols={['Username', 'Display Name', 'Active', 'Admin']}
                    rows={result.users.map((u: DatabricksUser) => [
                      u.user_name, u.display_name,
                      u.active ? 'Yes' : 'No',
                      u.is_admin ? 'Yes ⚠' : 'No',
                    ])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: Integrations                                                  */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'integrations' && int && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {[
                { label: 'External Locations',    value: int.external_location_count,    icon: HardDrive, note: 'Unity Catalog managed' },
                { label: 'Storage Credentials',   value: int.storage_credential_count,   icon: Lock,      note: '' },
                { label: 'Git Credentials',        value: int.git_credential_count,       icon: GitBranch, note: '' },
                { label: 'Secret Scopes',          value: int.secret_scope_count,         icon: Lock,      note: '' },
                { label: 'Network Policies',       value: int.network_policy_count,       icon: Shield,    note: '' },
                { label: 'DBFS Mounts (legacy)',   value: int.dbfs_mount_count,           icon: HardDrive, note: 'Migrate to UC ext. locations' },
                { label: 'Delta Sharing',          value: int.delta_sharing_enabled ? 'Enabled' : 'Disabled', icon: GitBranch, note: '' },
                { label: 'Lakehouse Monitors',     value: int.lakehouse_monitor_count,    icon: Activity,  note: '' },
              ].map(({ label, value, icon: Icon, note }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                  borderRadius: 12, background: D.surface, border: `1px solid ${D.border}`, boxShadow: D.shadow }}>
                  <Icon style={{ width: 20, height: 20, color: D.brand, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: D.textMuted, marginBottom: 2 }}>{label}</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: D.textPrimary }}>
                      {typeof value === 'number' ? fmtN(value) : value}
                    </p>
                    {note && <p style={{ fontSize: 9, color: D.textMuted, marginTop: 2 }}>{note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: MLflow & Serving                                              */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'mlflow' && ml && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {[
                { label: 'MLflow Experiments',     value: ml.experiment_count,             icon: FlaskConical, note: '' },
                { label: 'Registered Models',       value: ml.registered_model_count,       icon: Package,      note: '' },
                { label: 'Serving Endpoints',       value: ml.model_serving_endpoint_count, icon: Zap,          note: `${fmtN(ml.running_endpoints)} running` },
                { label: 'Running Endpoints',       value: ml.running_endpoints,            icon: Activity,     note: '' },
                { label: 'Vector Search Indexes',   value: ml.vector_search_index_count,    icon: Database,     note: '' },
                { label: 'DLT Pipelines',           value: ml.dlt_pipeline_count,           icon: Layers,       note: '' },
              ].map(({ label, value, icon: Icon, note }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px',
                  borderRadius: 12, background: D.surface, border: `1px solid ${D.border}`, boxShadow: D.shadow }}>
                  <Icon style={{ width: 22, height: 22, color: D.brand, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: D.textMuted, marginBottom: 2 }}>{label}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: D.textPrimary }}>{fmtN(value)}</p>
                    {note && <p style={{ fontSize: 10, color: D.textMuted, marginTop: 2 }}>{note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB: Checks                                                        */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {tab === 'checks' && result.checks && (
            <SectionCard title="Assessment Checks" icon={AlertTriangle} count={result.checks.length}>
              <DataTable
                cols={['Domain', 'Check', 'Status', 'Risk', 'Count', 'Details', 'Recommendation']}
                rows={result.checks.map((c: DatabricksCheckResult) => [
                  c.domain, c.check,
                  c.status.toUpperCase(),
                  c.risk,
                  c.count != null ? fmtN(c.count) : '—',
                  c.details   ? truncate(c.details, 80)         : '—',
                  c.recommendation ? truncate(c.recommendation, 80) : '—',
                ])}
              />
            </SectionCard>
          )}

          {/* Footer timestamps */}
          <div style={{ fontSize: 11, color: D.textMuted, display: 'flex', gap: 20, paddingTop: 8, marginTop: 8 }}>
            {status?.created_at  && <span>Started: {fmtDate(status.created_at)}</span>}
            {status?.completed_at && <span>Completed: {fmtDate(status.completed_at)}</span>}
            {result.assessment_timestamp && <span>Assessed: {fmtDate(result.assessment_timestamp)}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
