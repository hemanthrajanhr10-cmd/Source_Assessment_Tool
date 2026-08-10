import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Loader2, ArrowLeft, FileSpreadsheet,
  Database, Shield, Server, BarChart3, Layers, Activity,
  Lock, HardDrive, AlertTriangle, Settings, Cpu, Link2,
  Network, Zap, Users, TrendingUp, Package,
  Eye, GitBranch, Radio, BookOpen, List,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { IbmDb2Logo } from '../components/ui/SourceLogos'
import type {
  Db2JobStatusResponse, Db2AssessmentResult,
  Db2Table, Db2Index, Db2Tablespace, Db2Bufferpool,
  Db2StoredProcedure, Db2Function, Db2Trigger, Db2ActiveConnection, Db2TopSql,
} from '../types/api'

// ── Design tokens (teal theme) ────────────────────────────────────────────────
const D = {
  bg:          '#F0FAF9',
  surface:     '#FFFFFF',
  surface2:    '#F0FAF9',
  border:      '#A8E2DD',
  borderFaint: '#CCEFEC',
  teal:        '#4DA8A0',
  tealMid:     '#6CBDB5',
  tealLight:   '#93CCC6',
  tealGlow:    'rgba(77,168,160,0.12)',
  tealFaint:   'rgba(77,168,160,0.06)',
  dark:        '#25706A',
  textPrimary: '#0D1117',
  textSecond:  '#404555',
  textMuted:   '#767A8C',
  green:       '#059669',
  greenDim:    'rgba(5,150,105,0.10)',
  amber:       '#D97706',
  amberDim:    'rgba(217,119,6,0.10)',
  red:         '#DC2626',
  redDim:      'rgba(220,38,38,0.08)',
  shadow:      '0 1px 3px rgba(77,168,160,0.04), 0 4px 16px rgba(77,168,160,0.06)',
  shadowHover: '0 4px 20px rgba(77,168,160,0.14)',
  fontMono:    '"JetBrains Mono", "Fira Code", monospace',
}

type TabKey = 'overview' | 'objects' | 'indexes' | 'routines' | 'storage' | 'security' | 'performance' | 'features' | 'config'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtN = (n?: number | null) => n == null ? '—' : n.toLocaleString()
const fmtPct = (n?: number | null) => n == null ? '—' : `${n.toFixed(1)}%`
const fmtTime = (µs?: number | null) => {
  if (µs == null) return '—'
  if (µs < 1000) return `${µs} µs`
  if (µs < 1_000_000) return `${(µs / 1000).toFixed(1)} ms`
  return `${(µs / 1_000_000).toFixed(2)} s`
}
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

// ── Micro components ──────────────────────────────────────────────────────────

function Badge({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
      color, background: bg, border: `1px solid ${border}` }}>{label}</span>
  )
}

function StatCard({ icon: Icon, label, value, sub, accent = D.teal }: {
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
    good: { color: D.green,  bg: D.greenDim, border: `${D.green}33`,  icon: CheckCircle2, text: 'OK' },
    warn: { color: D.amber,  bg: D.amberDim, border: `${D.amber}33`,  icon: AlertTriangle, text: 'WARN' },
    crit: { color: D.red,    bg: D.redDim,   border: `${D.red}33`,    icon: XCircle,      text: 'CRITICAL' },
    info: { color: D.teal,   bg: D.tealGlow, border: `${D.teal}33`,   icon: CheckCircle2, text: 'INFO' },
  }[status]
  const StatusIcon = cfg.icon
  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <StatusIcon style={{ width: 12, height: 12, color: cfg.color }} />
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
          background: `linear-gradient(135deg, ${D.teal}, ${D.tealMid})` }}>
          <Icon style={{ width: 12, height: 12, color: '#fff' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: D.textPrimary, flex: 1 }}>{title}</span>
        {count !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 700, color: D.teal,
            background: D.tealGlow, border: `1px solid ${D.teal}33`,
            padding: '1px 8px', borderRadius: 6 }}>{count.toLocaleString()}</span>
        )}
      </div>
      <div style={{ padding: '0' }}>{children}</div>
    </div>
  )
}

function Table({ cols, rows }: {
  cols: string[]
  rows: (string | number | null | undefined)[][]
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

function KV({ rows }: { rows: [string, string | number | undefined | null][] }) {
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

export default function Db2SessionDetailPage() {
  const { jobId }   = useParams<{ jobId: string }>()
  const navigate    = useNavigate()
  const [status, setStatus]   = useState<Db2JobStatusResponse | null>(null)
  const [result, setResult]   = useState<Db2AssessmentResult  | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [tab, setTab]         = useState<TabKey>('overview')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!jobId) return
    try {
      const res = await api.db2JobStatus(jobId)
      setStatus(res.data)
      if (res.data.status === 'completed') {
        clearInterval(pollRef.current!)
        const r = await api.db2JobResults(jobId)
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
  const inv  = result?.object_inventory
  const sec  = result?.security_summary
  const perf = result?.performance
  const feat = result?.db2_features
  const ii   = result?.instance_info
  const di   = result?.database_info

  // ── Health scorecard ────────────────────────────────────────────────────────
  const healthTiles = result ? [
    { label: 'Bufferpool Hit Ratio',
      status: (perf?.bp_hit_ratio ?? 100) >= 90 ? 'good' : (perf?.bp_hit_ratio ?? 100) >= 80 ? 'warn' : 'crit',
      detail: perf?.bp_hit_ratio != null ? `${perf.bp_hit_ratio.toFixed(1)}%` : 'No data' },
    { label: 'Deadlocks',
      status: (perf?.deadlocks ?? 0) === 0 ? 'good' : 'crit',
      detail: `${fmtN(perf?.deadlocks)} deadlocks detected` },
    { label: 'Security (DBADM)',
      status: (sec?.users_with_dbadm ?? 0) <= 3 ? 'good' : 'warn',
      detail: `${fmtN(sec?.users_with_dbadm)} DBADM users` },
    { label: 'Audit Policies',
      status: (sec?.audit_policies_count ?? 0) > 0 ? 'good' : 'warn',
      detail: (sec?.audit_policies_count ?? 0) > 0 ? `${fmtN(sec?.audit_policies_count)} policies active` : 'No audit policies' },
    { label: 'Tablespace Utilization',
      status: (result?.tablespaces ?? []).some(t => (t.utilization_pct ?? 0) > 90) ? 'crit'
             : (result?.tablespaces ?? []).some(t => (t.utilization_pct ?? 0) > 75) ? 'warn' : 'good',
      detail: `${result?.tablespaces?.length ?? 0} tablespaces checked` },
    { label: 'Log Utilization',
      status: (perf?.log_utilization_pct ?? 0) > 80 ? 'crit' : (perf?.log_utilization_pct ?? 0) > 60 ? 'warn' : 'good',
      detail: perf?.log_utilization_pct != null ? `${perf.log_utilization_pct.toFixed(1)}% log used` : 'No data' },
  ] as { label: string; status: 'good'|'warn'|'crit'|'info'; detail: string }[] : []

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'overview',     label: 'Overview',     icon: BarChart3  },
    { key: 'objects',      label: 'Schema Objects',icon: Database   },
    { key: 'indexes',      label: 'Indexes',       icon: List       },
    { key: 'routines',     label: 'Routines',      icon: Settings   },
    { key: 'storage',      label: 'Storage',       icon: HardDrive  },
    { key: 'security',     label: 'Security',      icon: Shield     },
    { key: 'performance',  label: 'Performance',   icon: Activity   },
    { key: 'features',     label: 'Db2 Features',  icon: Zap        },
    { key: 'config',       label: 'Configuration', icon: BookOpen   },
  ]

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #F0FAF9 0%, #CCEFEC 100%)',
        borderBottom: `1px solid ${D.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 32px' }}>
          <button onClick={() => navigate('/db2/sessions')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
              fontSize: 12, color: D.teal, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <ArrowLeft style={{ width: 14, height: 14 }} /> Back to assessments
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${D.teal}, ${D.tealMid})`, boxShadow: '0 4px 16px rgba(77,168,160,0.30)' }}>
                <IbmDb2Logo size={30} />
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: D.textPrimary, margin: 0 }}>
                  {status?.label || 'IBM Db2 Assessment'}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                  {result?.hostname && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: D.textMuted }}>
                      <Server style={{ width: 11, height: 11 }} />{result.hostname}
                    </span>
                  )}
                  {result?.database && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: D.textMuted }}>
                      <Database style={{ width: 11, height: 11 }} />{result.database}
                    </span>
                  )}
                  {result?.via_hcm && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
                      color: D.green, background: D.greenDim, border: `1px solid ${D.green}33`,
                      padding: '2px 8px', borderRadius: 8 }}>
                      <Network style={{ width: 10, height: 10 }} /> via HCM
                    </span>
                  )}
                  {ii?.db2_version && (
                    <span style={{ fontSize: 11, color: D.textMuted, fontFamily: D.fontMono }}>
                      {ii.db2_version}
                    </span>
                  )}
                  <span style={{ fontSize: 10, fontFamily: D.fontMono, color: D.textMuted }}>{jobId?.slice(0,8)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {result && (
                <button onClick={() => api.db2DownloadExcel(jobId!, status?.label || undefined)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                    borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: `linear-gradient(135deg, ${D.teal}, ${D.tealMid})`,
                    color: '#fff', border: 'none', boxShadow: '0 2px 10px rgba(77,168,160,0.30)' }}>
                  <FileSpreadsheet style={{ width: 14, height: 14 }} /> Export Excel (15 sheets)
                </button>
              )}
              {jobStatus === 'completed' && <Badge label="Completed" color={D.green} bg={D.greenDim} border={`${D.green}33`} />}
              {jobStatus === 'failed'    && <Badge label="Failed"    color={D.red}   bg={D.redDim}   border={`${D.red}33`} />}
              {(jobStatus === 'running' || jobStatus === 'pending') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 10,
                  background: D.tealGlow, border: `1px solid ${D.teal}33`, color: D.teal, fontSize: 12, fontWeight: 700 }}>
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
                <span style={{ fontSize: 11, color: D.teal, fontWeight: 700 }}>{progress}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 5, background: D.borderFaint, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 5, width: '100%',
                  transformOrigin: 'left', transition: 'transform 0.5s ease',
                  transform: `scaleX(${progress / 100})`,
                  background: `linear-gradient(90deg, ${D.teal}, ${D.tealMid})` }} />
              </div>
            </div>
          )}

          {loadErr && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, fontSize: 12,
              background: D.redDim, border: `1px solid ${D.red}33`, color: D.red }}>
              {loadErr}
            </div>
          )}
          {jobStatus === 'failed' && status?.error && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, fontSize: 12,
              background: D.redDim, border: `1px solid ${D.red}33`, color: D.red }}>
              {status.error}
            </div>
          )}
        </div>
      </div>

      {/* Waiting spinner */}
      {!result && !loadErr && (jobStatus === 'pending' || jobStatus === 'running') && (
        <div style={{ maxWidth: 1200, margin: '60px auto', padding: '0 32px', textAlign: 'center' }}>
          <Loader2 style={{ width: 40, height: 40, color: D.teal, animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ color: D.textMuted, fontSize: 13 }}>{status?.progress_message || 'Assessment running…'}</p>
        </div>
      )}

      {result && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px 40px' }}>

          {/* ── Health Scorecard ────────────────────────────────────────── */}
          <div style={{ paddingTop: 24, marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: D.textMuted, marginBottom: 10 }}>Health Scorecard</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              {healthTiles.map(t => <HealthTile key={t.label} {...t} />)}
            </div>
          </div>

          {/* ── Top stat cards ──────────────────────────────────────────── */}
          {inv && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
              <StatCard icon={Database}  label="Schemas"    value={fmtN(inv.schema_count)} />
              <StatCard icon={Layers}    label="Tables"     value={fmtN(inv.table_count)} />
              <StatCard icon={Eye}       label="Views"      value={fmtN(inv.view_count)} />
              <StatCard icon={List}      label="Indexes"    value={fmtN(inv.index_count)} />
              <StatCard icon={Settings}  label="Procedures" value={fmtN(inv.procedure_count)} />
              <StatCard icon={Cpu}       label="Functions"  value={fmtN(inv.function_count)} />
              <StatCard icon={GitBranch} label="Triggers"   value={fmtN(inv.trigger_count)} />
              <StatCard icon={Radio}     label="Sequences"  value={fmtN(inv.sequence_count)} />
              <StatCard icon={HardDrive} label="Tablespaces"value={fmtN(inv.tablespace_count)} />
              <StatCard icon={Server}    label="Bufferpools"value={fmtN(inv.bufferpool_count)} />
            </div>
          )}

          {/* ── Tab bar ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 2, borderBottom: `2px solid ${D.borderFaint}`,
            marginBottom: 20, overflowX: 'auto' }}>
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                  fontSize: 12, fontWeight: tab === key ? 700 : 500, whiteSpace: 'nowrap',
                  color: tab === key ? D.teal : D.textMuted, background: 'none', border: 'none',
                  borderBottom: tab === key ? `2px solid ${D.teal}` : '2px solid transparent',
                  marginBottom: -2, cursor: 'pointer', transition: 'all 0.15s' }}>
                <Icon style={{ width: 13, height: 13 }} />{label}
              </button>
            ))}
          </div>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TAB: Overview                                               */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {ii && (
                <SectionCard title="Instance Information" icon={Server}>
                  <KV rows={[
                    ['Db2 Version',    ii.db2_version],
                    ['Instance Name',  ii.instance_name],
                    ['Server Host',    ii.host_name],
                    ['Platform',       ii.platform],
                    ['Fix Pack',       ii.fix_pack_num],
                    ['Bit Width',      ii.bit_width],
                    ['Partitions',     ii.num_db_partitions],
                    ['DPF Active',     ii.is_dpf ? 'Yes' : 'No'],
                  ]} />
                </SectionCard>
              )}
              {di && (
                <SectionCard title="Database Metadata" icon={Database}>
                  <KV rows={[
                    ['Database',         di.db_name],
                    ['Territory',        di.territory],
                    ['Codeset',          di.codeset],
                    ['BLU Acceleration', di.blu_enabled ? 'Enabled ✓' : 'Disabled'],
                  ]} />
                </SectionCard>
              )}
              {result.via_hcm && (
                <SectionCard title="Azure Hybrid Connection Manager" icon={Network}>
                  <KV rows={[
                    ['Relay Namespace',    result.hcm_relay_namespace],
                    ['Connection Name',    result.hcm_connection_name],
                    ['Connection Mode',    'Via HCM Relay'],
                  ]} />
                </SectionCard>
              )}
              {result.schemas && result.schemas.length > 0 && (
                <SectionCard title={`Schemas (${result.schemas.length})`} icon={Database}>
                  <Table
                    cols={['Schema', 'Owner', 'Tables', 'Views', 'Procedures', 'Created']}
                    rows={result.schemas.slice(0, 20).map(s => [s.schema_name, s.owner, s.table_count, s.view_count, s.proc_count, s.create_time ? fmtDate(s.create_time) : ''])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TAB: Schema Objects (Tables + Views)                        */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {tab === 'objects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {result.tables && result.tables.length > 0 && (
                <SectionCard title="Tables" icon={Database} count={result.tables.length}>
                  <Table
                    cols={['Schema', 'Table', 'Organization', 'Row Count', 'Data Pages', 'Overflow', 'Tablespace', 'Created']}
                    rows={result.tables.slice(0, 200).map((t: Db2Table) => [
                      `${t.schema_name}.${t.table_name}`,
                      t.is_column_org ? 'BLU (Column)' : 'Row',
                      fmtN(t.row_count), fmtN(t.data_pages), fmtN(t.overflow_pages),
                      t.tablespace_name, t.create_time ? fmtDate(t.create_time) : '',
                    ])}
                  />
                  {result.tables.length > 200 && (
                    <p style={{ fontSize: 11, color: D.textMuted, padding: '8px 14px' }}>
                      Showing 200 of {result.tables.length.toLocaleString()} tables. Download Excel for full list.
                    </p>
                  )}
                </SectionCard>
              )}
              {result.views && result.views.length > 0 && (
                <SectionCard title="Views" icon={Eye} count={result.views.length}>
                  <Table
                    cols={['Schema', 'View Name', 'Read Only', 'Created']}
                    rows={result.views.slice(0, 100).map(v => [
                      v.schema_name, v.view_name, v.readonly, v.create_time ? fmtDate(v.create_time) : '',
                    ])}
                  />
                </SectionCard>
              )}
              {result.sequences && result.sequences.length > 0 && (
                <SectionCard title="Sequences" icon={Radio} count={result.sequences.length}>
                  <Table
                    cols={['Schema', 'Sequence', 'Data Type', 'Start', 'Increment', 'Cycle']}
                    rows={result.sequences.map(s => [s.schema_name, s.seq_name, s.data_type, s.start, s.increment, s.cycle])}
                  />
                </SectionCard>
              )}
              {result.user_defined_types && result.user_defined_types.length > 0 && (
                <SectionCard title="User-Defined Types" icon={Package} count={result.user_defined_types.length}>
                  <Table
                    cols={['Schema', 'Type Name', 'Meta Type', 'Source Type', 'Created']}
                    rows={result.user_defined_types.map(u => [u.schema_name, u.type_name, u.metatype, u.source_name, u.create_time ? fmtDate(u.create_time) : ''])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TAB: Indexes                                                */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {tab === 'indexes' && result.indexes && (
            <SectionCard title="Indexes" icon={List} count={result.indexes.length}>
              <Table
                cols={['Schema', 'Table', 'Index', 'Unique Rule', 'Type', 'Clustered', 'Levels', 'Cluster Ratio %', 'Density %', 'Key Cols', 'Columns']}
                rows={result.indexes.slice(0, 300).map((ix: Db2Index) => [
                  ix.schema_name, ix.table_name, ix.index_name,
                  ix.uniquerule, ix.index_type, ix.clustered,
                  ix.nlevels,
                  ix.clusterratio != null ? ix.clusterratio.toFixed(1) : '—',
                  ix.density      != null ? ix.density.toFixed(1)      : '—',
                  ix.num_key_cols,
                  ix.index_columns ? truncate(ix.index_columns, 60) : '—',
                ])}
              />
              {result.indexes.length > 300 && (
                <p style={{ fontSize: 11, color: D.textMuted, padding: '8px 14px' }}>
                  Showing 300 of {result.indexes.length.toLocaleString()} indexes.
                </p>
              )}
            </SectionCard>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TAB: Routines                                               */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {tab === 'routines' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {result.procedures && result.procedures.length > 0 && (
                <SectionCard title="Stored Procedures" icon={Settings} count={result.procedures.length}>
                  <Table
                    cols={['Schema', 'Procedure', 'Language', 'Parameters', 'Created', 'Altered']}
                    rows={result.procedures.slice(0, 100).map((p: Db2StoredProcedure) => [
                      p.schema_name, p.proc_name, p.language, p.parm_count,
                      p.create_time ? fmtDate(p.create_time) : '',
                      p.alter_time  ? fmtDate(p.alter_time)  : '',
                    ])}
                  />
                </SectionCard>
              )}
              {result.functions && result.functions.length > 0 && (
                <SectionCard title="User-Defined Functions" icon={Cpu} count={result.functions.length}>
                  <Table
                    cols={['Schema', 'Function', 'Type', 'Language', 'Created']}
                    rows={result.functions.slice(0, 100).map((f: Db2Function) => [
                      f.schema_name, f.func_name, f.func_type, f.language,
                      f.create_time ? fmtDate(f.create_time) : '',
                    ])}
                  />
                </SectionCard>
              )}
              {result.triggers && result.triggers.length > 0 && (
                <SectionCard title="Triggers" icon={GitBranch} count={result.triggers.length}>
                  <Table
                    cols={['Schema', 'Trigger', 'Target Table', 'Event', 'Time', 'Enabled']}
                    rows={result.triggers.slice(0, 100).map((t: Db2Trigger) => [
                      t.schema_name, t.trigger_name,
                      t.table_name ? `${t.table_schema}.${t.table_name}` : '—',
                      t.trigger_type, t.trigger_time, t.enabled,
                    ])}
                  />
                </SectionCard>
              )}
              {result.event_monitors && result.event_monitors.length > 0 && (
                <SectionCard title="Event Monitors" icon={Activity} count={result.event_monitors.length}>
                  <Table
                    cols={['Event Monitor', 'Target Type', 'Enabled', 'Group']}
                    rows={result.event_monitors.map(e => [e.evmonname, e.target_type, e.enabled, e.event_mon_group])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TAB: Storage                                                */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {tab === 'storage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {result.tablespaces && result.tablespaces.length > 0 && (
                <SectionCard title="Tablespaces" icon={HardDrive} count={result.tablespaces.length}>
                  <Table
                    cols={['Tablespace', 'Type', 'Page Size', 'Total Pages', 'Used Pages', 'Free Pages', 'Utilization %', 'Bufferpool']}
                    rows={result.tablespaces.map((ts: Db2Tablespace) => [
                      ts.tbspace, ts.tbspace_type,
                      ts.page_size != null ? ts.page_size.toLocaleString() + ' B' : '—',
                      fmtN(ts.total_pages), fmtN(ts.used_pages), fmtN(ts.free_pages),
                      fmtPct(ts.utilization_pct), ts.bufferpool_name,
                    ])}
                  />
                </SectionCard>
              )}
              {result.bufferpools && result.bufferpools.length > 0 && (
                <SectionCard title="Bufferpools" icon={Cpu} count={result.bufferpools.length}>
                  <Table
                    cols={['Bufferpool', 'Pages', 'Automatic', 'Page Size', 'Logical Reads', 'Physical Reads', 'Hit Ratio %']}
                    rows={result.bufferpools.map((bp: Db2Bufferpool) => [
                      bp.bpname, fmtN(bp.npages), bp.automatic,
                      bp.pagesize != null ? bp.pagesize.toLocaleString() + ' B' : '—',
                      fmtN(bp.logical_reads), fmtN(bp.physical_reads),
                      bp.hit_ratio != null ? bp.hit_ratio.toFixed(1) + '%' : '—',
                    ])}
                  />
                </SectionCard>
              )}
              {result.storage_groups && result.storage_groups.length > 0 && (
                <SectionCard title="Storage Groups" icon={Layers} count={result.storage_groups.length}>
                  <Table
                    cols={['Storage Group', 'Owner', 'Created']}
                    rows={result.storage_groups.map(sg => [sg.sgname, sg.owner, sg.create_time ? fmtDate(sg.create_time) : ''])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TAB: Security                                               */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {tab === 'security' && sec && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <SectionCard title="Database Authorities" icon={Shield}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 14 }}>
                  {[
                    { label: 'Users with DBADM',      value: sec.users_with_dbadm,      warn: sec.users_with_dbadm > 3 },
                    { label: 'Users with SECADM',      value: sec.users_with_secadm,      warn: false },
                    { label: 'Users with DATAACCESS',  value: sec.users_with_dataaccess,  warn: false },
                    { label: 'Users with BINDADD',     value: sec.users_with_bindadd,     warn: false },
                    { label: 'Users with CONNECT',     value: sec.users_with_connect,     warn: false },
                    { label: 'Total Users',            value: sec.total_users,            warn: false },
                  ].map(({ label, value, warn }) => (
                    <div key={label} style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${D.borderFaint}`,
                      background: warn ? D.amberDim : D.tealFaint }}>
                      <p style={{ fontSize: 9, color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: warn ? D.amber : D.teal }}>{fmtN(value)}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
              <SectionCard title="RCAC & Fine-Grained Access" icon={Lock}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 14 }}>
                  {[
                    { label: 'Row Permissions',      value: sec.rcac_row_permissions },
                    { label: 'Column Masks',          value: sec.rcac_col_masks },
                    { label: 'Schemas with RCAC',     value: sec.schemas_with_rcac },
                    { label: 'Trusted Contexts',      value: sec.trusted_contexts_count },
                    { label: 'Audit Policies',        value: sec.audit_policies_count },
                    { label: 'Total Roles',           value: sec.total_roles },
                    { label: 'Role Memberships',      value: sec.role_member_count },
                    { label: 'Table Grants',          value: sec.table_grants_count },
                    { label: 'Column Grants',         value: sec.column_grants_count },
                    { label: 'Schema Grants',         value: sec.schema_grants_count },
                    { label: 'Package Grants',        value: sec.package_grants_count },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${D.borderFaint}`,
                      background: (value ?? 0) > 0 ? D.greenDim : D.tealFaint }}>
                      <p style={{ fontSize: 9, color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: (value ?? 0) > 0 ? D.green : D.teal }}>{fmtN(value)}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TAB: Performance                                            */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {tab === 'performance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {perf && (
                <SectionCard title="Database Performance Snapshot" icon={Activity}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 14 }}>
                    {[
                      { label: 'DB Status',         value: perf.db_status ?? '—', accent: D.green },
                      { label: 'Total Connections', value: fmtN(perf.total_cons), accent: D.teal },
                      { label: 'App Connections',   value: fmtN(perf.appls_cur_cons), accent: D.teal },
                      { label: 'Lock Waits',        value: fmtN(perf.lock_waits), accent: (perf.lock_waits ?? 0) > 1000 ? D.red : D.teal },
                      { label: 'Lock Timeouts',     value: fmtN(perf.lock_timeouts), accent: (perf.lock_timeouts ?? 0) > 100 ? D.amber : D.teal },
                      { label: 'Lock Escalations',  value: fmtN(perf.lock_escals), accent: (perf.lock_escals ?? 0) > 0 ? D.amber : D.teal },
                      { label: 'Deadlocks',         value: fmtN(perf.deadlocks), accent: (perf.deadlocks ?? 0) > 0 ? D.red : D.green },
                      { label: 'Sort Overflows',    value: fmtN(perf.sort_overflows), accent: (perf.sort_overflows ?? 0) > 500 ? D.amber : D.teal },
                      { label: 'Rows Read',         value: fmtN(perf.rows_read), accent: D.teal },
                      { label: 'Rows Written',      value: fmtN(perf.rows_written), accent: D.teal },
                      { label: 'BP Hit Ratio',      value: fmtPct(perf.bp_hit_ratio), accent: (perf.bp_hit_ratio ?? 100) < 90 ? D.red : D.green },
                      { label: 'Log Utilization',   value: fmtPct(perf.log_utilization_pct), accent: (perf.log_utilization_pct ?? 0) > 80 ? D.red : D.teal },
                    ].map(({ label, value, accent }) => (
                      <div key={label} style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${D.borderFaint}`, background: D.surface2 }}>
                        <p style={{ fontSize: 9, color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</p>
                        <p style={{ fontSize: 16, fontWeight: 800, color: accent }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {result.active_connections && result.active_connections.length > 0 && (
                <SectionCard title="Active Connections" icon={Users} count={result.active_connections.length}>
                  <Table
                    cols={['Agent ID', 'App Name', 'Status', 'Auth ID', 'Platform', 'Workload', 'Locks Held']}
                    rows={result.active_connections.map((ac: Db2ActiveConnection) => [
                      ac.agent_id, ac.appl_name, ac.appl_status, ac.authid,
                      ac.client_platform, ac.workload_name, fmtN(ac.num_locks_held),
                    ])}
                  />
                </SectionCard>
              )}

              {result.top_sql && result.top_sql.length > 0 && (
                <SectionCard title="Top SQL by Total Execution Time" icon={TrendingUp} count={result.top_sql.length}>
                  <Table
                    cols={['Rank', 'SQL Statement', 'Executions', 'Total Time', 'Avg Time', 'Rows Read', 'Rows Returned', 'Sort Overflows']}
                    rows={result.top_sql.map((s: Db2TopSql, i: number) => [
                      i + 1, truncate(s.stmt_text, 100),
                      fmtN(s.exec_count), fmtTime(s.total_exec_time), fmtTime(s.avg_exec_time),
                      fmtN(s.rows_read), fmtN(s.rows_returned), fmtN(s.sort_overflows),
                    ])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TAB: Db2 Features                                           */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {tab === 'features' && feat && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {[
                  { area: 'BLU Acceleration',  label: 'Column-Org Tables', value: feat.column_org_tables, icon: Cpu,      accent: feat.column_org_tables > 0 ? D.teal : D.textMuted },
                  { area: 'BLU Acceleration',  label: 'Row-Org Tables',    value: feat.row_org_tables,    icon: Database, accent: D.teal },
                  { area: 'RCAC',              label: 'Row Permissions',    value: feat.rcac_row_permissions, icon: Shield, accent: feat.rcac_row_permissions > 0 ? D.green : D.textMuted },
                  { area: 'RCAC',              label: 'Column Masks',       value: feat.rcac_col_masks,    icon: Lock,     accent: feat.rcac_col_masks > 0 ? D.green : D.textMuted },
                  { area: 'Federation',        label: 'Wrappers',           value: feat.wrapper_count,     icon: Link2,    accent: feat.federation_enabled ? D.teal : D.textMuted },
                  { area: 'Federation',        label: 'Remote Servers',     value: feat.server_count,      icon: Server,   accent: D.teal },
                  { area: 'Federation',        label: 'Nicknames',          value: feat.nickname_count,    icon: Database, accent: D.teal },
                  { area: 'WLM',               label: 'Service Classes',    value: feat.wlm_service_classes, icon: Layers, accent: feat.wlm_service_classes > 0 ? D.teal : D.textMuted },
                  { area: 'WLM',               label: 'Workloads',          value: feat.wlm_workloads,     icon: Zap,      accent: D.teal },
                  { area: 'WLM',               label: 'Thresholds',         value: feat.wlm_thresholds,    icon: AlertTriangle, accent: D.teal },
                  { area: 'Objects',           label: 'MQTs',               value: feat.mqt_count,         icon: BarChart3, accent: D.teal },
                  { area: 'Objects',           label: 'Aliases',            value: feat.alias_count,       icon: Database, accent: D.teal },
                  { area: 'Objects',           label: 'Event Monitors',     value: feat.event_monitor_count, icon: Activity, accent: feat.event_monitor_count > 0 ? D.teal : D.textMuted },
                  { area: 'Objects',           label: 'Packages',           value: feat.package_count,     icon: Package,  accent: D.teal },
                  { area: 'Storage',           label: 'Storage Groups',     value: feat.storage_group_count, icon: HardDrive, accent: D.teal },
                ].map(({ area, label, value, icon: Icon, accent }) => (
                  <div key={`${area}${label}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderRadius: 10, background: D.surface, border: `1px solid ${D.border}` }}>
                    <Icon style={{ width: 18, height: 18, color: accent, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: D.textMuted, marginBottom: 2 }}>{area}</p>
                      <p style={{ fontSize: 11, color: D.textSecond, marginBottom: 2 }}>{label}</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: accent }}>{fmtN(value)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* WLM Service Classes */}
              {result.wlm_service_classes && result.wlm_service_classes.length > 0 && (
                <SectionCard title="WLM Service Classes" icon={Layers} count={result.wlm_service_classes.length}>
                  <Table
                    cols={['Service Class', 'Parent Class', 'Enabled', 'Created']}
                    rows={result.wlm_service_classes.map(sc => [sc.serviceclassname, sc.parentserviceclassname, sc.enabled, sc.create_time ? fmtDate(sc.create_time) : ''])}
                  />
                </SectionCard>
              )}

              {/* Federation */}
              {result.federation_servers && result.federation_servers.length > 0 && (
                <SectionCard title="Federation Servers" icon={Link2} count={result.federation_servers.length}>
                  <Table
                    cols={['Server Name', 'Type', 'Wrapper', 'Nicknames', 'Created']}
                    rows={result.federation_servers.map(s => [s.servername, s.servertype, s.wrapname, fmtN(s.nickname_count), s.create_time ? fmtDate(s.create_time) : ''])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TAB: Configuration                                          */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {tab === 'config' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {result.db_config && result.db_config.length > 0 && (
                <SectionCard title={`Database Configuration — DBCFG (${result.db_config.length} params)`} icon={BookOpen}>
                  <Table
                    cols={['Parameter', 'Current Value', 'Flags']}
                    rows={result.db_config.map(p => [p.name, p.value, p.flags])}
                  />
                </SectionCard>
              )}
              {result.dbm_config && result.dbm_config.length > 0 && (
                <SectionCard title={`DBM Configuration — DBMCFG (${result.dbm_config.length} params)`} icon={Settings}>
                  <Table
                    cols={['Parameter', 'Current Value', 'Flags']}
                    rows={result.dbm_config.map(p => [p.name, p.value, p.flags])}
                  />
                </SectionCard>
              )}
              {result.packages && result.packages.length > 0 && (
                <SectionCard title="Compiled Packages" icon={Package} count={result.packages.length}>
                  <Table
                    cols={['Schema', 'Package', 'Version', 'Language', 'Owner', 'Created']}
                    rows={result.packages.slice(0, 100).map(p => [p.pkg_schema, p.pkg_name, p.pkg_version, p.language, p.owner, p.create_time ? fmtDate(p.create_time) : ''])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* Footer timestamps */}
          <div style={{ fontSize: 11, color: D.textMuted, display: 'flex', gap: 20, paddingTop: 8, marginTop: 8 }}>
            {status?.created_at && <span>Started: {fmtDate(status.created_at)}</span>}
            {status?.completed_at && <span>Completed: {fmtDate(status.completed_at)}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
