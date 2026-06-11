import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Globe, Lock, Eye, EyeOff, Tag, Zap,
  CheckCircle2, AlertCircle, Wifi, ArrowRight,
  Shield, Key, ChevronDown, ChevronUp, Settings2,
  FileText, Database, Users, RefreshCw, Layers,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { TableauAssessmentRequest } from '../types/api'
import Spinner from '../components/ui/Spinner'

// ── Design tokens (Ocean / Deep Atlantic) ────────────────────────────────────

const T = {
  primary:    '#0084D4',
  dark:       '#003D82',
  mid:        '#0056B3',
  accent:     '#38A8F5',
  light50:    '#EFF6FF',
  light100:   '#DBEEFF',
  light200:   '#BAE0FF',
  glow:       'rgba(0,132,212,0.15)',
  shadowCard: '0 2px 4px rgba(0,86,179,0.04), 0 8px 24px rgba(0,86,179,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowHover:'0 4px 8px rgba(0,86,179,0.06), 0 16px 40px rgba(0,86,179,0.10), 0 2px 4px rgba(0,0,0,0.04)',
  shadowBtn:  '0 2px 8px rgba(0,132,212,0.35), inset 0 1px 0 rgba(255,255,255,0.16)',
}

// ── Component helpers ─────────────────────────────────────────────────────────

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">
      {children}
      {required && <span className="text-red-400 ml-1">*</span>}
    </label>
  )
}

function InputField({
  icon: Icon,
  placeholder,
  value,
  onChange,
  type = 'text',
  mono = false,
  disabled = false,
  hint,
  rightAction,
}: {
  icon?: React.ElementType
  placeholder?: string
  value: string
  onChange: (v: string) => void
  type?: string
  mono?: boolean
  disabled?: boolean
  hint?: string
  rightAction?: React.ReactNode
}) {
  return (
    <div>
      <div className="relative group">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={[
            'w-full rounded-xl border border-slate-200 bg-white',
            'text-sm text-slate-800 placeholder-slate-400',
            'py-2.5 transition-all duration-200 outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            Icon ? 'pl-10' : 'pl-3.5',
            rightAction ? 'pr-10' : 'pr-3.5',
            mono ? 'font-mono' : '',
          ].join(' ')}
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)' }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = T.primary
            e.currentTarget.style.boxShadow = `0 0 0 3px ${T.glow}, 0 1px 2px rgba(0,0,0,0.04)`
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = ''
            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
          }}
        />
        {rightAction && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightAction}</div>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function PasswordField({
  icon: Icon,
  placeholder,
  value,
  onChange,
  disabled = false,
}: {
  icon?: React.ElementType
  placeholder?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <InputField
      icon={Icon}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      type={show ? 'text' : 'password'}
      disabled={disabled}
      rightAction={
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="p-0.5 rounded text-slate-400 transition-colors"
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = T.primary }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '' }}
          tabIndex={-1}
          aria-label={show ? 'Hide' : 'Show'}
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      }
    />
  )
}

function SectionCard({
  title,
  icon: Icon,
  badge,
  children,
}: {
  title: string
  icon: React.ElementType
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden"
      style={{ boxShadow: T.shadowCard, transition: 'box-shadow 240ms ease, transform 240ms cubic-bezier(0.34,1.56,0.64,1)' }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = T.shadowHover
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = T.shadowCard
        el.style.transform = 'translateY(0)'
      }}
    >
      <div
        className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100"
        style={{ background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 100%)` }}
      >
        <div
          className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${T.mid} 0%, ${T.primary} 100%)`,
            boxShadow: `0 3px 8px rgba(0,86,179,0.3)`,
          }}
        >
          <Icon className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
        </div>
        {badge && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase"
            style={{ background: T.light100, color: T.primary, border: `1px solid ${T.light200}` }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Auth mode toggle ──────────────────────────────────────────────────────────

function AuthModeToggle({
  mode,
  onChange,
}: {
  mode: 'password' | 'token'
  onChange: (m: 'password' | 'token') => void
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 overflow-hidden p-0.5 gap-0.5 bg-slate-50">
      {(['password', 'token'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
          style={{
            background: mode === m ? `linear-gradient(135deg, ${T.mid} 0%, ${T.primary} 100%)` : 'transparent',
            color: mode === m ? 'white' : '#64748B',
            boxShadow: mode === m ? '0 2px 6px rgba(0,86,179,0.25)' : 'none',
          }}
        >
          {m === 'password' ? <><Lock className="h-3 w-3" /> Username / Password</> : <><Key className="h-3 w-3" /> Personal Access Token</>}
        </button>
      ))}
    </div>
  )
}

// ── Connection test bar ───────────────────────────────────────────────────────

type TestState = 'idle' | 'testing' | 'success' | 'error'

function ConnectionTestBar({
  state,
  message,
  onTest,
  canTest,
}: {
  state: TestState
  message: string
  onTest: () => void
  canTest: boolean
}) {
  return (
    <div
      className="rounded-xl border px-4 py-3 flex items-center gap-3 transition-all duration-200"
      style={{
        background: state === 'success' ? T.light50 : state === 'error' ? '#FFF5F5' : '#F8FAFC',
        borderColor: state === 'success' ? T.light200 : state === 'error' ? '#FECACA' : '#E2E8F0',
      }}
    >
      <div className="shrink-0">
        {state === 'testing' && (
          <span className="h-4 w-4 inline-block rounded-full animate-spin"
            style={{ border: `2px solid ${T.primary}`, borderTopColor: 'transparent' }} />
        )}
        {state === 'success' && <CheckCircle2 className="h-4 w-4" style={{ color: T.primary }} />}
        {state === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
        {state === 'idle' && <Wifi className="h-4 w-4 text-slate-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${state === 'error' ? 'text-red-600' : state === 'success' ? 'font-semibold' : 'text-slate-500'}`}
          style={state === 'success' ? { color: T.mid } : {}}>
          {message || 'Test credentials before starting the assessment'}
        </p>
      </div>
      <button
        type="button"
        onClick={onTest}
        disabled={!canTest || state === 'testing'}
        className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold
                   transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: canTest && state !== 'testing' ? T.primary : '#E2E8F0',
          color: canTest && state !== 'testing' ? 'white' : '#94A3B8',
          boxShadow: canTest && state !== 'testing' ? T.shadowBtn : 'none',
        }}
      >
        {state === 'testing' ? <><Spinner className="h-3 w-3" /> Testing…</> : <><Wifi className="h-3 w-3" /> Test</>}
      </button>
    </div>
  )
}

function OptionToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-150"
      style={{
        background: checked ? T.light50 : 'white',
        borderColor: checked ? T.light200 : '#E2E8F0',
      }}
    >
      <div
        className="mt-0.5 h-4 w-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-150"
        style={{ background: checked ? T.primary : 'white', borderColor: checked ? T.primary : '#CBD5E1' }}
      >
        {checked && (
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 8">
            <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M1 4l3 3 5-6" />
          </svg>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </button>
  )
}

// ── Assessment steps ──────────────────────────────────────────────────────────

const ASSESSMENT_STEPS = [
  { label: 'Server connection & site info',       icon: Globe },
  { label: 'Projects enumeration',                icon: Layers },
  { label: 'Workbooks (name, owner, size)',        icon: BarChart3 },
  { label: 'Views, sheets & dashboards',          icon: BarChart3 },
  { label: 'Published data sources',              icon: Database },
  { label: 'Users (role distribution)',           icon: Users },
  { label: 'Groups & memberships',                icon: Users },
  { label: 'Tableau Prep flows',                  icon: Zap },
  { label: 'Extract refresh schedules',           icon: RefreshCw },
  { label: 'Recent background jobs',              icon: RefreshCw },
  { label: 'Workbook permission audit (top 20)',  icon: Shield },
  { label: 'Data quality flags',                  icon: Shield },
  { label: 'Migration complexity scoring',        icon: FileText },
  { label: 'Power BI migration feasibility',      icon: FileText },
  { label: 'Excel report (12 sheets)',            icon: FileText },
  { label: 'AI-powered Word report',              icon: FileText },
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TableauAssessmentPage() {
  const navigate = useNavigate()

  const [authMode, setAuthMode] = useState<'password' | 'token'>('token')
  const [serverUrl, setServerUrl] = useState('')
  const [siteName, setSiteName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [tokenName, setTokenName] = useState('')
  const [tokenSecret, setTokenSecret] = useState('')
  const [label, setLabel] = useState('')

  const [includePermissions, setIncludePermissions] = useState(true)
  const [includeExtractHealth, setIncludeExtractHealth] = useState(true)
  const [includeFlows, setIncludeFlows] = useState(true)

  const [testState, setTestState] = useState<TestState>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showSteps, setShowSteps] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(16px)'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 400ms cubic-bezier(0,0,0.2,1), transform 400ms cubic-bezier(0,0,0.2,1)'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
  }, [])

  const coreFieldsFilled = Boolean(
    serverUrl.trim() &&
    (authMode === 'token'
      ? tokenName.trim() && tokenSecret.trim()
      : username.trim() && password.trim()),
  )

  const buildRequest = useCallback((): TableauAssessmentRequest => ({
    credentials: {
      server_url: serverUrl.trim(),
      site_name: siteName.trim() || undefined,
      ...(authMode === 'password'
        ? { username: username.trim(), password }
        : { token_name: tokenName.trim(), token_secret: tokenSecret }),
    },
    label: label.trim() || undefined,
    include_permissions: includePermissions,
    include_extract_health: includeExtractHealth,
    include_flows: includeFlows,
  }), [serverUrl, siteName, authMode, username, password, tokenName, tokenSecret, label, includePermissions, includeExtractHealth, includeFlows])

  const handleTestConnection = useCallback(async () => {
    setTestState('testing')
    setTestMessage('Connecting to Tableau Server…')
    try {
      const { data } = await api.tableauTestConnection(buildRequest())
      if (data.success) {
        setTestState('success')
        setTestMessage(data.message)
      } else {
        setTestState('error')
        setTestMessage(data.message)
      }
    } catch (err) {
      setTestState('error')
      setTestMessage(getApiErrorMessage(err))
    }
  }, [buildRequest])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data } = await api.tableauStartAssessment(buildRequest())
      navigate(`/tableau/sessions/${data.job_id}`)
    } catch (err) {
      setSubmitError(getApiErrorMessage(err))
      setSubmitting(false)
    }
  }, [buildRequest, navigate])

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto space-y-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div
          className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
          style={{
            background: '#F8FAFF',
            border: '1px solid #C5D5EC',
            boxShadow: `0 6px 20px ${T.glow}`,
          }}
        >
          <img src="/logos/tableau.svg" alt="Tableau" style={{ height: 36, width: 36 }} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Tableau Assessment</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            16-step inventory + AI-powered Power BI migration feasibility analysis
          </p>
        </div>
        <div className="ml-auto shrink-0">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: T.light100, color: T.mid, border: `1px solid ${T.light200}` }}
          >
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: T.primary, boxShadow: `0 0 5px ${T.primary}` }} />
            Tableau Server / Cloud
          </span>
        </div>
      </div>

      {/* ── What gets assessed ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 overflow-hidden" style={{ boxShadow: T.shadowCard }}>
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          style={{ background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0.5) 100%)` }}
          onClick={() => setShowSteps(!showSteps)}
        >
          <div className="flex items-center gap-2.5">
            <Zap className="h-4 w-4" style={{ color: T.primary }} />
            <span className="text-sm font-semibold text-slate-700">
              {ASSESSMENT_STEPS.length} assessment dimensions
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{showSteps ? 'Hide' : 'Show all'}</span>
            {showSteps ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </div>
        </button>
        {showSteps && (
          <div className="px-5 pb-4 border-t border-slate-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3">
              {ASSESSMENT_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-2.5 py-1.5">
                  <div className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: T.light100 }}>
                    <step.icon className="h-3 w-3" style={{ color: T.primary }} />
                  </div>
                  <span className="text-xs text-slate-600">{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Server URL ─────────────────────────────────────────────── */}
      <SectionCard title="Tableau Server" icon={Globe} badge="Required">
        <div className="space-y-4">
          <div>
            <FormLabel required>Server URL</FormLabel>
            <InputField
              icon={Globe}
              placeholder="https://tableau.acme.com  or  https://10ay.online.tableau.com"
              value={serverUrl}
              onChange={setServerUrl}
              mono
              hint="Include https://. For Tableau Cloud use your pod URL (e.g. 10ay.online.tableau.com)."
            />
          </div>
          <div>
            <FormLabel>Site Name</FormLabel>
            <InputField
              icon={Layers}
              placeholder="Leave blank for the Default site"
              value={siteName}
              onChange={setSiteName}
              mono
              hint="Case-sensitive. Matches the URL slug, e.g. /site/MySite/ → MySite."
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Auth ───────────────────────────────────────────────────── */}
      <SectionCard title="Authentication" icon={Key} badge="Required">
        <div className="space-y-4">
          <AuthModeToggle mode={authMode} onChange={setAuthMode} />

          {authMode === 'token' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>PAT Name</FormLabel>
                <InputField
                  icon={Key}
                  placeholder="my-assessment-token"
                  value={tokenName}
                  onChange={setTokenName}
                  mono
                  hint="Found in Tableau → Account Settings → Personal Access Tokens."
                />
              </div>
              <div>
                <FormLabel required>PAT Secret</FormLabel>
                <PasswordField
                  icon={Lock}
                  placeholder="Token secret value"
                  value={tokenSecret}
                  onChange={setTokenSecret}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Username</FormLabel>
                <InputField
                  icon={Users}
                  placeholder="tableau_admin"
                  value={username}
                  onChange={setUsername}
                />
              </div>
              <div>
                <FormLabel required>Password</FormLabel>
                <PasswordField
                  icon={Lock}
                  placeholder="Your Tableau password"
                  value={password}
                  onChange={setPassword}
                />
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Advanced ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 overflow-hidden" style={{ boxShadow: T.shadowCard }}>
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, rgba(255,255,255,0.5) 100%)' }}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <div className="flex items-center gap-2.5">
            <Settings2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-600">Advanced options</span>
          </div>
          {showAdvanced ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showAdvanced && (
          <div className="px-5 pb-5 border-t border-slate-100 space-y-5 pt-4">
            <div>
              <FormLabel>Label</FormLabel>
              <InputField
                icon={Tag}
                placeholder="e.g. ACME Tableau Prod Q2 2025"
                value={label}
                onChange={setLabel}
              />
            </div>
            <div className="space-y-2">
              <FormLabel>Assessment scope</FormLabel>
              <OptionToggle
                label="Include permissions audit"
                description="Sample workbook-level permissions for the top 20 workbooks (grantee, capability, mode)"
                checked={includePermissions}
                onChange={setIncludePermissions}
              />
              <OptionToggle
                label="Include extract health"
                description="Enumerate refresh schedules and recent background job success/failure rates"
                checked={includeExtractHealth}
                onChange={setIncludeExtractHealth}
              />
              <OptionToggle
                label="Include Tableau Prep flows"
                description="Enumerate all Prep flows (name, project, owner, last updated)"
                checked={includeFlows}
                onChange={setIncludeFlows}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Connection test ────────────────────────────────────────── */}
      <ConnectionTestBar
        state={testState}
        message={testMessage}
        onTest={handleTestConnection}
        canTest={!!coreFieldsFilled}
      />

      {/* ── Error ──────────────────────────────────────────────────── */}
      {submitError && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      {/* ── Submit ─────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${T.light50} 0%, white 100%)`,
          borderColor: T.light200,
          boxShadow: T.shadowCard,
        }}
      >
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Ready to assess</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Runs in the background — live progress on the next screen.
            </p>
          </div>
          <button
            type="button"
            disabled={!coreFieldsFilled || submitting}
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                       text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: coreFieldsFilled
                ? `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`
                : '#94A3B8',
              boxShadow: coreFieldsFilled ? T.shadowBtn : 'none',
            }}
            onMouseEnter={(e) => {
              if (coreFieldsFilled && !submitting) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 20px ${T.glow}`
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow = T.shadowBtn
            }}
          >
            {submitting ? <><Spinner className="h-4 w-4" /> Starting…</> : <>Start Assessment <ArrowRight className="h-4 w-4" /></>}
          </button>
        </div>
      </div>

    </div>
  )
}
