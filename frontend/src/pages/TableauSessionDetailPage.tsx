import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  BarChart3, Users, Database, Globe, RefreshCw, Shield,
  CheckCircle2, XCircle, Loader2, ArrowLeft,
  FileSpreadsheet, BookOpen, ChevronDown, ChevronUp,
  AlertTriangle, Layers, Zap, FileText,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { TableauAssessmentResult } from '../types/api'
import Loader3D from '../components/ui/Loader3D'

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  primary:  '#E8751A',
  dark:     '#1F3864',
  accent:   '#FFB81C',
  light50:  '#FFF8F0',
  light100: '#FFF3E0',
  light200: '#FFE0B2',
  glow:     'rgba(232,117,26,0.15)',
  shadow:   '0 2px 4px rgba(232,117,26,0.04), 0 8px 24px rgba(232,117,26,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowH:  '0 4px 8px rgba(232,117,26,0.06), 0 16px 40px rgba(232,117,26,0.10)',
  shadowBtn:'0 2px 8px rgba(232,117,26,0.35), inset 0 1px 0 rgba(255,255,255,0.16)',
}

// ── Steps list ────────────────────────────────────────────────────────────────

const STEPS = [
  'Connecting to Tableau Server',
  'Enumerating projects',
  'Enumerating workbooks',
  'Enumerating views & dashboards',
  'Enumerating data sources',
  'Enumerating users',
  'Enumerating groups',
  'Enumerating Prep flows',
  'Enumerating extract schedules',
  'Enumerating recent background jobs',
  'Sampling workbook permissions',
  'Building data quality flags',
  'Generating Excel report',
  'Generating Word report',
]

// ── Progress terminal ─────────────────────────────────────────────────────────

function AssessmentTerminal({
  status,
  progressMessage,
  error,
}: {
  status: string
  progressMessage?: string
  error?: string
}) {
  const currentStepIndex = progressMessage
    ? STEPS.findIndex((s) => progressMessage.toLowerCase().includes(s.toLowerCase().split(' ')[0]))
    : -1
  const completedSteps = status === 'completed' ? STEPS.length : Math.max(currentStepIndex, 0)
  const progress = Math.min((completedSteps / STEPS.length) * 100, 100)

  return (
    <div className="rounded-2xl border border-slate-200/80 overflow-hidden" style={{ boxShadow: T.shadow }}>
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100"
        style={{ background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 100%)` }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: status === 'completed' ? T.primary : status === 'failed' ? '#EF4444' : status === 'running' ? '#3B82F6' : '#94A3B8',
              boxShadow: status === 'running' ? '0 0 8px rgba(59,130,246,0.6)' : 'none',
              animation: status === 'running' ? 'pulse 2s infinite' : 'none',
            }}
          />
          <span className="text-sm font-semibold text-slate-700">Assessment Progress</span>
          {status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: status === 'completed' ? T.light100 : status === 'failed' ? '#FEE2E2' : status === 'running' ? '#DBEAFE' : '#F1F5F9',
            color: status === 'completed' ? T.dark : status === 'failed' ? '#991B1B' : status === 'running' ? '#1E40AF' : '#64748B',
          }}
        >
          {status === 'completed' ? `${STEPS.length}/${STEPS.length} steps` : `${completedSteps}/${STEPS.length} steps`}
        </span>
      </div>

      <div className="px-5 pt-4 pb-2">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${status === 'completed' ? 100 : progress}%`,
              background: status === 'failed'
                ? 'linear-gradient(90deg, #EF4444, #F87171)'
                : `linear-gradient(90deg, ${T.dark}, ${T.primary}, ${T.accent})`,
              boxShadow: status !== 'failed' ? `0 0 8px ${T.glow}` : 'none',
            }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1.5">
          {status === 'completed' ? 'All steps completed' : progressMessage || 'Waiting to start…'}
        </p>
      </div>

      <div className="px-5 pb-5 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
        {STEPS.map((step, i) => {
          const done = status === 'completed' || i < completedSteps
          const current = i === completedSteps && status === 'running'
          return (
            <div key={i} className="flex items-center gap-2 py-1">
              <div className="shrink-0 h-4 w-4">
                {done ? (
                  <CheckCircle2 className="h-4 w-4" style={{ color: T.primary }} />
                ) : current ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2" style={{ borderColor: '#E2E8F0' }} />
                )}
              </div>
              <span className={`text-xs transition-colors duration-150 ${done ? 'text-slate-700 font-medium' : current ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                {step}
              </span>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mx-5 mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon: Icon, index = 0 }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; index?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(10px) scale(0.98)'
    const t = setTimeout(() => {
      el.style.transition = 'opacity 280ms cubic-bezier(0,0,0.2,1), transform 280ms cubic-bezier(0.34,1.56,0.64,1)'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0) scale(1)'
    }, index * 40)
    return () => clearTimeout(t)
  }, [index])

  return (
    <div
      ref={ref}
      className="rounded-xl p-4"
      style={{
        background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0.8) 100%)`,
        border: `1px solid ${T.light200}`,
        boxShadow: '0 1px 2px rgba(232,117,26,0.04)',
        transition: 'box-shadow 200ms ease, transform 200ms cubic-bezier(0.34,1.56,0.64,1)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = `0 4px 12px ${T.glow}`
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = '0 1px 2px rgba(232,117,26,0.04)'
        el.style.transform = 'translateY(0)'
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${T.dark} 0%, #2E4E90 100%)` }}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: T.primary }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-xs font-semibold text-slate-600 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({ title, icon: Icon, defaultOpen = false, children }: {
  title: string; icon: React.ElementType; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden" style={{ boxShadow: T.shadow }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        style={{ background: open ? `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 100%)` : '' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${T.dark} 0%, #2E4E90 100%)`, boxShadow: '0 2px 6px rgba(31,56,100,0.2)' }}
          >
            <Icon className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-800">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ── KV table ──────────────────────────────────────────────────────────────────

function KVTable({ rows }: { rows: [string, string | number][] }) {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-100">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between px-4 py-2.5"
          style={{ background: i % 2 === 0 ? T.light50 : 'white' }}>
          <span className="text-xs text-slate-600 font-medium">{k}</span>
          <span className="text-xs font-semibold text-slate-800 text-right max-w-[60%]">
            {typeof v === 'number' ? v.toLocaleString() : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Data table ────────────────────────────────────────────────────────────────

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: T.dark }}>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-white">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? T.light50 : 'white' }}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-slate-700">
                  {typeof cell === 'number' ? cell.toLocaleString() : String(cell ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Download button ───────────────────────────────────────────────────────────

function DownloadBtn({ label, icon: Icon, onClick, loading, variant = 'primary' }: {
  label: string; icon: React.ElementType; onClick: () => void; loading: boolean; variant?: 'primary' | 'secondary'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-50"
      style={variant === 'primary'
        ? { background: `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`, color: 'white', boxShadow: T.shadowBtn }
        : { background: 'white', color: T.dark, border: `1.5px solid ${T.light200}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TableauSessionDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [status, setStatus] = useState('pending')
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState<TableauAssessmentResult | null>(null)
  const [label, setLabel] = useState('')
  const [loadError, setLoadError] = useState('')
  const [dlExcel, setDlExcel] = useState(false)
  const [dlWord, setDlWord] = useState(false)

  const headerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(-8px)'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 300ms ease, transform 300ms ease'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
  }, [])

  const loadStatus = useCallback(async () => {
    if (!jobId) return
    try {
      const { data } = await api.tableauGetJobStatus(jobId)
      setStatus(data.status)
      setProgressMessage(data.progress_message || '')
      if (data.error) setError(data.error)
      if (data.status === 'completed' && !results) {
        const { data: res } = await api.tableauGetJobResults(jobId)
        setResults(res)
        setLabel(res.label || '')
      }
    } catch (err) {
      setLoadError(getApiErrorMessage(err))
    }
  }, [jobId, results])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => {
    if (status === 'completed' || status === 'failed') return
    const interval = setInterval(loadStatus, 2500)
    return () => clearInterval(interval)
  }, [status, loadStatus])

  const handleDownloadExcel = async () => {
    if (!jobId) return
    setDlExcel(true)
    try { await api.tableauDownloadExcelReport(jobId, label) } catch { /* ignore */ }
    finally { setDlExcel(false) }
  }

  const handleDownloadWord = async () => {
    if (!jobId) return
    setDlWord(true)
    try { await api.tableauDownloadWordReport(jobId, label) } catch { /* ignore */ }
    finally { setDlWord(false) }
  }

  const si = results?.server_info
  const ws = results?.workbook_summary
  const ds = results?.datasource_summary
  const up = results?.user_profile
  const eh = results?.extract_health
  const dq = results?.data_quality

  return (
    <div className="space-y-6">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div ref={headerRef}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/tableau/sessions')}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 transition-all duration-150"
              style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.light200; (e.currentTarget as HTMLButtonElement).style.color = T.primary }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = ''; (e.currentTarget as HTMLButtonElement).style.color = '' }}
              aria-label="Back to sessions"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`, boxShadow: `0 4px 12px ${T.glow}` }}
            >
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {si?.site_name || label || `Assessment ${jobId?.slice(0, 8)}`}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background: status === 'completed' ? T.light100 : status === 'failed' ? '#FEE2E2' : status === 'running' ? '#DBEAFE' : '#F1F5F9',
                    color: status === 'completed' ? T.dark : status === 'failed' ? '#991B1B' : status === 'running' ? '#1E40AF' : '#64748B',
                  }}
                >
                  {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                  {status === 'failed' && <XCircle className="h-3 w-3" />}
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
                {si?.server_url && <span className="text-xs text-slate-400 truncate max-w-[200px]">{si.server_url}</span>}
              </div>
            </div>
          </div>

          {status === 'completed' && (
            <div className="flex items-center gap-2">
              <DownloadBtn label="Excel Report" icon={FileSpreadsheet} onClick={handleDownloadExcel} loading={dlExcel} variant="secondary" />
              <DownloadBtn label="Word Report" icon={BookOpen} onClick={handleDownloadWord} loading={dlWord} variant="primary" />
            </div>
          )}
        </div>
      </div>

      {/* Initial spinner */}
      {!loadError && status === 'pending' && !progressMessage && !results && (
        <Loader3D message="Fetching assessment…" />
      )}

      {/* Load error */}
      {loadError && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      )}

      {/* Progress terminal */}
      {(status === 'running' || status === 'pending' || (status === 'failed' && !results)) && (
        <AssessmentTerminal status={status} progressMessage={progressMessage} error={error} />
      )}

      {/* ── Results ──────────────────────────────────────────────── */}
      {results && (
        <>
          {/* Top KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Workbooks"    value={ws?.total_workbooks ?? 0}     sub={`${ws?.total_views ?? 0} views`}         icon={BarChart3}  index={0} />
            <MetricCard label="Data Sources" value={ds?.total_datasources ?? 0}   sub={`${ds?.certified_datasources ?? 0} certified`} icon={Database} index={1} />
            <MetricCard label="Users"        value={up?.total_users ?? 0}          sub={`${up?.admin_users ?? 0} admins`}         icon={Users}      index={2} />
            <MetricCard label="Projects"     value={results.projects?.length ?? 0} sub="workspaces"                              icon={Layers}     index={3} />
          </div>

          {/* KPI strip 2 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Sheets"    value={ws?.total_sheets ?? 0}              sub="published sheets"       icon={FileText}  index={4} />
            <MetricCard label="Dashboards" value={ws?.total_dashboards ?? 0}         sub="interactive dashboards" icon={BarChart3}  index={5} />
            <MetricCard label="Prep Flows" value={results.flows?.length ?? 0}        sub="Tableau Prep"           icon={Zap}       index={6} />
            <MetricCard label="Extract Jobs" value={eh?.total_refresh_jobs ?? 0}     sub={`${eh?.failed_jobs ?? 0} failed`} icon={RefreshCw} index={7} />
          </div>

          {/* ── Server Info ─────────────────────────────────────── */}
          {si && (
            <Section title="Server Information" icon={Globe} defaultOpen>
              <KVTable rows={[
                ['Server URL', si.server_url],
                ['Site Name', si.site_name],
                ['Server Version', si.server_version],
              ]} />
            </Section>
          )}

          {/* ── Workbook Summary ────────────────────────────────── */}
          {ws && (
            <Section title="Workbook Summary" icon={BarChart3} defaultOpen>
              <KVTable rows={[
                ['Total Workbooks', ws.total_workbooks],
                ['Total Views', ws.total_views],
                ['Total Sheets', ws.total_sheets],
                ['Total Dashboards', ws.total_dashboards],
                ['Workbooks with Extracts', ws.workbooks_with_extracts],
                ['Avg Views per Workbook', ws.avg_views_per_workbook.toFixed(1)],
              ]} />
            </Section>
          )}

          {/* ── Data Source Summary ──────────────────────────────── */}
          {ds && (
            <Section title="Data Source Summary" icon={Database} defaultOpen>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Total Sources', value: ds.total_datasources },
                  { label: 'Published', value: ds.published_datasources },
                  { label: 'Certified', value: ds.certified_datasources },
                  { label: 'With Extracts', value: ds.extract_datasources },
                  { label: 'Live Connection', value: ds.live_datasources },
                  { label: 'Embedded', value: ds.embedded_datasources },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl px-3 py-2.5 text-center"
                    style={{ background: T.light50, border: `1px solid ${T.light200}` }}>
                    <p className="text-xl font-bold tabular-nums" style={{ color: T.primary }}>{value.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>
              {ds.connection_types.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Connection Types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ds.connection_types.map((ct) => (
                      <span key={ct} className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: T.light100, color: T.dark, border: `1px solid ${T.light200}` }}>
                        {ct}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* ── Users ────────────────────────────────────────────── */}
          {up && (
            <Section title="User Profile" icon={Users}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Total Users', value: up.total_users },
                  { label: 'Admins', value: up.admin_users },
                  { label: 'Creators', value: up.creator_users },
                  { label: 'Explorers', value: up.explorer_users },
                  { label: 'Viewers', value: up.viewer_users },
                  { label: 'Unlicensed', value: up.unlicensed_users },
                  { label: 'Site Admins', value: up.site_admin_users },
                  { label: 'Active', value: up.active_users },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl px-3 py-2.5 text-center"
                    style={{ background: T.light50, border: `1px solid ${T.light200}` }}>
                    <p className="text-xl font-bold tabular-nums" style={{ color: T.primary }}>{value.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Projects ─────────────────────────────────────────── */}
          {results.projects && results.projects.length > 0 && (
            <Section title={`Projects (${results.projects.length})`} icon={Layers}>
              <DataTable
                headers={['Project Name', 'Content Permissions']}
                rows={results.projects.slice(0, 50).map((p) => [p.name, p.content_permissions])}
              />
              {results.projects.length > 50 && (
                <p className="text-xs text-slate-400 mt-2 text-center">Showing first 50 of {results.projects.length}</p>
              )}
            </Section>
          )}

          {/* ── Workbooks ────────────────────────────────────────── */}
          {results.workbooks && results.workbooks.length > 0 && (
            <Section title={`Workbooks (${results.workbooks.length})`} icon={BarChart3}>
              <DataTable
                headers={['Name', 'Project', 'Owner', 'Tags', 'Size MB']}
                rows={results.workbooks.slice(0, 50).map((wb) => [
                  wb.name, wb.project_name, wb.owner_name,
                  wb.tag_count, wb.size_mb.toFixed(1),
                ])}
              />
              {results.workbooks.length > 50 && (
                <p className="text-xs text-slate-400 mt-2 text-center">Showing first 50 of {results.workbooks.length}</p>
              )}
            </Section>
          )}

          {/* ── Data Sources ─────────────────────────────────────── */}
          {results.datasources && results.datasources.length > 0 && (
            <Section title={`Data Sources (${results.datasources.length})`} icon={Database}>
              <DataTable
                headers={['Name', 'Project', 'Type', 'Certified', 'Has Extracts']}
                rows={results.datasources.slice(0, 50).map((d) => [
                  d.name, d.project_name, d.datasource_type,
                  d.is_certified ? 'Yes' : 'No',
                  d.has_extracts ? 'Yes' : 'No',
                ])}
              />
              {results.datasources.length > 50 && (
                <p className="text-xs text-slate-400 mt-2 text-center">Showing first 50 of {results.datasources.length}</p>
              )}
            </Section>
          )}

          {/* ── Flows ────────────────────────────────────────────── */}
          {results.flows && results.flows.length > 0 && (
            <Section title={`Prep Flows (${results.flows.length})`} icon={Zap}>
              <DataTable
                headers={['Flow Name', 'Project', 'Owner', 'Updated']}
                rows={results.flows.slice(0, 30).map((f) => [
                  f.name, f.project_name, f.owner_name, f.updated_at || '',
                ])}
              />
            </Section>
          )}

          {/* ── Extract Health ────────────────────────────────────── */}
          {eh && (
            <Section title="Extract Refresh Health" icon={RefreshCw}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {[
                  { label: 'Total Schedules', value: eh.total_schedules, warn: false },
                  { label: 'Active', value: eh.active_schedules, warn: false },
                  { label: 'Suspended', value: eh.suspended_schedules, warn: eh.suspended_schedules > 0 },
                  { label: 'Total Jobs', value: eh.total_refresh_jobs, warn: false },
                  { label: 'Successful', value: eh.successful_jobs, warn: false },
                  { label: 'Failed', value: eh.failed_jobs, warn: eh.failed_jobs > 0 },
                  { label: 'Cancelled', value: eh.cancelled_jobs, warn: false },
                  { label: 'Stale Sources', value: eh.stale_datasources, warn: eh.stale_datasources > 0 },
                ].map(({ label, value, warn }) => (
                  <div key={label} className="rounded-xl px-3 py-2.5 text-center"
                    style={{ background: warn && value > 0 ? '#FFF5F5' : T.light50, border: `1px solid ${warn && value > 0 ? '#FECACA' : T.light200}` }}>
                    <p className="text-xl font-bold tabular-nums" style={{ color: warn && value > 0 ? '#DC2626' : T.primary }}>
                      {value.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Data Quality ─────────────────────────────────────── */}
          {dq && (
            <Section title="Data Quality Flags" icon={Shield}>
              <div className="space-y-2">
                {[
                  { label: 'Failed Extract Jobs',                 value: dq.failed_extract_jobs,                severity: 'high' },
                  { label: 'Stale Extracts (>7 days)',            value: dq.stale_extracts_over_7_days,         severity: 'high' },
                  { label: 'Workbooks with No Views',             value: dq.workbooks_with_no_views,            severity: 'medium' },
                  { label: 'Uncertified Published Data Sources',  value: dq.uncertified_published_datasources,  severity: 'low' },
                  { label: 'Users with No Recent Activity',       value: dq.users_with_no_activity,             severity: 'low' },
                ].map(({ label, value, severity }) => {
                  const sevColor = { high: '#DC2626', medium: '#D97706', low: '#059669' }[severity]
                  const sevBg    = { high: '#FFF5F5', medium: '#FFFBEB', low: '#F0FDF4' }[severity]
                  const sevBorder= { high: '#FECACA', medium: '#FDE68A', low: T.light200 }[severity]
                  return (
                    <div key={label} className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{ background: value > 0 ? sevBg : T.light50, border: `1px solid ${value > 0 ? sevBorder : T.light200}` }}>
                      <span className="text-xs font-medium text-slate-700">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold tabular-nums" style={{ color: value > 0 ? sevColor : T.primary }}>
                          {value.toLocaleString()}
                        </span>
                        {value === 0 && <CheckCircle2 className="h-3.5 w-3.5" style={{ color: T.primary }} />}
                        {value > 0 && <AlertTriangle className="h-3.5 w-3.5" style={{ color: sevColor }} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── Download footer ───────────────────────────────────── */}
          <div
            className="rounded-2xl border overflow-hidden p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{ background: `linear-gradient(135deg, ${T.light50} 0%, white 100%)`, borderColor: T.light200, boxShadow: T.shadow }}
          >
            <div>
              <p className="text-sm font-bold text-slate-800">Download Full Reports</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Excel: 10-sheet inventory workbook · Word: branded assessment document
              </p>
            </div>
            <div className="flex items-center gap-3">
              <DownloadBtn label="Excel (.xlsx)" icon={FileSpreadsheet} onClick={handleDownloadExcel} loading={dlExcel} variant="secondary" />
              <DownloadBtn label="Word (.docx)"  icon={BookOpen}        onClick={handleDownloadWord}  loading={dlWord}  variant="primary" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
