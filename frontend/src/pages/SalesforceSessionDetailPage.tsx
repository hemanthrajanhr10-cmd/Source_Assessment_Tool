import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Loader2, AlertTriangle, CheckCircle,
  XCircle, Clock, AlertCircle, Info, ChevronDown, ChevronUp,
  BarChart3, Shield, Zap, Database, Globe, Code2,
  Package, Settings2, TrendingUp, Users,
} from 'lucide-react'
import axios from 'axios'
import { SalesforceLogo } from '../components/ui/SourceLogos'
import type {
  SalesforceJobStatusResponse,
  SalesforceAssessmentResult,
  SalesforceCheckResult,
  SalesforceDomainSummary,
} from '../types/api'

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

const RISK_COLOR: Record<string, string> = {
  critical: '#dc2626', high: '#d97706', medium: '#2563eb', low: '#059669',
}
const RISK_BG: Record<string, string> = {
  critical: 'rgba(220,38,38,0.09)', high: 'rgba(217,119,6,0.09)',
  medium: 'rgba(37,99,235,0.09)', low: 'rgba(5,150,105,0.09)',
}

const STATUS_META: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  critical: { icon: XCircle,       color: '#dc2626', bg: 'rgba(220,38,38,0.09)',  label: 'Critical' },
  warning:  { icon: AlertTriangle, color: '#d97706', bg: 'rgba(217,119,6,0.09)',  label: 'Warning'  },
  passed:   { icon: CheckCircle,   color: '#059669', bg: 'rgba(5,150,105,0.09)',  label: 'Passed'   },
  info:     { icon: Info,          color: '#2563eb', bg: 'rgba(37,99,235,0.09)',  label: 'Info'     },
  error:    { icon: AlertCircle,   color: '#7c3aed', bg: 'rgba(124,58,237,0.09)', label: 'Error'    },
  skipped:  { icon: Clock,         color: '#94a3b8', bg: 'rgba(148,163,184,0.09)',label: 'Skipped'  },
}

const DOMAIN_ICON: Record<string, React.ElementType> = {
  'sObjects (Metadata API)':   Database,
  'Fields (Metadata API)':     Database,
  'Relationships (Metadata API)': Globe,
  'Apex Code (Tooling API)':   Code2,
  'Automation (Tooling API)':  Zap,
  'Security (REST API)':       Shield,
  'Bulk API v2':               Package,
  'Analytics (Connect API)':   BarChart3,
  'Integrations':              Settings2,
}

function StatCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ElementType; label: string; value: string | number; color: string; sub?: string
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: '16px', padding: '18px 20px',
      boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
          background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: '16px', height: '16px', color }} />
        </div>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', margin: 0, letterSpacing: '0.02em' }}>{label}</p>
      </div>
      <p style={{ fontSize: '26px', fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{sub}</p>}
    </div>
  )
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626'
  const label = score >= 80 ? 'Healthy' : score >= 60 ? 'Needs Attention' : 'At Risk'
  const size  = 120
  const r     = 44
  const circ  = 2 * Math.PI * r
  const dash  = (score / 100) * circ

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.light100} strokeWidth={10} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
        />
        <text x={size/2} y={size/2 + 2} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize="22" fontWeight="800">{score}</text>
        <text x={size/2} y={size/2 + 20} textAnchor="middle" dominantBaseline="middle"
          fill="#94a3b8" fontSize="9">/100</text>
      </svg>
      <span style={{
        fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: 99,
        background: `${color}14`, color,
      }}>{label}</span>
    </div>
  )
}

function DomainCard({ domain, expanded, onToggle, checks }: {
  domain: SalesforceDomainSummary
  expanded: boolean
  onToggle: () => void
  checks: SalesforceCheckResult[]
}) {
  const Icon = DOMAIN_ICON[domain.domain] || BarChart3
  const scoreColor = domain.score >= 80 ? '#059669' : domain.score >= 60 ? '#d97706' : '#dc2626'

  return (
    <div style={{
      background: '#fff', borderRadius: '14px',
      border: `1px solid ${T.light100}`, overflow: 'hidden',
      boxShadow: T.shadowCard,
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '14px 18px', border: 'none',
          background: 'transparent', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}
      >
        <div style={{
          width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0,
          background: T.light50, border: `1px solid ${T.light200}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: '16px', height: '16px', color: T.primary }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '13.5px', fontWeight: 700, color: T.dark, margin: '0 0 2px' }}>{domain.domain}</p>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{domain.api_surface}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {domain.critical > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(220,38,38,0.09)', color: '#dc2626' }}>
              {domain.critical} critical
            </span>
          )}
          {domain.high > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(217,119,6,0.09)', color: '#d97706' }}>
              {domain.high} high
            </span>
          )}
          <span style={{ fontSize: '13px', fontWeight: 800, color: scoreColor, minWidth: '40px', textAlign: 'right' }}>
            {domain.score.toFixed(0)}
          </span>
          {expanded
            ? <ChevronUp style={{ width: '14px', height: '14px', color: '#94a3b8', flexShrink: 0 }} />
            : <ChevronDown style={{ width: '14px', height: '14px', color: '#94a3b8', flexShrink: 0 }} />
          }
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${T.light100}`, padding: '0' }}>
          {checks.map((c, i) => {
            const sm = STATUS_META[c.status] || STATUS_META.info
            const StatusIcon = sm.icon
            return (
              <div key={c.check_id} style={{
                padding: '12px 18px',
                borderBottom: i < checks.length - 1 ? `1px solid ${T.light100}` : 'none',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto auto',
                gap: '12px',
                alignItems: 'start',
                background: i % 2 === 0 ? '#fff' : T.light50,
              }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                  background: sm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <StatusIcon style={{ width: '13px', height: '13px', color: sm.color }} />
                </div>

                <div>
                  <p style={{ fontSize: '12.5px', fontWeight: 700, color: T.dark, margin: '0 0 2px' }}>{c.name}</p>
                  {c.details && <p style={{ fontSize: '11px', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{c.details}</p>}
                  {c.recommendation && (
                    <p style={{ fontSize: '10.5px', color: '#d97706', margin: '4px 0 0', fontStyle: 'italic', lineHeight: 1.5 }}>
                      → {c.recommendation}
                    </p>
                  )}
                </div>

                {c.count != null && (
                  <span style={{ fontSize: '13px', fontWeight: 800, color: T.dark, whiteSpace: 'nowrap' }}>
                    {c.count.toLocaleString()}
                  </span>
                )}

                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: RISK_BG[c.risk], color: RISK_COLOR[c.risk],
                  whiteSpace: 'nowrap', alignSelf: 'center',
                }}>
                  {c.risk}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SalesforceSessionDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate  = useNavigate()
  const [job,     setJob]     = useState<SalesforceJobStatusResponse | null>(null)
  const [result,  setResult]  = useState<SalesforceAssessmentResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const token = () => localStorage.getItem('sat_token') || ''

  useEffect(() => {
    if (!jobId) return

    async function fetch() {
      try {
        const resp = await axios.get(`/api/v1/salesforce/jobs/${jobId}/status`, {
          headers: { Authorization: `Bearer ${token()}` },
        })
        setJob(resp.data)
        setLoading(false)

        if (resp.data.status === 'completed' || resp.data.status === 'failed') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }

          if (resp.data.status === 'completed') {
            const rr = await axios.get(`/api/v1/salesforce/jobs/${jobId}/results`, {
              headers: { Authorization: `Bearer ${token()}` },
            })
            setResult(rr.data)
            // Auto-expand domains with findings
            const withFindings = rr.data.domain_summaries
              .filter((d: SalesforceDomainSummary) => d.critical > 0 || d.high > 0)
              .map((d: SalesforceDomainSummary) => d.domain)
            setExpanded(new Set(withFindings))
          }
        }
      } catch {
        setLoading(false)
      }
    }

    fetch()
    pollRef.current = setInterval(fetch, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [jobId])

  const progress = job
    ? Math.round((job.checks_completed / Math.max(job.total_checks, 1)) * 100)
    : 0

  const statusRunning = job?.status === 'running' || job?.status === 'pending'
  const statusDone    = job?.status === 'completed'
  const statusFailed  = job?.status === 'failed'

  function toggleDomain(domain: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(domain) ? next.delete(domain) : next.add(domain)
      return next
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: T.surface }}>

      {/* Hero */}
      <div style={{ background: T.gradHero, borderBottom: `1px solid ${T.light100}`, padding: '24px 32px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto' }}>
          <button
            onClick={() => navigate('/salesforce/sessions')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', borderRadius: '8px', border: `1px solid ${T.light200}`,
              background: '#fff', color: T.primary, fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', marginBottom: '14px',
            }}
          >
            <ChevronLeft style={{ width: '12px', height: '12px' }} />
            All Assessments
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: '#fff', border: `1px solid ${T.light200}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SalesforceLogo size={26} />
            </div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: T.dark, margin: 0 }}>
                {job?.label || 'Salesforce Assessment'}
              </h1>
              <p style={{ fontSize: '11.5px', color: T.textMid, margin: 0, marginTop: '2px' }}>
                Job {jobId?.slice(0, 8)}…
                {job?.created_at && ` · Started ${new Date(job.created_at).toLocaleString()}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 60px' }}>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '14px' }}>
            <Loader2 style={{ width: '22px', height: '22px', color: T.primary, animation: 'spin 1s linear infinite' }} />
            <span style={{ color: T.textMid, fontSize: '14px' }}>Loading assessment…</span>
          </div>
        )}

        {/* Running state */}
        {!loading && statusRunning && job && (
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '32px',
            boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
            textAlign: 'center',
          }}>
            <div style={{ marginBottom: '20px' }}>
              <Loader2 style={{ width: '40px', height: '40px', color: T.primary, animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: T.dark, margin: '0 0 8px' }}>
              Assessment in Progress
            </h2>
            <p style={{ fontSize: '13px', color: T.textMid, margin: '0 0 20px' }}>
              {job.progress_message || 'Connecting to Salesforce…'}
            </p>

            {/* Progress bar */}
            <div style={{ background: T.light100, borderRadius: 99, height: '8px', maxWidth: '400px', margin: '0 auto 8px', overflow: 'hidden' }}>
              <div style={{
                width: `${progress}%`, height: '100%',
                background: T.gradBtn, borderRadius: 99,
                transition: 'width 600ms ease',
              }} />
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
              {job.checks_completed} / {job.total_checks} steps complete · {progress}%
            </p>

            {/* Step indicators */}
            <div style={{ marginTop: '24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px' }}>
              {Array.from({ length: job.total_checks }, (_, i) => (
                <div key={i} style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: i < job.checks_completed ? T.primary : T.light200,
                  transition: 'background 300ms',
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Failed state */}
        {!loading && statusFailed && job && (
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '32px',
            boxShadow: T.shadowCard, border: '1px solid rgba(220,38,38,0.20)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <XCircle style={{ width: '28px', height: '28px', color: '#dc2626' }} />
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#991b1b', margin: 0 }}>Assessment Failed</h2>
            </div>
            {job.error && (
              <pre style={{
                fontSize: '12px', color: '#7f1d1d', background: 'rgba(220,38,38,0.05)',
                padding: '14px', borderRadius: '10px', overflow: 'auto', margin: 0,
                border: '1px solid rgba(220,38,38,0.15)',
              }}>
                {job.error}
              </pre>
            )}
            <button
              onClick={() => navigate('/salesforce/new')}
              style={{
                marginTop: '16px', padding: '10px 20px', borderRadius: '10px', border: 'none',
                background: T.gradBtn, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Completed results */}
        {!loading && statusDone && result && (
          <>
            {/* Overview grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '24px', alignItems: 'stretch' }}>

              {/* Score gauge */}
              <div style={{
                background: '#fff', borderRadius: '16px', padding: '20px',
                boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', margin: '0 0 8px', letterSpacing: '0.02em' }}>Overall Score</p>
                <ScoreGauge score={Math.round(result.overall_score)} />
              </div>

              <StatCard icon={AlertTriangle} label="Critical Findings" value={result.critical_findings} color="#dc2626" />
              <StatCard icon={Shield} label="High Findings" value={result.high_findings} color="#d97706" />
              <StatCard icon={BarChart3} label="Total Checks" value={result.total_checks} color={T.primary} />
              <StatCard icon={TrendingUp} label="Duration" value={result.duration_seconds ? `${result.duration_seconds.toFixed(1)}s` : '—'} color="#059669" />
            </div>

            {/* Org details */}
            <div style={{
              background: '#fff', borderRadius: '14px', padding: '18px 22px',
              boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
              marginBottom: '20px',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px',
            }}>
              {[
                { label: 'Org Name',    value: result.org_name    || '—' },
                { label: 'Org Type',    value: result.org_type    || '—' },
                { label: 'Org ID',      value: result.org_id      || '—' },
                { label: 'API Version', value: result.sf_version  || '—' },
              ].map(item => (
                <div key={item.label}>
                  <p style={{ fontSize: '10.5px', color: '#94a3b8', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: T.dark, margin: 0 }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Inventory stats */}
            <div style={{
              background: '#fff', borderRadius: '14px', padding: '18px 22px',
              boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
              marginBottom: '24px',
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: T.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>
                Inventory
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                {[
                  { icon: Database, label: 'Custom Objects',   value: result.custom_object_count,   color: T.primary },
                  { icon: Database, label: 'Standard Objects', value: result.standard_object_count, color: T.mid },
                  { icon: Database, label: 'Custom Fields',    value: result.total_field_count,     color: T.mid },
                  { icon: Code2,    label: 'Apex Classes',     value: result.apex_class_count,      color: T.accent },
                  { icon: Zap,      label: 'Flows',            value: result.flow_count,            color: T.primary },
                  { icon: Users,    label: 'Active Users',     value: result.active_user_count,     color: T.dark },
                  { icon: Shield,   label: 'Profiles',         value: result.profile_count,         color: T.mid },
                  { icon: Shield,   label: 'Permission Sets',  value: result.permission_set_count,  color: T.primary },
                ].map(item => (
                  <div key={item.label} style={{
                    padding: '12px', borderRadius: '10px',
                    background: `${item.color}08`, border: `1px solid ${item.color}18`,
                    display: 'flex', flexDirection: 'column', gap: '6px',
                  }}>
                    <item.icon style={{ width: '14px', height: '14px', color: item.color }} />
                    <p style={{ fontSize: '18px', fontWeight: 800, color: item.color, margin: 0 }}>
                      {item.value.toLocaleString()}
                    </p>
                    <p style={{ fontSize: '10.5px', color: '#6b7280', margin: 0 }}>{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Domain summaries */}
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: T.dark, margin: 0 }}>
                Domain Results
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setExpanded(new Set(result.domain_summaries.map(d => d.domain)))}
                  style={{ fontSize: '12px', fontWeight: 600, color: T.primary, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Expand All
                </button>
                <button
                  onClick={() => setExpanded(new Set())}
                  style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Collapse All
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {result.domain_summaries.map(domain => (
                <DomainCard
                  key={domain.domain}
                  domain={domain}
                  expanded={expanded.has(domain.domain)}
                  onToggle={() => toggleDomain(domain.domain)}
                  checks={result.check_results.filter(c => c.domain === domain.domain)}
                />
              ))}
            </div>

            {/* Errors (if any) */}
            {result.errors && result.errors.length > 0 && (
              <div style={{ marginTop: '20px', padding: '14px 16px', borderRadius: '12px', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b', margin: '0 0 8px' }}>Non-fatal Errors</p>
                {result.errors.map((e, i) => (
                  <p key={i} style={{ fontSize: '11.5px', color: '#7f1d1d', margin: '2px 0', fontFamily: 'monospace' }}>{e}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
