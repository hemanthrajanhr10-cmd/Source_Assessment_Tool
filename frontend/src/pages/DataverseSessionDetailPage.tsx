import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Database, ChevronLeft, Loader2, AlertTriangle, CheckCircle,
  XCircle, Clock, AlertCircle, Info, ChevronDown, ChevronUp,
  BarChart3, Shield, Zap, CloudCog, Eye, Layers,
  GitBranch, FlaskConical, Globe,
} from 'lucide-react'
import axios from 'axios'
import type {
  DataverseJobStatusResponse,
  DataverseAssessmentResult,
  DataverseCheckResult,
  DataverseDomainSummary,
} from '../types/api'

const T = {
  primary:    '#0E7490',
  mid:        '#0891B2',
  accent:     '#22D3EE',
  dark:       '#0C1A2E',
  surface:    '#F0FDFE',
  light50:    '#ECFEFF',
  light100:   '#CFFAFE',
  light200:   '#A5F3FC',
  text:       '#0C4A6E',
  textMid:    '#0369A1',
  glow:       'rgba(14,116,144,0.15)',
  gradHero:   'linear-gradient(135deg, #0C1A2E 0%, #0F2C45 50%, #103755 100%)',
  gradBtn:    'linear-gradient(135deg, #0E7490 0%, #0891B2 100%)',
  shadowCard: '0 1px 3px rgba(14,116,144,0.06), 0 4px 16px rgba(14,116,144,0.07)',
}

// ── Risk & Status visual helpers ──────────────────────────────────────────────
const RISK_COLOR: Record<string, string> = {
  critical: '#dc2626', high: '#d97706', medium: '#2563eb', low: '#059669',
}
const RISK_BG: Record<string, string> = {
  critical: 'rgba(220,38,38,0.09)', high: 'rgba(217,119,6,0.09)',
  medium: 'rgba(37,99,235,0.09)', low: 'rgba(5,150,105,0.09)',
}

const STATUS_META: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  critical: { icon: XCircle,      color: '#dc2626', bg: 'rgba(220,38,38,0.09)', label: 'Critical' },
  warning:  { icon: AlertTriangle,color: '#d97706', bg: 'rgba(217,119,6,0.09)', label: 'Warning' },
  passed:   { icon: CheckCircle,  color: '#059669', bg: 'rgba(5,150,105,0.09)', label: 'Passed' },
  info:     { icon: Info,         color: '#2563eb', bg: 'rgba(37,99,235,0.09)', label: 'Info' },
  error:    { icon: AlertCircle,  color: '#7c3aed', bg: 'rgba(124,58,237,0.09)', label: 'Error' },
  skipped:  { icon: Clock,        color: '#94a3b8', bg: 'rgba(148,163,184,0.09)', label: 'Skipped' },
}

const DOMAIN_ICON: Record<string, React.ElementType> = {
  'Tables':            Database,
  'Columns':           Layers,
  'Relationships':     GitBranch,
  'Option Sets':       BarChart3,
  'Data Volume':       BarChart3,
  'Data Quality':      FlaskConical,
  'Security Roles':    Shield,
  'Users & Teams':     Globe,
  'Field Level Security': Eye,
  'Solutions':         CloudCog,
  'Flows':             Zap,
  'Plugins':           CloudCog,
  'Workflows':         Zap,
  'UI & Forms':        Layers,
  'Web Resources':     Globe,
  'Integrations':      Globe,
  'Audit':             Eye,
  'Environment':       Settings,
  'Performance':       BarChart3,
  'Service Management':Shield,
  'Retention':         Clock,
  'AI & Copilot':      GitBranch,
}
function Settings(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, sub }: { icon: React.ElementType; label: string; value: string | number; color: string; sub?: string }) {
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
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      </div>
      <p style={{ fontSize: '28px', fontWeight: 900, color, margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: 0 }}>{sub}</p>}
    </div>
  )
}

// ── Domain card ───────────────────────────────────────────────────────────────
function DomainCard({ summary, checks, defaultOpen }: { summary: DataverseDomainSummary; checks: DataverseCheckResult[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const Icon = DOMAIN_ICON[summary.domain] ?? Database
  const hasIssues = summary.critical + summary.high > 0
  const score = Math.round(summary.score)
  const scoreColor = score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626'

  return (
    <div style={{
      background: '#fff', borderRadius: '16px', overflow: 'hidden',
      boxShadow: T.shadowCard, border: `1px solid ${hasIssues ? (summary.critical > 0 ? 'rgba(220,38,38,0.20)' : 'rgba(217,119,6,0.18)') : T.light100}`,
      transition: 'box-shadow 180ms',
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '16px 20px', background: 'none', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left',
        }}
      >
        {/* Icon */}
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
          background: hasIssues
            ? (summary.critical > 0 ? 'rgba(220,38,38,0.09)' : 'rgba(217,119,6,0.09)')
            : T.light50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: '16px', height: '16px', color: hasIssues ? (summary.critical > 0 ? '#dc2626' : '#d97706') : T.primary }} />
        </div>

        {/* Domain name + pills */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: T.text, margin: 0 }}>{summary.domain}</p>
            {summary.critical > 0 && (
              <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(220,38,38,0.10)', color: '#dc2626' }}>
                {summary.critical} critical
              </span>
            )}
            {summary.high > 0 && (
              <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: 'rgba(217,119,6,0.10)', color: '#b45309' }}>
                {summary.high} high
              </span>
            )}
            {!hasIssues && (
              <span style={{ fontSize: '10.5px', fontWeight: 600, padding: '2px 7px', borderRadius: '99px', background: 'rgba(5,150,105,0.09)', color: '#065f46' }}>
                Healthy
              </span>
            )}
          </div>
          <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: 0, marginTop: '2px' }}>
            {summary.total_checks} checks · {summary.passed} passed · {summary.errors} errors
          </p>
        </div>

        {/* Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '18px', fontWeight: 900, color: scoreColor, margin: 0, lineHeight: 1 }}>{score}%</p>
            <p style={{ fontSize: '9.5px', color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>score</p>
          </div>
          {open ? <ChevronUp style={{ width: '16px', height: '16px', color: '#94a3b8' }} /> : <ChevronDown style={{ width: '16px', height: '16px', color: '#94a3b8' }} />}
        </div>
      </button>

      {/* Checks list */}
      {open && (
        <div style={{ borderTop: `1px solid ${T.light100}` }}>
          {checks.map((c, i) => {
            const sm = STATUS_META[c.status] ?? STATUS_META.info
            const StatusIcon = sm.icon
            return (
              <div
                key={c.check_id}
                style={{
                  padding: '13px 20px',
                  borderBottom: i < checks.length - 1 ? `1px solid ${T.light50}` : 'none',
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  background: i % 2 === 0 ? '#fff' : '#f0fdfe',
                }}
              >
                {/* Status icon */}
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                  background: sm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <StatusIcon style={{ width: '13px', height: '13px', color: sm.color }} />
                </div>

                {/* Check info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 7px', borderRadius: '99px', background: T.light50, color: T.primary, fontFamily: 'monospace' }}>
                      {c.check_id}
                    </span>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: T.text, margin: 0 }}>{c.name}</p>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px',
                      background: RISK_BG[c.risk], color: RISK_COLOR[c.risk],
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>{c.risk}</span>
                  </div>
                  {c.details && (
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0', lineHeight: 1.5 }}>{c.details}</p>
                  )}
                  {c.recommendation && (
                    <div style={{
                      marginTop: '6px', padding: '6px 10px', borderRadius: '7px',
                      background: 'rgba(14,116,144,0.05)', border: `1px solid ${T.light200}`,
                      display: 'flex', gap: '6px', alignItems: 'flex-start',
                    }}>
                      <AlertTriangle style={{ width: '11px', height: '11px', color: T.primary, flexShrink: 0, marginTop: '2px' }} />
                      <p style={{ fontSize: '11.5px', color: T.text, margin: 0, lineHeight: 1.4 }}>{c.recommendation}</p>
                    </div>
                  )}
                  {c.count != null && (
                    <p style={{ fontSize: '11.5px', color: T.textMid, margin: '4px 0 0', fontWeight: 700 }}>
                      Count: {c.count.toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Status badge */}
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px',
                  background: sm.bg, color: sm.color, flexShrink: 0,
                }}>{sm.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Progress terminal ──────────────────────────────────────────────────────────
function ProgressTerminal({ jobStatus }: { jobStatus: DataverseJobStatusResponse }) {
  const termRef = useRef<HTMLDivElement>(null)
  const prog = jobStatus.checks_completed ?? 0
  const total = jobStatus.total_checks || 25
  const pct = Math.round((prog / total) * 100)

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [jobStatus.progress_message])

  return (
    <div style={{ background: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: T.shadowCard, border: `1px solid ${T.light100}` }}>
      {/* Terminal header */}
      <div style={{
        background: T.gradHero, padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['#ff5f57','#febc2e','#28c840'].map(c => (
            <div key={c} style={{ width: '11px', height: '11px', borderRadius: '50%', background: c, opacity: 0.85 }} />
          ))}
        </div>
        <p style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(207,250,254,0.80)', margin: 0 }}>
          Dataverse Assessment Terminal
        </p>
        <Loader2 style={{ width: '13px', height: '13px', color: T.accent, marginLeft: 'auto', animation: 'spin 1s linear infinite' }} />
      </div>

      {/* Progress bar */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: T.primary }}>Assessment progress</span>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: T.primary }}>{pct}%</span>
        </div>
        <div style={{ height: '6px', background: T.light100, borderRadius: '99px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: `linear-gradient(90deg, ${T.primary} 0%, ${T.accent} 100%)`,
            borderRadius: '99px', transition: 'width 400ms ease',
          }} />
        </div>
      </div>

      {/* Log area */}
      <div ref={termRef} style={{
        padding: '16px 20px 20px',
        fontFamily: "'Fira Code', 'Cascadia Code', 'Monaco', monospace",
        fontSize: '12px', lineHeight: 1.6, maxHeight: '260px', overflowY: 'auto',
      }}>
        {jobStatus.progress_message && (
          <p style={{ color: T.accent, margin: 0 }}>
            <span style={{ color: 'rgba(34,211,238,0.55)' }}>{'> '}</span>
            {jobStatus.progress_message}
            <span style={{ animation: 'blink 1s step-end infinite', color: T.accent }}>▊</span>
          </p>
        )}
        <p style={{ color: 'rgba(34,211,238,0.45)', margin: '6px 0 0', fontSize: '11px' }}>
          Step {prog}/{total} · Scanning {jobStatus.label || 'environment'}…
        </p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DataverseSessionDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const [jobStatus,  setJobStatus]  = useState<DataverseJobStatusResponse | null>(null)
  const [result,     setResult]     = useState<DataverseAssessmentResult | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [activeTab,  setActiveTab]  = useState<'overview' | 'domains' | 'checks'>('overview')
  const [filterDomain,  setFilterDomain]  = useState('All')
  const [filterStatus,  setFilterStatus]  = useState('All')
  const [filterRisk,    setFilterRisk]    = useState('All')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const token = () => localStorage.getItem('sat_token') || ''

  async function fetchStatus() {
    try {
      const r = await axios.get(`/api/v1/dataverse/jobs/${jobId}/status`, { headers: { Authorization: `Bearer ${token()}` } })
      setJobStatus(r.data)
      if (r.data.status === 'completed' || r.data.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current)
        fetchResults()
      }
    } catch {
      setError('Failed to fetch job status.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchResults() {
    try {
      const r = await axios.get(`/api/v1/dataverse/jobs/${jobId}/results`, { headers: { Authorization: `Bearer ${token()}` } })
      setResult(r.data)
    } catch {
      setError('Failed to load assessment results.')
    }
  }

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [jobId])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
      <Loader2 style={{ width: '22px', height: '22px', color: T.primary, animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: '14px', color: T.textMid }}>Loading assessment…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const isRunning = jobStatus && ['pending', 'running'].includes(jobStatus.status)

  // Build domain → checks map
  const domainMap = new Map<string, DataverseCheckResult[]>()
  if (result) {
    for (const c of result.check_results) {
      const arr = domainMap.get(c.domain) ?? []
      arr.push(c)
      domainMap.set(c.domain, arr)
    }
  }

  // Filtered checks
  const allChecks = result?.check_results ?? []
  const filteredChecks = allChecks.filter(c => {
    if (filterDomain !== 'All' && c.domain !== filterDomain) return false
    if (filterStatus !== 'All' && c.status !== filterStatus) return false
    if (filterRisk !== 'All' && c.risk !== filterRisk) return false
    return true
  })

  const domains = result?.domain_summaries?.map(ds => ds.domain) ?? []
  const score = result ? Math.round(result.overall_score) : 0
  const scoreColor = score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626'

  return (
    <div style={{ minHeight: '100vh', background: T.surface }}>
      {/* Hero */}
      <div style={{ background: T.gradHero, padding: '24px 32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(34,211,238,0.07)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => navigate('/dataverse/sessions')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', fontWeight: 600, color: 'rgba(207,250,254,0.70)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '14px',
            }}
          >
            <ChevronLeft style={{ width: '13px', height: '13px' }} /> All Assessments
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* Score ring */}
              {result ? (
                <div style={{
                  width: '52px', height: '52px', borderRadius: '50%', flexShrink: 0,
                  background: `conic-gradient(${scoreColor} ${score * 3.6}deg, rgba(255,255,255,0.10) 0deg)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 0 3px rgba(255,255,255,0.08)`,
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: T.dark, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score}</span>
                    <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' }}>score</span>
                  </div>
                </div>
              ) : (
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px', flexShrink: 0,
                  background: 'rgba(34,211,238,0.20)', border: '1px solid rgba(34,211,238,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isRunning
                    ? <Loader2 style={{ width: '20px', height: '20px', color: T.accent, animation: 'spin 1s linear infinite' }} />
                    : <Database style={{ width: '20px', height: '20px', color: T.accent }} />
                  }
                </div>
              )}

              <div>
                <h1 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, margin: 0 }}>
                  {jobStatus?.label || result?.environment_url || 'Dataverse Assessment'}
                </h1>
                {result?.organization_name && (
                  <p style={{ color: 'rgba(34,211,238,0.80)', fontSize: '12.5px', margin: '3px 0 0' }}>
                    {result.organization_name} · {result.environment_url}
                  </p>
                )}
                {result?.organization_version && (
                  <p style={{ color: 'rgba(34,211,238,0.55)', fontSize: '11.5px', margin: '2px 0 0' }}>
                    Version {result.organization_version}
                    {result.duration_seconds != null && ` · Completed in ${result.duration_seconds}s`}
                  </p>
                )}
              </div>
            </div>

            {/* Status badge */}
            {jobStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '6px 14px', borderRadius: '99px',
                background: jobStatus.status === 'completed'
                  ? 'rgba(5,150,105,0.20)'
                  : jobStatus.status === 'failed'
                  ? 'rgba(220,38,38,0.20)'
                  : 'rgba(34,211,238,0.20)',
                border: `1px solid ${jobStatus.status === 'completed' ? 'rgba(5,150,105,0.30)' : jobStatus.status === 'failed' ? 'rgba(220,38,38,0.30)' : 'rgba(34,211,238,0.30)'}`,
              }}>
                {jobStatus.status === 'completed'
                  ? <CheckCircle style={{ width: '14px', height: '14px', color: '#6ee7b7' }} />
                  : jobStatus.status === 'failed'
                  ? <XCircle style={{ width: '14px', height: '14px', color: '#fca5a5' }} />
                  : <Loader2 style={{ width: '14px', height: '14px', color: T.accent, animation: 'spin 1s linear infinite' }} />
                }
                <span style={{
                  fontSize: '12.5px', fontWeight: 700, textTransform: 'capitalize',
                  color: jobStatus.status === 'completed' ? '#6ee7b7' : jobStatus.status === 'failed' ? '#fca5a5' : T.accent,
                }}>{jobStatus.status}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Running state ── */}
      {isRunning && jobStatus && (
        <div style={{ maxWidth: '820px', margin: '24px auto', padding: '0 24px' }}>
          <ProgressTerminal jobStatus={jobStatus} />
        </div>
      )}

      {/* ── Error state ── */}
      {error && (
        <div style={{ maxWidth: '820px', margin: '24px auto', padding: '0 24px' }}>
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.20)', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <AlertTriangle style={{ width: '16px', height: '16px', color: '#dc2626' }} />
            <p style={{ fontSize: '13px', color: '#991b1b', margin: 0 }}>{error}</p>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div style={{ maxWidth: '1060px', margin: '0 auto', padding: '24px 24px 48px' }}>

          {/* ── Score summary cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            <StatCard icon={BarChart3}   label="Total Checks"     value={result.total_checks}      color={T.primary} />
            <StatCard icon={XCircle}     label="Critical"         value={result.critical_findings}  color={result.critical_findings > 0 ? '#dc2626' : '#059669'} sub={result.critical_findings > 0 ? 'Needs immediate action' : 'None found'} />
            <StatCard icon={AlertTriangle} label="High"           value={result.high_findings}      color={result.high_findings > 0 ? '#d97706' : '#059669'} />
            <StatCard icon={Info}        label="Medium"           value={result.medium_findings}    color='#2563eb' />
            <StatCard icon={CheckCircle} label="Domains Covered"  value={result.domain_summaries.length} color={T.primary} />
          </div>

          {/* ── Errors ── */}
          {result.errors.length > 0 && (
            <div style={{ marginBottom: '20px', padding: '14px 16px', borderRadius: '12px', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.18)' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', margin: '0 0 6px' }}>Assessment Errors</p>
              {result.errors.map((e, i) => (
                <p key={i} style={{ fontSize: '11.5px', color: '#991b1b', margin: '2px 0', fontFamily: 'monospace' }}>{e}</p>
              ))}
            </div>
          )}

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#fff', borderRadius: '12px', padding: '4px', boxShadow: T.shadowCard, border: `1px solid ${T.light100}` }}>
            {(['overview', 'domains', 'checks'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: '9px', fontSize: '12.5px', fontWeight: 600,
                  border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                  background: activeTab === tab ? T.gradBtn : 'none',
                  color: activeTab === tab ? '#fff' : '#64748b',
                  transition: 'all 160ms',
                  boxShadow: activeTab === tab ? '0 2px 8px rgba(14,116,144,0.25)' : 'none',
                }}
              >
                {tab === 'overview' ? 'Overview' : tab === 'domains' ? `Domains (${result.domain_summaries.length})` : `All Checks (${result.total_checks})`}
              </button>
            ))}
          </div>

          {/* ── Overview tab ── */}
          {activeTab === 'overview' && (
            <div>
              {/* Domain score grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                {result.domain_summaries
                  .sort((a, b) => (a.critical + a.high) - (b.critical + b.high) === 0 ? b.critical + b.high - a.critical - a.high : (b.critical + b.high) - (a.critical + a.high))
                  .map(ds => {
                    const Icon = DOMAIN_ICON[ds.domain] ?? Database
                    const s = Math.round(ds.score)
                    const sc = s >= 80 ? '#059669' : s >= 60 ? '#d97706' : '#dc2626'
                    const hasIssue = ds.critical + ds.high > 0
                    return (
                      <div
                        key={ds.domain}
                        onClick={() => { setActiveTab('domains') }}
                        style={{
                          background: '#fff', borderRadius: '14px', padding: '16px',
                          boxShadow: T.shadowCard,
                          border: `1px solid ${hasIssue ? (ds.critical > 0 ? 'rgba(220,38,38,0.15)' : 'rgba(217,119,6,0.15)') : T.light100}`,
                          cursor: 'pointer', transition: 'all 160ms',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = '' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <div style={{
                            width: '30px', height: '30px', borderRadius: '8px',
                            background: hasIssue ? (ds.critical > 0 ? 'rgba(220,38,38,0.09)' : 'rgba(217,119,6,0.09)') : T.light50,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Icon style={{ width: '14px', height: '14px', color: hasIssue ? (ds.critical > 0 ? '#dc2626' : '#d97706') : T.primary }} />
                          </div>
                          <span style={{ fontSize: '16px', fontWeight: 900, color: sc }}>{s}%</span>
                        </div>
                        <p style={{ fontSize: '12.5px', fontWeight: 700, color: T.text, margin: '0 0 4px' }}>{ds.domain}</p>
                        <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                          {ds.total_checks} checks
                          {ds.critical > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}> · {ds.critical} crit</span>}
                          {ds.high > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}> · {ds.high} high</span>}
                        </p>
                        {/* Mini score bar */}
                        <div style={{ marginTop: '10px', height: '4px', background: T.light100, borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s}%`, background: `linear-gradient(90deg, ${sc} 0%, ${sc}99 100%)`, borderRadius: '99px' }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* ── Domains tab ── */}
          {activeTab === 'domains' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {result.domain_summaries
                .sort((a, b) => (b.critical + b.high) - (a.critical + a.high))
                .map(ds => (
                  <DomainCard
                    key={ds.domain}
                    summary={ds}
                    checks={domainMap.get(ds.domain) ?? []}
                    defaultOpen={ds.critical > 0}
                  />
                ))}
            </div>
          )}

          {/* ── All checks tab ── */}
          {activeTab === 'checks' && (
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Domain', value: filterDomain, set: setFilterDomain, options: ['All', ...domains] },
                  { label: 'Status', value: filterStatus, set: setFilterStatus, options: ['All', 'critical', 'warning', 'passed', 'info', 'error', 'skipped'] },
                  { label: 'Risk', value: filterRisk, set: setFilterRisk, options: ['All', 'critical', 'high', 'medium', 'low'] },
                ].map(({ label, value, set, options }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}:</span>
                    <select
                      value={value}
                      onChange={e => set(e.target.value)}
                      style={{
                        padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        border: `1.5px solid ${T.light200}`, background: '#fff', color: T.text, cursor: 'pointer', outline: 'none',
                      }}
                    >
                      {options.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                    </select>
                  </div>
                ))}
                <span style={{ fontSize: '12px', color: '#94a3b8', alignSelf: 'center' }}>
                  {filteredChecks.length} of {allChecks.length} checks
                </span>
              </div>

              {/* Checks table */}
              <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: T.shadowCard, border: `1px solid ${T.light100}` }}>
                {filteredChecks.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No checks match current filters.</div>
                ) : (
                  filteredChecks.map((c, i) => {
                    const sm = STATUS_META[c.status] ?? STATUS_META.info
                    const StatusIcon = sm.icon
                    return (
                      <div
                        key={c.check_id}
                        style={{
                          padding: '12px 18px',
                          borderBottom: i < filteredChecks.length - 1 ? `1px solid ${T.light50}` : 'none',
                          display: 'flex', alignItems: 'flex-start', gap: '12px',
                          background: i % 2 === 0 ? '#fff' : '#f0fdfe',
                        }}
                      >
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                          background: sm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px',
                        }}>
                          <StatusIcon style={{ width: '13px', height: '13px', color: sm.color }} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', background: T.light50, color: T.primary, fontFamily: 'monospace' }}>{c.check_id}</span>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: T.text, margin: 0 }}>{c.name}</p>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', background: RISK_BG[c.risk], color: RISK_COLOR[c.risk], textTransform: 'uppercase' }}>{c.risk}</span>
                            <span style={{ fontSize: '10px', color: '#94a3b8', background: T.light50, padding: '1px 6px', borderRadius: '99px' }}>{c.domain}</span>
                          </div>
                          {c.details && <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>{c.details}</p>}
                          {c.recommendation && (
                            <p style={{ fontSize: '11.5px', color: T.primary, margin: '3px 0 0', fontStyle: 'italic' }}>
                              ↪ {c.recommendation}
                            </p>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: sm.bg, color: sm.color }}>{sm.label}</span>
                          {c.count != null && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{c.count.toLocaleString()}</span>}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
      `}</style>
    </div>
  )
}
