import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, AlertTriangle, Info,
  Loader2, ArrowLeft, Download, RefreshCw,
  Server, Shield, Database, Layers, Globe, BarChart3, Cpu,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { InforPNGLogo } from '../components/ui/SourceLogos'
import type {
  InforAssessmentResult, InforCheckResult, InforEngine,
  InforJobStatusResponse,
} from '../types/api'
import { INFOR_ENGINES } from '../types/api'

// ── Design tokens ─────────────────────────────────────────────────────────────

const D = {
  navy:       '#1E4D8C',
  blue:       '#0083BE',
  teal:       '#6CBDB5',
  tealFaint:  'rgba(108,189,181,0.07)',
  border:     '#B2DDD9',
  surface:    '#FFFFFF',
  bg:         '#F6FFFE',
  textPrim:   '#0D1117',
  textMuted:  '#767A8C',
  green:      '#059669',
  amber:      '#D97706',
  red:        '#DC2626',
  shadow:     '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.08)',
}

function engineLabel(e?: InforEngine) {
  return INFOR_ENGINES.find(m => m.value === e)?.label ?? (e?.toUpperCase() ?? 'Infor')
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
    completed: { bg: 'rgba(5,150,105,0.10)',   text: D.green,  label: 'Completed', icon: <CheckCircle2 style={{ width: 12, height: 12 }} /> },
    failed:    { bg: 'rgba(220,38,38,0.10)',    text: D.red,    label: 'Failed',    icon: <XCircle style={{ width: 12, height: 12 }} /> },
    running:   { bg: 'rgba(0,131,190,0.10)',    text: D.blue,   label: 'Running',   icon: <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> },
    pending:   { bg: 'rgba(118,122,140,0.10)',  text: D.textMuted, label: 'Pending', icon: <Loader2 style={{ width: 12, height: 12 }} /> },
  }
  const s = map[status] ?? map.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.text,
    }}>
      {s.icon}{s.label}
    </span>
  )
}

function RiskBadge({ risk }: { risk: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    critical: { bg: 'rgba(220,38,38,0.12)',  text: D.red },
    high:     { bg: 'rgba(217,119,6,0.12)',  text: D.amber },
    medium:   { bg: 'rgba(234,179,8,0.12)',  text: '#A16207' },
    low:      { bg: 'rgba(5,150,105,0.10)',  text: D.green },
    none:     { bg: 'rgba(118,122,140,0.08)', text: D.textMuted },
  }
  const s = map[risk] ?? map.none
  if (risk === 'none') return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 7px',
      borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      background: s.bg, color: s.text, textTransform: 'uppercase',
    }}>
      {risk}
    </span>
  )
}

function CheckStatusIcon({ status }: { status: string }) {
  const props = { style: { width: 14, height: 14, flexShrink: 0 } }
  if (status === 'pass') return <CheckCircle2 {...props} style={{ ...props.style, color: D.green }} />
  if (status === 'fail') return <XCircle {...props} style={{ ...props.style, color: D.red }} />
  if (status === 'warn') return <AlertTriangle {...props} style={{ ...props.style, color: D.amber }} />
  return <Info {...props} style={{ ...props.style, color: D.blue }} />
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'engine' | 'platform' | 'security' | 'checks' | 'recommendations'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',        label: 'Overview',        icon: BarChart3 },
  { id: 'engine',          label: 'Engine Details',  icon: Cpu },
  { id: 'platform',        label: 'Infor OS',        icon: Globe },
  { id: 'security',        label: 'Security',        icon: Shield },
  { id: 'checks',          label: 'All Checks',      icon: Database },
  { id: 'recommendations', label: 'Recommendations', icon: Layers },
]

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const pct = Math.min(100, Math.max(0, score))
  const stroke = pct >= 80 ? D.green : pct >= 60 ? D.amber : D.red
  return (
    <svg width={90} height={90} viewBox="0 0 90 90">
      <circle cx={45} cy={45} r={r} fill="none" stroke={D.border} strokeWidth={7} />
      <circle
        cx={45} cy={45} r={r} fill="none"
        stroke={stroke} strokeWidth={7}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x={45} y={49} textAnchor="middle" fontSize={16} fontWeight={800} fill={stroke}>
        {pct.toFixed(0)}%
      </text>
    </svg>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{
      background: D.surface, borderRadius: 12, padding: '16px 20px',
      border: `1px solid ${D.border}`, boxShadow: D.shadow,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: color ?? D.textPrim, margin: 0 }}>{value}</p>
    </div>
  )
}

// ── KV table ─────────────────────────────────────────────────────────────────

function KVTable({ rows }: { rows: [string, string | number | boolean | undefined | null][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} style={{ borderBottom: `1px solid ${D.border}` }}>
            <td style={{ padding: '9px 12px', fontWeight: 600, color: D.textMuted, width: '38%' }}>{k}</td>
            <td style={{ padding: '9px 12px', color: D.textPrim, fontFamily: typeof v === 'boolean' ? 'inherit' : 'inherit' }}>
              {v === null || v === undefined ? '—'
                : typeof v === 'boolean' ? (v ? '✓ Yes' : '✗ No')
                : String(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Checks table ──────────────────────────────────────────────────────────────

function ChecksTable({ checks, filter }: { checks: InforCheckResult[]; filter?: string }) {
  const filtered = filter
    ? checks.filter(c => c.domain.toLowerCase().includes(filter.toLowerCase()) || c.check.toLowerCase().includes(filter.toLowerCase()))
    : checks
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: `linear-gradient(90deg, ${D.tealFaint}, transparent)` }}>
            {['', 'Domain', 'Check', 'Risk', 'Count', 'Details'].map(h => (
              <th key={h} style={{
                padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                color: D.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
                borderBottom: `1px solid ${D.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((c, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${D.border}`, background: i % 2 === 0 ? D.surface : D.bg }}>
              <td style={{ padding: '9px 12px' }}><CheckStatusIcon status={c.status} /></td>
              <td style={{ padding: '9px 12px', fontWeight: 600, color: D.textPrim }}>{c.domain}</td>
              <td style={{ padding: '9px 12px', color: D.textPrim }}>{c.check}</td>
              <td style={{ padding: '9px 12px' }}><RiskBadge risk={c.risk} /></td>
              <td style={{ padding: '9px 12px', color: D.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                {c.count != null ? c.count.toLocaleString() : '—'}
              </td>
              <td style={{ padding: '9px 12px', color: D.textMuted, maxWidth: 300 }}>{c.details || '—'}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: D.textMuted }}>No checks found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InforSessionDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [status, setStatus] = useState<InforJobStatusResponse | null>(null)
  const [result, setResult] = useState<InforAssessmentResult | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const fetchStatus = useCallback(async () => {
    if (!jobId) return
    try {
      const { data } = await api.inforGetJobStatus(jobId)
      setStatus(data)
      if (data.status === 'completed') {
        const { data: res } = await api.inforGetJobResults(jobId)
        setResult(res)
      }
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }, [jobId])

  useEffect(() => {
    fetchStatus()
    let interval: ReturnType<typeof setInterval> | null = null
    if (status?.status === 'running' || status?.status === 'pending') {
      interval = setInterval(fetchStatus, 3000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [fetchStatus, status?.status])

  async function handleDownloadExcel() {
    if (!jobId || !result) return
    setDownloading(true)
    try {
      await api.inforDownloadExcel(jobId, result.engine, result.label ?? undefined)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  const isRunning = status?.status === 'running' || status?.status === 'pending'

  return (
    <div style={{ minHeight: '100vh', background: D.bg, padding: '24px 20px 56px', fontFamily: "'Inter Variable','Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* ── Back button ── */}
        <button
          onClick={() => navigate('/infor/sessions')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginBottom: 20, padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
            background: D.surface, border: `1px solid ${D.border}`, color: D.textMuted, cursor: 'pointer',
          }}
        >
          <ArrowLeft style={{ width: 13, height: 13 }} />
          All Infor assessments
        </button>

        {/* ── Header card ── */}
        <div style={{
          background: D.surface, borderRadius: 18, border: `1px solid ${D.border}`,
          boxShadow: D.shadow, padding: '20px 24px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', background: D.surface, border: `1.5px solid ${D.border}`,
              boxShadow: D.shadow,
            }}>
              <InforPNGLogo size={34} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 17, fontWeight: 800, color: D.textPrim, margin: 0 }}>
                  {result?.label || engineLabel(status?.engine ?? result?.engine)}
                </h1>
                {(status?.engine || result?.engine) && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: 'rgba(0,131,190,0.10)', color: D.blue, textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {(status?.engine || result?.engine)?.toUpperCase()}
                  </span>
                )}
                {status && <StatusPill status={status.status} />}
              </div>
              <p style={{ fontSize: 11, color: D.textMuted, marginTop: 4 }}>
                Job: <span style={{ fontFamily: 'monospace' }}>{jobId?.slice(0, 8)}</span>
                {result?.engine_info?.tenant_id && <> · Tenant: <span style={{ fontFamily: 'monospace' }}>{result.engine_info.tenant_id}</span></>}
                {status?.created_at && <> · {new Date(status.created_at).toLocaleString()}</>}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isRunning && (
              <button onClick={fetchStatus} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                background: D.bg, border: `1px solid ${D.border}`, color: D.textMuted, cursor: 'pointer',
              }}>
                <RefreshCw style={{ width: 12, height: 12 }} />
                Refresh
              </button>
            )}
            {result && (
              <button
                onClick={handleDownloadExcel}
                disabled={downloading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: downloading ? D.border : `linear-gradient(135deg, ${D.teal}, #4DA8A0)`,
                  color: downloading ? D.textMuted : '#fff', border: 'none', cursor: 'pointer',
                  boxShadow: downloading ? 'none' : '0 4px 18px rgba(108,189,181,0.30)',
                }}
              >
                {downloading ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : <Download style={{ width: 13, height: 13 }} />}
                Download Excel (9 sheets)
              </button>
            )}
          </div>
        </div>

        {/* ── Running progress ── */}
        {isRunning && status && (
          <div style={{
            background: 'rgba(0,131,190,0.06)', border: `1px solid rgba(0,131,190,0.18)`,
            borderRadius: 12, padding: '14px 18px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Loader2 style={{ width: 15, height: 15, color: D.blue, animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: D.navy, fontWeight: 600, margin: 0 }}>
              {status.progress_message || 'Assessment running…'}
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {(error || (status?.status === 'failed' && status.error)) && (
          <div style={{
            background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.20)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <XCircle style={{ width: 14, height: 14, color: D.red, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: D.red, margin: 0 }}>{error || status?.error}</p>
          </div>
        )}

        {/* ── Tabs ── */}
        {result && (
          <>
            <div style={{
              display: 'flex', gap: 2, background: D.surface, borderRadius: 12,
              border: `1px solid ${D.border}`, padding: 4, marginBottom: 20, overflowX: 'auto',
              boxShadow: D.shadow,
            }}>
              {TABS.map(t => {
                const Icon = t.icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: active ? 700 : 500,
                      background: active ? `linear-gradient(135deg, ${D.teal}, #4DA8A0)` : 'transparent',
                      color: active ? '#fff' : D.textMuted,
                      border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                    }}
                  >
                    <Icon style={{ width: 13, height: 13 }} />
                    {t.label}
                  </button>
                )
              })}
            </div>

            {/* ── Tab: Overview ── */}
            {tab === 'overview' && (
              <div>
                {/* Score + stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div style={{
                    background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`,
                    padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: D.shadow,
                  }}>
                    <ScoreRing score={result.overall_score ?? 0} />
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: D.textMuted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overall Score</p>
                      <p style={{ fontSize: 11, color: D.textMuted, margin: 0 }}>
                        {result.passed_checks}/{result.total_checks} passed
                      </p>
                    </div>
                  </div>
                  <StatCard label="Total Checks" value={result.total_checks} />
                  <StatCard label="Critical Findings" value={result.critical_findings} color={result.critical_findings > 0 ? D.red : D.green} />
                  <StatCard label="Warnings" value={result.warnings} color={result.warnings > 0 ? D.amber : D.green} />
                </div>

                {/* Engine info */}
                {result.engine_info && (
                  <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, boxShadow: D.shadow, marginBottom: 16, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: D.tealFaint, borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Server style={{ width: 14, height: 14, color: D.teal }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Engine Information</span>
                    </div>
                    <KVTable rows={[
                      ['Engine', result.engine_info.engine.toUpperCase()],
                      ['Edition', result.engine_info.edition],
                      ['Tenant ID', result.engine_info.tenant_id],
                      ['Deployment', result.engine_info.deployment],
                      ['ION API Version', result.engine_info.ion_api_version],
                      ['Detection Method', result.engine_info.detection_method],
                    ]} />
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Engine Details ── */}
            {tab === 'engine' && (
              <div style={{ display: 'grid', gap: 14 }}>
                {result.engine === 'm3' && result.m3_api_repository && (
                  <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, boxShadow: D.shadow, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: D.tealFaint, borderBottom: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>M3 API Repository</span>
                    </div>
                    <KVTable rows={[
                      ['Program Count', result.m3_api_repository.program_count],
                      ['Table Count', result.m3_api_repository.table_count],
                      ['Custom Programs (Z/X/Y)', result.m3_api_repository.custom_program_count],
                      ['MRS001 Accessible', result.m3_api_repository.mrs001_accessible],
                      ['MRS002 Accessible', result.m3_api_repository.mrs002_accessible],
                      ['MRS003 Accessible', result.m3_api_repository.mrs003_accessible],
                      ['MDBREADMI Accessible', result.m3_api_repository.mdbreadmi_accessible],
                      ['API Completeness', `${result.m3_api_repository.api_completeness_pct.toFixed(0)}%`],
                    ]} />
                  </div>
                )}
                {result.engine === 'm3' && result.m3_multi_site && (
                  <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, boxShadow: D.shadow, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: D.tealFaint, borderBottom: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>M3 Multi-Site Complexity</span>
                    </div>
                    <KVTable rows={[
                      ['Company Count', result.m3_multi_site.company_count],
                      ['Facility Count', result.m3_multi_site.facility_count],
                      ['Multi-Currency', result.m3_multi_site.multi_currency],
                    ]} />
                  </div>
                )}
                {result.engine === 'ln' && result.ln_bod_catalog && (
                  <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, boxShadow: D.shadow, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: D.tealFaint, borderBottom: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>LN BOD Catalog</span>
                    </div>
                    <KVTable rows={[
                      ['Total BODs', result.ln_bod_catalog.total_bods],
                      ['Sync BODs', result.ln_bod_catalog.bod_verb_counts['Sync'] ?? 0],
                      ['Process BODs', result.ln_bod_catalog.bod_verb_counts['Process'] ?? 0],
                      ['ION Connection Points', result.ln_bod_catalog.connection_point_count],
                      ['Outbound Data Flows', result.ln_bod_catalog.data_flow_count],
                    ]} />
                  </div>
                )}
                {result.engine === 'ln' && result.ln_vrc && (
                  <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, boxShadow: D.shadow, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: D.tealFaint, borderBottom: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>LN VRC Customisations</span>
                    </div>
                    <KVTable rows={[
                      ['VRC Packages', result.ln_vrc.vrc_package_count],
                      ['Custom Components', result.ln_vrc.custom_component_count],
                      ['Package Codes', result.ln_vrc.vrc_packages.join(', ') || '—'],
                    ]} />
                  </div>
                )}
                {result.engine === 'csi' && result.csi_schema && (
                  <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, boxShadow: D.shadow, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: D.tealFaint, borderBottom: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>CSI / SyteLine Schema</span>
                    </div>
                    <KVTable rows={[
                      ['Tables', result.csi_schema.table_count],
                      ['Custom Tables', result.csi_schema.custom_table_count],
                      ['Views', result.csi_schema.view_count],
                      ['Stored Procedures', result.csi_schema.stored_procedure_count],
                      ['Triggers', result.csi_schema.trigger_count],
                      ['Sites', result.csi_schema.site_count],
                      ['User-Defined Fields', result.csi_schema.user_defined_field_count],
                      ['Event Handlers', result.csi_schema.event_handler_count],
                      ['Custom Forms', result.csi_schema.custom_form_count],
                    ]} />
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Infor OS Platform ── */}
            {tab === 'platform' && result.platform_health && (
              <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, boxShadow: D.shadow, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: D.tealFaint, borderBottom: `1px solid ${D.border}` }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Infor OS Platform Health</span>
                </div>
                <KVTable rows={[
                  ['ION API Gateway', result.platform_health.ion_api_accessible],
                  ['Ming.le Portal', result.platform_health.mingle_accessible],
                  ['Infor Data Fabric', result.platform_health.data_fabric_catalog_present],
                  ['Birst BI Active', result.platform_health.birst_active],
                  ['Coleman AI Deployed', result.platform_health.coleman_ai_active],
                  ['GRC Configured', result.platform_health.grc_configured],
                  ['MFA Broadly Enabled', result.platform_health.mfa_enabled],
                  ['Daily ION Messages', result.platform_health.ion_message_volume_daily?.toLocaleString()],
                  ['ION API Version', result.platform_health.ion_api_version],
                ]} />
              </div>
            )}

            {/* ── Tab: Security ── */}
            {tab === 'security' && (
              <div style={{ display: 'grid', gap: 14 }}>
                {result.user_profile && (
                  <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, boxShadow: D.shadow, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: D.tealFaint, borderBottom: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>User Profile</span>
                    </div>
                    <KVTable rows={[
                      ['Total Users', result.user_profile.total_users],
                      ['Admin Users', result.user_profile.admin_user_count],
                      ['MFA-Enabled Users', result.user_profile.mfa_enabled_users],
                      ['Roles', result.user_profile.role_count],
                    ]} />
                  </div>
                )}
                <ChecksTable checks={result.checks.filter(c => c.domain === 'Security' || c.domain === 'GRC' || c.domain === 'MFA')} />
              </div>
            )}

            {/* ── Tab: All Checks ── */}
            {tab === 'checks' && (
              <div style={{ background: D.surface, borderRadius: 14, border: `1px solid ${D.border}`, boxShadow: D.shadow, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: D.tealFaint, borderBottom: `1px solid ${D.border}` }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    All Checks ({result.checks.length})
                  </span>
                </div>
                <ChecksTable checks={result.checks} />
              </div>
            )}

            {/* ── Tab: Recommendations ── */}
            {tab === 'recommendations' && (
              <div style={{ display: 'grid', gap: 10 }}>
                {result.checks
                  .filter(c => c.recommendation)
                  .sort((a, b) => {
                    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
                    return (order[a.risk] ?? 5) - (order[b.risk] ?? 5)
                  })
                  .map((c, i) => {
                    const riskColors: Record<string, { bg: string; border: string; text: string }> = {
                      critical: { bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.20)', text: D.red },
                      high:     { bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.20)',  text: D.amber },
                      medium:   { bg: 'rgba(234,179,8,0.06)', border: 'rgba(234,179,8,0.20)',  text: '#A16207' },
                      low:      { bg: 'rgba(5,150,105,0.06)', border: 'rgba(5,150,105,0.16)', text: D.green },
                    }
                    const rc = riskColors[c.risk] ?? { bg: D.bg, border: D.border, text: D.textMuted }
                    return (
                      <div key={i} style={{
                        background: rc.bg, border: `1px solid ${rc.border}`,
                        borderRadius: 12, padding: '14px 16px',
                        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0 14px', alignItems: 'start',
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: rc.text, color: '#fff', fontSize: 11, fontWeight: 800,
                        }}>
                          {i + 1}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: D.textPrim }}>{c.check}</span>
                            <RiskBadge risk={c.risk} />
                          </div>
                          {c.details && <p style={{ fontSize: 12, color: D.textMuted, margin: '0 0 6px' }}>{c.details}</p>}
                          <p style={{ fontSize: 12, color: rc.text, fontWeight: 600, margin: 0 }}>
                            → {c.recommendation}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                {result.checks.filter(c => c.recommendation).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: D.textMuted, fontSize: 13 }}>
                    No recommendations — all checks passed without actionable findings.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
