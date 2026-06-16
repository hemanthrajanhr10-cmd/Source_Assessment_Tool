import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Building2, Users, BarChart3, Globe, FileText, Shield,
  CheckCircle2, XCircle, Loader2, ArrowLeft,
  FileSpreadsheet, BookOpen, ChevronDown, ChevronUp,
  TrendingUp, Package, Settings2, Key, AlertTriangle,
  DollarSign, Banknote, Layers,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { SageIntacctAssessmentResult } from '../types/api'
import Loader3D from '../components/ui/Loader3D'

// ── Design tokens (Ocean theme) ───────────────────────────────────────────────

const SAGE = {
  primary:    '#1d6a2e',
  mid:        '#2d7a3a',
  light:      '#4caf50',
  accent:     '#4caf50',
  light50:    '#f1f9f2',
  light100:   '#d8f0dd',
  light200:   '#b5e0bc',
  glow:       'rgba(29,106,46,0.15)',
  shadow:     '0 2px 4px rgba(29,106,46,0.04), 0 8px 24px rgba(29,106,46,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowH:    '0 4px 8px rgba(29,106,46,0.06), 0 16px 40px rgba(29,106,46,0.10)',
  shadowBtn:  '0 2px 8px rgba(29,106,46,0.30), inset 0 1px 0 rgba(255,255,255,0.16)',
}

// ── Assessment steps (terminal progress) ──────────────────────────────────────

const STEPS = [
  'Company profile',
  'Entity enumeration',
  'Users & roles',
  'Chart of accounts',
  'Departments',
  'Locations',
  'Classes & projects',
  'Customers & vendors',
  'Employees & warehouses',
  'AR invoice volumes',
  'AP bill volumes',
  'GL journal entries',
  'Purchase & sales orders',
  'Contracts & expenses',
  'Cash management',
  'Fixed assets',
  'Custom dimensions',
  'Platform extensions',
  'User-defined fields',
  'Custom reports & rules',
  'Data quality scan',
  'Generating Excel report',
  'Generating Word report',
]

// ── Live terminal component ───────────────────────────────────────────────────

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
    <div
      className="rounded-2xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: SAGE.shadow }}
    >
      {/* Terminal header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100"
        style={{ background: `linear-gradient(135deg, ${SAGE.light50} 0%, rgba(255,255,255,0) 100%)` }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: status === 'completed' ? SAGE.accent
                : status === 'failed' ? '#EF4444'
                : status === 'running' ? '#3B82F6'
                : '#94A3B8',
              boxShadow: status === 'running' ? '0 0 8px rgba(59,130,246,0.6)' : 'none',
              animation: status === 'running' ? 'pulse 2s infinite' : 'none',
            }}
          />
          <span className="text-sm font-semibold text-slate-700">Assessment Progress</span>
          {status === 'running' && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          )}
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: status === 'completed' ? SAGE.light100
              : status === 'failed' ? '#FEE2E2'
              : status === 'running' ? '#DBEAFE'
              : '#F1F5F9',
            color: status === 'completed' ? SAGE.primary
              : status === 'failed' ? '#991B1B'
              : status === 'running' ? '#1E40AF'
              : '#64748B',
          }}
        >
          {status === 'completed' ? `${STEPS.length}/${STEPS.length} steps` : `${completedSteps}/${STEPS.length} steps`}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-4 pb-2">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${status === 'completed' ? 100 : progress}%`,
              background: status === 'failed'
                ? 'linear-gradient(90deg, #EF4444, #F87171)'
                : `linear-gradient(90deg, ${SAGE.primary}, ${SAGE.accent})`,
              boxShadow: status !== 'failed' ? `0 0 8px ${SAGE.glow}` : 'none',
            }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1.5">
          {status === 'completed' ? 'All steps completed' : progressMessage || 'Waiting to start…'}
        </p>
      </div>

      {/* Steps checklist */}
      <div className="px-5 pb-5 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
        {STEPS.map((step, i) => {
          const done = status === 'completed' || i < completedSteps
          const current = i === completedSteps && status === 'running'
          return (
            <div key={i} className="flex items-center gap-2 py-1">
              <div className="shrink-0 h-4 w-4">
                {done ? (
                  <CheckCircle2 className="h-4 w-4" style={{ color: SAGE.accent }} />
                ) : current ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                ) : (
                  <div
                    className="h-4 w-4 rounded-full border-2"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                )}
              </div>
              <span
                className={`text-xs transition-colors duration-150 ${
                  done ? 'text-slate-700 font-medium'
                  : current ? 'text-blue-600 font-semibold'
                  : 'text-slate-400'
                }`}
              >
                {step}
              </span>
            </div>
          )
        })}
      </div>

      {/* Error display */}
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

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  index = 0,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  index?: number
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
        background: `linear-gradient(135deg, ${SAGE.light50} 0%, rgba(255,255,255,0.8) 100%)`,
        border: `1px solid ${SAGE.light200}`,
        boxShadow: '0 1px 2px rgba(27,107,69,0.04)',
        transition: 'box-shadow 200ms ease, transform 200ms cubic-bezier(0.34,1.56,0.64,1)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = `0 4px 12px ${SAGE.glow}, 0 1px 2px rgba(0,0,0,0.04)`
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = '0 1px 2px rgba(27,107,69,0.04)'
        el.style.transform = 'translateY(0)'
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${SAGE.primary} 0%, ${SAGE.mid} 100%)` }}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p
        className="text-2xl font-bold mt-1 tabular-nums"
        style={{ color: SAGE.primary }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-xs font-semibold text-slate-600 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Section collapsible ───────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: React.ElementType
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden"
      style={{ boxShadow: SAGE.shadow }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        style={{ background: open ? `linear-gradient(135deg, ${SAGE.light50} 0%, rgba(255,255,255,0) 100%)` : '' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: `linear-gradient(135deg, ${SAGE.primary} 0%, ${SAGE.mid} 100%)`,
              boxShadow: `0 2px 6px ${SAGE.glow}`,
            }}
          >
            <Icon className="h-4 w-4 text-white" aria-hidden="true" />
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
        <div
          key={i}
          className="flex items-center justify-between px-4 py-2.5"
          style={{ background: i % 2 === 0 ? SAGE.light50 : 'white' }}
        >
          <span className="text-xs text-slate-600 font-medium">{k}</span>
          <span className="text-xs font-semibold text-slate-800 text-right max-w-[60%]">
            {typeof v === 'number' ? v.toLocaleString() : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Download button ───────────────────────────────────────────────────────────

function DownloadBtn({
  label,
  icon: Icon,
  onClick,
  loading,
  variant = 'primary',
}: {
  label: string
  icon: React.ElementType
  onClick: () => void
  loading: boolean
  variant?: 'primary' | 'secondary'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-50"
      style={
        variant === 'primary'
          ? {
              background: `linear-gradient(135deg, ${SAGE.primary} 0%, ${SAGE.mid} 100%)`,
              color: 'white',
              boxShadow: SAGE.shadowBtn,
            }
          : {
              background: 'white',
              color: SAGE.primary,
              border: `1.5px solid ${SAGE.light200}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }
      }
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.transform = 'translateY(-1px)'
        if (variant === 'primary') el.style.boxShadow = `0 6px 20px ${SAGE.glow}`
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.transform = 'translateY(0)'
        if (variant === 'primary') el.style.boxShadow = SAGE.shadowBtn
      }}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SageIntacctSessionDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [status, setStatus] = useState<string>('pending')
  const [progressMessage, setProgressMessage] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [results, setResults] = useState<SageIntacctAssessmentResult | null>(null)
  const [label, setLabel] = useState<string>('')
  const [createdAt] = useState<string>('')
  const [loadError, setLoadError] = useState<string>('')

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
      const { data } = await api.sageGetJobStatus(jobId)
      setStatus(data.status)
      setProgressMessage(data.progress_message || '')
      if (data.error) setError(data.error)
      if (data.status === 'completed' && !results) {
        const { data: res } = await api.sageGetJobResults(jobId)
        setResults(res)
        setLabel(res.label || '')
      }
    } catch (err) {
      setLoadError(getApiErrorMessage(err))
    }
  }, [jobId, results])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (status === 'completed' || status === 'failed') return
    const interval = setInterval(loadStatus, 2500)
    return () => clearInterval(interval)
  }, [status, loadStatus])

  const handleDownloadExcel = async () => {
    if (!jobId) return
    setDlExcel(true)
    try { await api.sageDownloadExcelReport(jobId, label) }
    catch { /* ignore */ }
    finally { setDlExcel(false) }
  }

  const handleDownloadWord = async () => {
    if (!jobId) return
    setDlWord(true)
    try { await api.sageDownloadWordReport(jobId, label) }
    catch { /* ignore */ }
    finally { setDlWord(false) }
  }

  const cp = results?.company_profile
  const up = results?.user_profile
  const coa = results?.chart_of_accounts
  const fd = results?.financial_dimensions
  const tv = results?.transaction_volumes
  const cm = results?.cash_management
  const fa = results?.fixed_assets
  const cust = results?.customization
  const dq = results?.data_quality

  return (
    <div className="space-y-6">

      {/* ── Sticky header ────────────────────────────────────────────── */}
      <div ref={headerRef}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/sage-intacct/sessions')}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 transition-all duration-150"
              style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = SAGE.light200
                ;(e.currentTarget as HTMLButtonElement).style.color = SAGE.primary
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = ''
                ;(e.currentTarget as HTMLButtonElement).style.color = ''
              }}
              aria-label="Back to sessions"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: `linear-gradient(135deg, ${SAGE.primary} 0%, ${SAGE.mid} 100%)`,
                boxShadow: `0 4px 12px ${SAGE.glow}`,
              }}
            >
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {cp?.company_name || label || `Assessment ${jobId?.slice(0, 8)}`}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background: status === 'completed' ? SAGE.light100
                      : status === 'failed' ? '#FEE2E2'
                      : status === 'running' ? '#DBEAFE'
                      : '#F1F5F9',
                    color: status === 'completed' ? SAGE.primary
                      : status === 'failed' ? '#991B1B'
                      : status === 'running' ? '#1E40AF'
                      : '#64748B',
                  }}
                >
                  {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                  {status === 'failed' && <XCircle className="h-3 w-3" />}
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
                {createdAt && (
                  <span className="text-xs text-slate-400">
                    {new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {status === 'completed' && (
            <div className="flex items-center gap-2">
              <DownloadBtn
                label="Excel Report"
                icon={FileSpreadsheet}
                onClick={handleDownloadExcel}
                loading={dlExcel}
                variant="secondary"
              />
              <DownloadBtn
                label="Word Report"
                icon={BookOpen}
                onClick={handleDownloadWord}
                loading={dlWord}
                variant="primary"
              />
            </div>
          )}
        </div>
      </div>

      {/* Initial load spinner — shown until first status response arrives */}
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

      {/* ── Assessment terminal (always shown while running/pending) ─── */}
      {(status === 'running' || status === 'pending' || (status === 'failed' && !results)) && (
        <AssessmentTerminal
          status={status}
          progressMessage={progressMessage}
          error={error}
        />
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {results && (
        <>
          {/* Top KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="GL Accounts"
              value={coa?.total_accounts ?? 0}
              sub={`${coa?.active_accounts ?? 0} active`}
              icon={BarChart3}
              index={0}
            />
            <MetricCard
              label="Users"
              value={up?.total_users ?? 0}
              sub={`${up?.active_users ?? 0} active`}
              icon={Users}
              index={1}
            />
            <MetricCard
              label="Modules"
              value={cp?.modules_enabled?.length ?? 0}
              sub="financial modules"
              icon={Layers}
              index={2}
            />
            <MetricCard
              label="Entities"
              value={cp?.entity_count ?? 1}
              sub={cp?.base_currency}
              icon={Globe}
              index={3}
            />
          </div>

          {/* KPI strip 2 */}
          {tv && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="AR Invoices"
                value={tv.total_ar_invoices}
                sub={`${tv.open_ar_invoices} open`}
                icon={FileText}
                index={4}
              />
              <MetricCard
                label="AP Bills"
                value={tv.total_ap_bills}
                sub={`${tv.open_ap_bills} open`}
                icon={DollarSign}
                index={5}
              />
              <MetricCard
                label="GL Entries"
                value={tv.gl_journal_entries}
                sub="journal entries"
                icon={TrendingUp}
                index={6}
              />
              <MetricCard
                label="Bank Accounts"
                value={cm?.total_bank_accounts ?? 0}
                sub={`${cm?.checking_accounts ?? 0} checking`}
                icon={Banknote}
                index={7}
              />
            </div>
          )}

          {/* ── Sections ─────────────────────────────────────────────── */}
          <Section title="Company Profile" icon={Building2} defaultOpen>
            {cp && (
              <KVTable
                rows={[
                  ['Company ID', cp.company_id],
                  ['Company Name', cp.company_name],
                  ['Entity Count', cp.entity_count],
                  ['Base Currency', cp.base_currency],
                  ['Fiscal Year End Month', cp.fiscal_year_end_month],
                  ['Timezone', cp.timezone],
                  ['Subscription', cp.subscription_plan],
                  ['Modules Enabled', cp.modules_enabled.join(', ')],
                ]}
              />
            )}
          </Section>

          <Section title="Users & Roles" icon={Users} defaultOpen>
            {up && (
              <KVTable
                rows={[
                  ['Total Users', up.total_users],
                  ['Active Users', up.active_users],
                  ['Inactive Users', up.inactive_users],
                  ['Administrator Users', up.admin_users],
                  ['Role Count', up.role_count],
                  ['Permission Groups', up.permission_groups],
                ]}
              />
            )}
          </Section>

          <Section title="Chart of Accounts" icon={BarChart3}>
            {coa && (
              <KVTable
                rows={[
                  ['Total GL Accounts', coa.total_accounts],
                  ['Active Accounts', coa.active_accounts],
                  ['Asset Accounts', coa.asset_accounts],
                  ['Liability Accounts', coa.liability_accounts],
                  ['Equity Accounts', coa.equity_accounts],
                  ['Revenue Accounts', coa.revenue_accounts],
                  ['Expense Accounts', coa.expense_accounts],
                  ['Account Groups', coa.account_groups],
                ]}
              />
            )}
          </Section>

          <Section title="Financial Dimensions" icon={Globe}>
            {fd && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: 'Departments', value: fd.department_count },
                  { label: 'Locations', value: fd.location_count },
                  { label: 'Classes', value: fd.class_count },
                  { label: 'Projects', value: fd.project_count },
                  { label: 'Customers', value: fd.customer_count },
                  { label: 'Vendors', value: fd.vendor_count },
                  { label: 'Employees', value: fd.employee_count },
                  { label: 'Warehouses', value: fd.warehouse_count },
                  { label: 'Inventory Items', value: fd.item_count },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-xl px-3 py-2.5 text-center"
                    style={{
                      background: SAGE.light50,
                      border: `1px solid ${SAGE.light200}`,
                    }}
                  >
                    <p className="text-xl font-bold tabular-nums" style={{ color: SAGE.primary }}>
                      {value.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {tv && (
            <Section title="Transaction Volumes" icon={TrendingUp}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'AR Invoices', total: tv.total_ar_invoices, open: tv.open_ar_invoices },
                  { label: 'AP Bills', total: tv.total_ap_bills, open: tv.open_ap_bills },
                ].map(({ label, total, open }) => (
                  <div
                    key={label}
                    className="rounded-xl p-4"
                    style={{ background: SAGE.light50, border: `1px solid ${SAGE.light200}` }}
                  >
                    <p className="text-xs font-bold text-slate-600 mb-2">{label}</p>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold tabular-nums" style={{ color: SAGE.primary }}>
                          {total.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400">total records</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold tabular-nums text-amber-600">{open.toLocaleString()}</p>
                        <p className="text-xs text-slate-400">open</p>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="mt-3 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(open / total) * 100}%`,
                            background: open / total > 0.3 ? '#F59E0B' : SAGE.accent,
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <KVTable
                  rows={[
                    ['GL Journal Entries', tv.gl_journal_entries],
                    ['Purchase Orders', tv.purchase_orders],
                    ['Sales Orders', tv.sales_orders],
                    ['Contracts', tv.contracts],
                    ['Expense Reports', tv.expense_reports],
                  ]}
                />
              </div>
            </Section>
          )}

          {cm && (
            <Section title="Cash Management" icon={Banknote}>
              <KVTable
                rows={[
                  ['Checking Accounts', cm.checking_accounts],
                  ['Savings Accounts', cm.savings_accounts],
                  ['Credit Card Accounts', cm.credit_card_accounts],
                  ['Total Bank Accounts', cm.total_bank_accounts],
                ]}
              />
            </Section>
          )}

          {fa && (
            <Section title="Fixed Assets" icon={Package}>
              <KVTable
                rows={[
                  ['Total Assets', fa.total_assets],
                  ['Active Assets', fa.active_assets],
                  ['Disposed Assets', fa.disposed_assets],
                  ['Depreciation Methods', fa.depreciation_methods.join(', ') || 'N/A'],
                ]}
              />
            </Section>
          )}

          {cust && (
            <Section title="Customization & Platform Extensions" icon={Settings2}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: 'Custom Dimensions', value: cust.custom_dimensions },
                  { label: 'Platform Extensions', value: cust.platform_extensions },
                  { label: 'User-Defined Fields', value: cust.user_defined_fields },
                  { label: 'Custom Reports', value: cust.custom_report_count },
                  { label: 'Smart Rules', value: cust.smart_rules_count },
                  { label: 'Smart Events', value: cust.smart_events_count },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-xl px-3 py-2.5 text-center"
                    style={{ background: SAGE.light50, border: `1px solid ${SAGE.light200}` }}
                  >
                    <p className="text-xl font-bold tabular-nums" style={{ color: SAGE.primary }}>
                      {value.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {dq && (
            <Section title="Data Quality Flags" icon={Shield}>
              <div className="space-y-2">
                {[
                  { label: 'Unposted Journal Entries', value: dq.unposted_journal_entries, severity: 'medium' },
                  { label: 'Open Invoices Past Due', value: dq.open_invoices_past_due, severity: 'high' },
                  { label: 'Vendors Without GL Account', value: dq.vendors_without_gl_account, severity: 'low' },
                  { label: 'Customers Without Payment Terms', value: dq.customers_without_terms, severity: 'low' },
                  { label: 'Duplicate Vendor Names', value: dq.duplicate_vendor_names, severity: 'medium' },
                  { label: 'Accounts — No Recent Activity', value: dq.accounts_with_no_activity_days, severity: 'low' },
                ].map(({ label, value, severity }) => {
                  const sevColor = { high: '#DC2626', medium: '#D97706', low: '#059669' }[severity]
                  const sevBg = { high: '#FFF5F5', medium: '#FFFBEB', low: '#F0FDF4' }[severity]
                  const sevBorder = { high: '#FECACA', medium: '#FDE68A', low: SAGE.light200 }[severity]
                  return (
                    <div
                      key={label}
                      className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{ background: value > 0 ? sevBg : SAGE.light50, border: `1px solid ${value > 0 ? sevBorder : SAGE.light200}` }}
                    >
                      <span className="text-xs font-medium text-slate-700">{label}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-bold tabular-nums"
                          style={{ color: value > 0 ? sevColor : SAGE.accent }}
                        >
                          {value.toLocaleString()}
                        </span>
                        {value === 0 && <CheckCircle2 className="h-3.5 w-3.5" style={{ color: SAGE.accent }} />}
                        {value > 0 && <AlertTriangle className="h-3.5 w-3.5" style={{ color: sevColor }} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {results?.integration_health && (
            <Section title="Integration Health" icon={Key}>
              <KVTable
                rows={[
                  ['Web Services Version', results.integration_health.web_services_version],
                  ['API Endpoint', results.integration_health.api_endpoint],
                  ['Session Timeout (min)', results.integration_health.session_timeout_minutes],
                  ['Multi-Entity Enabled', results.integration_health.multi_entity_enabled ? 'Yes' : 'No'],
                  ['Consolidation Enabled', results.integration_health.consolidation_enabled ? 'Yes' : 'No'],
                ]}
              />
            </Section>
          )}

          {/* Download footer */}
          <div
            className="rounded-2xl border overflow-hidden p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{
              background: `linear-gradient(135deg, ${SAGE.light50} 0%, white 100%)`,
              borderColor: SAGE.light200,
              boxShadow: SAGE.shadow,
            }}
          >
            <div>
              <p className="text-sm font-bold text-slate-800">Download Full Reports</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Excel: all sections in tabbed workbook · Word: branded assessment document
              </p>
            </div>
            <div className="flex items-center gap-3">
              <DownloadBtn
                label="Excel (.xlsx)"
                icon={FileSpreadsheet}
                onClick={handleDownloadExcel}
                loading={dlExcel}
                variant="secondary"
              />
              <DownloadBtn
                label="Word (.docx)"
                icon={BookOpen}
                onClick={handleDownloadWord}
                loading={dlWord}
                variant="primary"
              />
            </div>
          </div>

        </>
      )}
    </div>
  )
}
