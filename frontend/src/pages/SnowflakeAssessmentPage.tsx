import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, Globe, User, Shield, Layers,
  CheckCircle2, AlertCircle, Loader2, ArrowRight,
  Tag, Settings2, Snowflake, RefreshCw, Key,
  ChevronDown, ChevronUp, Zap, BarChart3,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { SnowflakeAuthRequest, SnowflakeAuthStatusResponse, SnowflakeAssessmentRequest } from '../types/api'

// ── Ocean design tokens ───────────────────────────────────────────────────────

const T = {
  primary:    '#00B8E6',
  dark:       '#0A1628',
  mid:        '#0099CC',
  accent:     '#00D4FF',
  surface:    '#EBF4FF',
  light50:    '#F0F8FF',
  light100:   '#E0F2FF',
  ice:        '#B8D4E8',
  glow:       'rgba(0,184,230,0.18)',
  glowDeep:   'rgba(0,153,204,0.25)',
  shadowCard: '0 2px 4px rgba(0,184,230,0.05), 0 8px 32px rgba(0,184,230,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowHover:'0 4px 12px rgba(0,184,230,0.10), 0 20px 48px rgba(0,184,230,0.12), 0 2px 4px rgba(0,0,0,0.06)',
  shadowBtn:  '0 2px 12px rgba(0,184,230,0.40), inset 0 1px 0 rgba(255,255,255,0.22)',
  shadowBtnH: '0 4px 20px rgba(0,184,230,0.55), inset 0 1px 0 rgba(255,255,255,0.22)',
  gradHero:   'linear-gradient(135deg, #0A1628 0%, #0D2040 50%, #102848 100%)',
  gradSurface:'linear-gradient(180deg, #F0F8FF 0%, #E8F4FF 100%)',
  gradBtn:    'linear-gradient(135deg, #0099CC 0%, #00B8E6 60%, #00D4FF 100%)',
}

// ── Auth state machine ────────────────────────────────────────────────────────

type AuthState = 'idle' | 'pending' | 'authenticated' | 'failed'

// ── FormLabel ─────────────────────────────────────────────────────────────────

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: T.mid }}>
      {children}
      {required && <span className="ml-1" style={{ color: '#F87171' }}>*</span>}
    </label>
  )
}

// ── InputField ────────────────────────────────────────────────────────────────

function InputField({
  icon: Icon, placeholder, value, onChange, type = 'text',
  mono = false, disabled = false, hint,
}: {
  icon?: React.ElementType; placeholder?: string; value: string
  onChange: (v: string) => void; type?: string; mono?: boolean
  disabled?: boolean; hint?: string
}) {
  return (
    <div>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon className="h-4 w-4" style={{ color: T.mid }} />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={[
            'w-full rounded-xl border text-sm placeholder-slate-400 py-2.5 outline-none',
            'transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
            Icon ? 'pl-10' : 'pl-3.5',
            'pr-3.5',
            mono ? 'font-mono' : '',
          ].join(' ')}
          style={{
            background: disabled ? 'rgba(240,248,255,0.5)' : 'rgba(255,255,255,0.95)',
            borderColor: T.ice,
            color: T.dark,
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = T.primary
            e.currentTarget.style.boxShadow = `0 0 0 3px ${T.glow}, inset 0 1px 2px rgba(0,0,0,0.03)`
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = T.ice
            e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.03)'
          }}
        />
      </div>
      {hint && <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>{hint}</p>}
    </div>
  )
}

// ── Toggle option ─────────────────────────────────────────────────────────────

function ToggleOpt({
  label, description, checked, onChange, disabled = false,
}: {
  label: string; description: string; checked: boolean
  onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <label
      className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150"
      style={{
        background: checked ? T.light50 : 'transparent',
        border: `1px solid ${checked ? T.ice : 'transparent'}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        className="mt-0.5 h-4.5 w-4.5 rounded flex items-center justify-center shrink-0 transition-all duration-150"
        style={{
          width: '18px', height: '18px',
          background: checked ? T.gradBtn : 'white',
          border: `2px solid ${checked ? T.primary : T.ice}`,
          boxShadow: checked ? T.shadowBtn : 'none',
        }}
      >
        {checked && <CheckCircle2 className="h-2.5 w-2.5 text-white" style={{ height: '11px', width: '11px' }} />}
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: T.dark }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{description}</p>
      </div>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
      />
    </label>
  )
}

// ── Auth status indicator ─────────────────────────────────────────────────────

function AuthStatusBadge({ state, info }: { state: AuthState; info?: SnowflakeAuthStatusResponse }) {
  const configs = {
    idle:          { bg: 'rgba(241,245,249,0.9)', text: '#64748B', border: '#E2E8F0', label: 'Not Authenticated', dot: '#94A3B8' },
    pending:       { bg: T.light50,               text: T.mid,     border: T.ice,     label: 'Browser Auth in Progress…', dot: T.primary },
    authenticated: { bg: 'rgba(236,253,245,0.9)', text: '#059669', border: '#A7F3D0', label: info?.current_user ? `Authenticated as ${info.current_user}` : 'Authenticated', dot: '#10B981' },
    failed:        { bg: 'rgba(254,242,242,0.9)', text: '#DC2626', border: '#FECACA', label: 'Authentication Failed', dot: '#EF4444' },
  }
  const c = configs[state]
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      <div
        className="h-2 w-2 rounded-full shrink-0"
        style={{
          background: c.dot,
          boxShadow: state === 'pending' ? `0 0 8px ${c.dot}` : state === 'authenticated' ? '0 0 6px rgba(16,185,129,0.6)' : 'none',
          animation: state === 'pending' ? 'pulse 1.5s infinite' : 'none',
        }}
      />
      <span>{c.label}</span>
      {state === 'pending' && <Loader2 className="h-3.5 w-3.5 animate-spin ml-0.5" />}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SnowflakeAssessmentPage() {
  const navigate = useNavigate()

  // Auth fields
  const [account, setAccount] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [database, setDatabase] = useState('')

  // Auth state
  const [authId, setAuthId] = useState<string | null>(null)
  const [authState, setAuthState] = useState<AuthState>('idle')
  const [authInfo, setAuthInfo] = useState<SnowflakeAuthStatusResponse | undefined>()
  const [authError, setAuthError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Assessment options
  const [label, setLabel] = useState('')
  const [includeQueryHistory, setIncludeQueryHistory] = useState(true)
  const [includeStorageUsage, setIncludeStorageUsage] = useState(true)
  const [includeWarehouseMetering, setIncludeWarehouseMetering] = useState(true)
  const [maxDatabases, setMaxDatabases] = useState('10')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Cleanup poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function handleInitAuth() {
    if (!account.trim()) return
    setAuthError(null)
    setAuthState('pending')

    try {
      const req: SnowflakeAuthRequest = {
        credentials: {
          account: account.trim(),
          username: username.trim() || undefined,
          role: role.trim() || undefined,
          warehouse: warehouse.trim() || undefined,
          database: database.trim() || undefined,
        },
      }
      const res = await api.post('/api/v1/snowflake/init-auth', req)
      const newAuthId: string = res.data.auth_id
      setAuthId(newAuthId)

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.get<SnowflakeAuthStatusResponse>(`/api/v1/snowflake/auth-status/${newAuthId}`)
          const s = status.data
          if (s.status === 'authenticated') {
            clearInterval(pollRef.current!)
            pollRef.current = null
            setAuthState('authenticated')
            setAuthInfo(s)
          } else if (s.status === 'failed') {
            clearInterval(pollRef.current!)
            pollRef.current = null
            setAuthState('failed')
            setAuthError(s.error || 'Browser authentication failed.')
          }
        } catch {
          // non-fatal polling error
        }
      }, 2000)

    } catch (err) {
      setAuthState('failed')
      setAuthError(getApiErrorMessage(err))
    }
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    setAuthId(null)
    setAuthState('idle')
    setAuthInfo(undefined)
    setAuthError(null)
  }

  async function handleStartAssessment() {
    if (!authId || authState !== 'authenticated') return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const req: SnowflakeAssessmentRequest = {
        auth_id: authId,
        label: label.trim() || undefined,
        include_query_history: includeQueryHistory,
        include_storage_usage: includeStorageUsage,
        include_warehouse_metering: includeWarehouseMetering,
        max_databases: parseInt(maxDatabases, 10) || 10,
      }
      const res = await api.post('/api/v1/snowflake/assess', req)
      navigate(`/snowflake/sessions/${res.data.job_id}`)
    } catch (err) {
      setSubmitError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const canStartAuth = account.trim().length > 0 && authState === 'idle'
  const canAssess = authState === 'authenticated' && !submitting

  return (
    <div className="min-h-screen" style={{ background: T.gradSurface }}>
      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ background: T.gradHero }}
      >
        {/* Animated ocean rings */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className="absolute rounded-full"
            style={{
              width: '600px', height: '600px',
              top: '-200px', right: '-100px',
              background: 'radial-gradient(circle, rgba(0,184,230,0.06) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: '400px', height: '400px',
              bottom: '-100px', left: '20%',
              background: 'radial-gradient(circle, rgba(0,153,204,0.05) 0%, transparent 70%)',
            }}
          />
          {/* Snowflake crystalline dots */}
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${4 + i * 2}px`,
                height: `${4 + i * 2}px`,
                top: `${15 + i * 12}%`,
                left: `${8 + i * 15}%`,
                background: `rgba(0,212,255,${0.08 - i * 0.01})`,
                boxShadow: `0 0 ${6 + i * 4}px rgba(0,212,255,0.15)`,
              }}
            />
          ))}
        </div>

        <div className="relative max-w-4xl mx-auto px-6 py-10">
          <div className="flex items-center gap-4">
            <div
              className="flex items-center justify-center h-14 w-14 rounded-2xl shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(0,153,204,0.3) 0%, rgba(0,184,230,0.2) 100%)',
                border: '1px solid rgba(0,212,255,0.25)',
                boxShadow: `0 4px 24px rgba(0,184,230,0.20)`,
                backdropFilter: 'blur(8px)',
              }}
            >
              <Snowflake className="h-7 w-7" style={{ color: T.accent }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,212,255,0.12)', color: T.accent, border: '1px solid rgba(0,212,255,0.20)' }}
                >
                  Data Cloud
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Snowflake Assessment</h1>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(176,212,232,0.85)' }}>
                Head-to-toe platform analysis via browser OAuth — warehouses, databases, security, cost and performance
              </p>
            </div>
          </div>

          {/* Steps overview */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { n: '01', icon: Shield, label: 'Browser Login', sub: 'SSO / OAuth via system browser' },
              { n: '02', icon: Settings2, label: 'Configure Scope', sub: 'Select modules & depth' },
              { n: '03', icon: Zap, label: 'Run Assessment', sub: '15-step platform analysis' },
            ].map(({ n, icon: Icon, label: lbl, sub }) => (
              <div
                key={n}
                className="rounded-xl p-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(0,212,255,0.10)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono font-bold" style={{ color: 'rgba(0,212,255,0.5)' }}>{n}</span>
                  <Icon className="h-3.5 w-3.5" style={{ color: T.accent }} />
                </div>
                <p className="text-xs font-semibold text-white">{lbl}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(176,212,232,0.7)' }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Wave separator */}
      <div className="h-6 overflow-hidden" style={{ background: T.gradHero }}>
        <svg viewBox="0 0 1440 24" fill="none" preserveAspectRatio="none" style={{ width: '100%', height: '24px' }}>
          <path d="M0 0 Q360 24 720 12 Q1080 0 1440 20 L1440 24 L0 24Z" fill="#EBF4FF" />
        </svg>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── Step 1: Browser Auth ─────────────────────────────────────── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.96)',
            border: `1px solid ${T.ice}`,
            boxShadow: T.shadowCard,
          }}
        >
          <div
            className="px-6 py-4 border-b"
            style={{ borderColor: T.light100, background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 100%)` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: T.gradBtn, boxShadow: T.shadowBtn }}
                >
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: T.dark }}>Step 1 — Snowflake Authentication</h2>
                  <p className="text-[11px]" style={{ color: '#64748B' }}>Enter your account identifier and click Login — your browser will open for SSO</p>
                </div>
              </div>
              <AuthStatusBadge state={authState} info={authInfo} />
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <FormLabel required>Snowflake Account Identifier</FormLabel>
                <InputField
                  icon={Globe}
                  placeholder="myorg-myaccount  or  myaccount.us-east-1"
                  value={account}
                  onChange={setAccount}
                  disabled={authState === 'pending' || authState === 'authenticated'}
                  hint="Format: <org>-<account>  or  <account>.<region>.aws/azure/gcp"
                />
              </div>
              <div>
                <FormLabel>Username (optional)</FormLabel>
                <InputField
                  icon={User}
                  placeholder="Login hint for SSO"
                  value={username}
                  onChange={setUsername}
                  disabled={authState === 'pending' || authState === 'authenticated'}
                />
              </div>
              <div>
                <FormLabel>Default Role (optional)</FormLabel>
                <InputField
                  icon={Shield}
                  placeholder="e.g. ACCOUNTADMIN, SYSADMIN"
                  value={role}
                  onChange={setRole}
                  disabled={authState === 'pending' || authState === 'authenticated'}
                />
              </div>
              <div>
                <FormLabel>Default Warehouse (optional)</FormLabel>
                <InputField
                  icon={Zap}
                  placeholder="e.g. COMPUTE_WH"
                  value={warehouse}
                  onChange={setWarehouse}
                  disabled={authState === 'pending' || authState === 'authenticated'}
                />
              </div>
              <div>
                <FormLabel>Default Database (optional)</FormLabel>
                <InputField
                  icon={Database}
                  placeholder="e.g. ANALYTICS"
                  value={database}
                  onChange={setDatabase}
                  disabled={authState === 'pending' || authState === 'authenticated'}
                />
              </div>
            </div>

            {/* Auth error */}
            {authError && (
              <div
                className="flex items-start gap-3 p-3.5 rounded-xl text-sm"
                style={{ background: 'rgba(254,242,242,0.9)', border: '1px solid #FECACA', color: '#DC2626' }}
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Authentication failed</p>
                  <p className="text-xs mt-0.5 opacity-80">{authError}</p>
                </div>
              </div>
            )}

            {/* Auth success banner */}
            {authState === 'authenticated' && authInfo && (
              <div
                className="flex items-start gap-3 p-3.5 rounded-xl text-sm"
                style={{ background: 'rgba(236,253,245,0.9)', border: '1px solid #A7F3D0', color: '#065F46' }}
              >
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#10B981' }} />
                <div className="flex-1">
                  <p className="font-semibold">Connected to Snowflake</p>
                  <p className="text-xs mt-0.5 opacity-80">
                    Account: <strong>{authInfo.account}</strong>
                    {authInfo.current_user && <> · User: <strong>{authInfo.current_user}</strong></>}
                    {authInfo.current_role && <> · Role: <strong>{authInfo.current_role}</strong></>}
                  </p>
                </div>
              </div>
            )}

            {/* Auth actions */}
            <div className="flex items-center gap-3">
              {authState === 'idle' && (
                <button
                  onClick={handleInitAuth}
                  disabled={!canStartAuth}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: T.gradBtn,
                    boxShadow: canStartAuth ? T.shadowBtn : 'none',
                  }}
                  onMouseEnter={(e) => canStartAuth && (e.currentTarget.style.boxShadow = T.shadowBtnH)}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = T.shadowBtn)}
                >
                  <Snowflake className="h-4 w-4" />
                  Login with Snowflake Browser
                </button>
              )}
              {authState === 'pending' && (
                <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: T.light100, color: T.mid }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for browser authentication…
                </div>
              )}
              {(authState === 'authenticated' || authState === 'failed') && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
                  style={{ background: T.light50, color: T.mid, border: `1px solid ${T.ice}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.light100 }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = T.light50 }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset & Re-login
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Step 2: Assessment Options ──────────────────────────────── */}
        <div
          className="rounded-2xl overflow-hidden transition-all duration-300"
          style={{
            background: authState === 'authenticated' ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.6)',
            border: `1px solid ${authState === 'authenticated' ? T.ice : '#E2E8F0'}`,
            boxShadow: authState === 'authenticated' ? T.shadowCard : 'none',
            opacity: authState === 'authenticated' ? 1 : 0.55,
            pointerEvents: authState === 'authenticated' ? 'auto' : 'none',
          }}
        >
          <div
            className="px-6 py-4 border-b"
            style={{ borderColor: T.light100, background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 100%)` }}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: authState === 'authenticated' ? T.gradBtn : '#E2E8F0', boxShadow: authState === 'authenticated' ? T.shadowBtn : 'none' }}
              >
                <Settings2 className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold" style={{ color: T.dark }}>Step 2 — Assessment Configuration</h2>
                <p className="text-[11px]" style={{ color: '#64748B' }}>Configure scope and modules to include in the analysis</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Label */}
            <div>
              <FormLabel>Assessment Label</FormLabel>
              <InputField
                icon={Tag}
                placeholder="e.g. Production Snowflake Q3 2025 Assessment"
                value={label}
                onChange={setLabel}
              />
            </div>

            {/* ACCOUNT_USAGE modules */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>ACCOUNT_USAGE Modules</p>
              <p className="text-xs mb-3" style={{ color: '#64748B' }}>
                These require ACCOUNTADMIN or SNOWFLAKE.ACCOUNT_USAGE access. Non-fatal if unavailable.
              </p>
              <div className="space-y-1.5">
                <ToggleOpt
                  label="Query Performance Metrics"
                  description="7-day query history: avg/P95 latency, bytes scanned, spill, top slow queries"
                  checked={includeQueryHistory}
                  onChange={setIncludeQueryHistory}
                />
                <ToggleOpt
                  label="Storage Usage"
                  description="Storage, stage and failsafe bytes from STORAGE_USAGE"
                  checked={includeStorageUsage}
                  onChange={setIncludeStorageUsage}
                />
                <ToggleOpt
                  label="Warehouse Credit Metering"
                  description="30-day credit consumption: compute vs cloud services, top warehouses by cost"
                  checked={includeWarehouseMetering}
                  onChange={setIncludeWarehouseMetering}
                />
              </div>
            </div>

            {/* Advanced */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-xs font-semibold transition-colors duration-150"
                style={{ color: T.mid }}
              >
                {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Advanced Options
              </button>
              {showAdvanced && (
                <div className="mt-3 pt-4 border-t" style={{ borderColor: T.light100 }}>
                  <div>
                    <FormLabel>Max Databases to Enumerate</FormLabel>
                    <div className="w-48">
                      <InputField
                        icon={Layers}
                        placeholder="10"
                        value={maxDatabases}
                        onChange={setMaxDatabases}
                        hint="Schemas and tables are fetched for up to N databases (1–50)"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {submitError && (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#DC2626' }}>
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}
          </div>
          <button
            onClick={handleStartAssessment}
            disabled={!canAssess}
            className="flex items-center gap-2.5 px-7 py-3 rounded-2xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: canAssess ? T.gradBtn : '#94A3B8',
              boxShadow: canAssess ? T.shadowBtn : 'none',
            }}
            onMouseEnter={(e) => canAssess && (e.currentTarget.style.boxShadow = T.shadowBtnH)}
            onMouseLeave={(e) => canAssess && (e.currentTarget.style.boxShadow = T.shadowBtn)}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting assessment…
              </>
            ) : (
              <>
                <BarChart3 className="h-4 w-4" />
                Start Snowflake Assessment
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
