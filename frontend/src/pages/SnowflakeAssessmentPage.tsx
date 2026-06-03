import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, Globe, User, Shield, Layers,
  CheckCircle2, AlertCircle, Loader2, ArrowRight,
  Tag, Settings2, Snowflake, RefreshCw,
  ChevronDown, ChevronUp, Zap, BarChart3,
  Key, Lock, Smartphone, Hash, Cloud, FileText,
  Server, ExternalLink, Eye, EyeOff, Link2,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type {
  SnowflakeAuthMethod,
  SnowflakeAuthRequest,
  SnowflakeAuthStatusResponse,
  SnowflakeAssessmentRequest,
} from '../types/api'

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

// ── Auth state ────────────────────────────────────────────────────────────────

type AuthState = 'idle' | 'pending' | 'authenticated' | 'failed'

// ── Method metadata ───────────────────────────────────────────────────────────

type MethodMeta = {
  id: SnowflakeAuthMethod
  label: string
  desc: string
  icon: React.ElementType
  browserRequired: boolean
  group: string
}

const METHODS: MethodMeta[] = [
  { id: 'username_password',        label: 'Password',          desc: 'Username & password',        icon: Lock,         browserRequired: false, group: 'Basic'       },
  { id: 'browser_sso',              label: 'Browser SSO',       desc: 'Opens system browser',        icon: Globe,        browserRequired: true,  group: 'SSO'         },
  { id: 'browser_sso_cached',       label: 'SSO + Token Cache', desc: 'Browser with cached token',   icon: Globe,        browserRequired: true,  group: 'SSO'         },
  { id: 'mfa_push',                 label: 'MFA Push',          desc: 'Password + Duo push',         icon: Smartphone,   browserRequired: false, group: 'MFA'         },
  { id: 'mfa_totp',                 label: 'MFA TOTP',          desc: 'Password + 6-digit code',     icon: Hash,         browserRequired: false, group: 'MFA'         },
  { id: 'key_pair',                 label: 'Key-Pair JWT',      desc: 'RSA private key (headless)',   icon: Key,          browserRequired: false, group: 'Certificate' },
  { id: 'oauth_token',              label: 'OAuth Token',       desc: 'Pre-fetched access token',    icon: Zap,          browserRequired: false, group: 'OAuth'       },
  { id: 'oauth_auth_code',          label: 'OAuth Auth Code',   desc: 'PKCE browser flow',           icon: ExternalLink, browserRequired: true,  group: 'OAuth'       },
  { id: 'oauth_client_credentials', label: 'OAuth Client Creds','desc': 'Machine-to-machine flow',  icon: Server,       browserRequired: false, group: 'OAuth'       },
  { id: 'workload_identity',        label: 'Workload Identity', desc: 'Azure / AWS / GCP native',    icon: Cloud,        browserRequired: false, group: 'Platform'    },
  { id: 'toml_profile',             label: 'TOML Profile',      desc: '~/.snowflake/connections.toml',icon: FileText,    browserRequired: false, group: 'Profile'     },
]

const BROWSER_METHOD_IDS = new Set<SnowflakeAuthMethod>(['browser_sso', 'browser_sso_cached', 'oauth_auth_code'])

// ── Helper components ─────────────────────────────────────────────────────────

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: T.mid }}>
      {children}
      {required && <span className="ml-1" style={{ color: '#F87171' }}>*</span>}
    </label>
  )
}

function InputField({
  icon: Icon, placeholder, value, onChange, type = 'text',
  mono = false, disabled = false, hint, showToggle = false,
}: {
  icon?: React.ElementType; placeholder?: string; value: string
  onChange: (v: string) => void; type?: string; mono?: boolean
  disabled?: boolean; hint?: string; showToggle?: boolean
}) {
  const [show, setShow] = useState(false)
  const effectiveType = showToggle ? (show ? 'text' : 'password') : type
  return (
    <div>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon className="h-4 w-4" style={{ color: T.mid }} />
          </div>
        )}
        <input
          type={effectiveType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={[
            'w-full rounded-xl border text-sm placeholder-slate-400 py-2.5 outline-none',
            'transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
            Icon ? 'pl-10' : 'pl-3.5',
            showToggle ? 'pr-10' : 'pr-3.5',
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
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
            style={{ color: '#94A3B8' }}
            tabIndex={-1}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>{hint}</p>}
    </div>
  )
}

function TextareaField({
  icon: Icon, placeholder, value, onChange, disabled = false, hint, rows = 4,
}: {
  icon?: React.ElementType; placeholder?: string; value: string
  onChange: (v: string) => void; disabled?: boolean; hint?: string; rows?: number
}) {
  return (
    <div>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-3 pointer-events-none">
            <Icon className="h-4 w-4" style={{ color: T.mid }} />
          </div>
        )}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={[
            'w-full rounded-xl border text-sm placeholder-slate-400 py-2.5 outline-none resize-none font-mono',
            'transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
            Icon ? 'pl-10' : 'pl-3.5',
            'pr-3.5',
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

function SelectField({
  icon: Icon, value, onChange, options, disabled = false, hint,
}: {
  icon?: React.ElementType; value: string; onChange: (v: string) => void
  options: { label: string; value: string }[]; disabled?: boolean; hint?: string
}) {
  return (
    <div>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon className="h-4 w-4" style={{ color: T.mid }} />
          </div>
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={[
            'w-full rounded-xl border text-sm py-2.5 outline-none appearance-none',
            'transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
            Icon ? 'pl-10' : 'pl-3.5',
            'pr-8',
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
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <ChevronDown className="h-4 w-4" style={{ color: '#94A3B8' }} />
        </div>
      </div>
      {hint && <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>{hint}</p>}
    </div>
  )
}

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

// ── Method card ───────────────────────────────────────────────────────────────

function MethodCard({
  method, selected, onSelect, disabled,
}: {
  method: MethodMeta; selected: boolean; onSelect: () => void; disabled: boolean
}) {
  const Icon = method.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="w-full text-left p-3 rounded-xl transition-all duration-150 disabled:cursor-not-allowed"
      style={{
        background: selected ? T.light50 : 'rgba(255,255,255,0.75)',
        border: `1.5px solid ${selected ? T.primary : T.ice}`,
        boxShadow: selected ? T.shadowCard : 'none',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex items-center justify-center h-7 w-7 rounded-lg shrink-0 mt-0.5"
          style={{
            background: selected ? T.gradBtn : 'rgba(240,248,255,0.9)',
            boxShadow: selected ? T.shadowBtn : 'none',
            border: `1px solid ${selected ? 'transparent' : T.ice}`,
          }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: selected ? 'white' : T.mid }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold leading-tight" style={{ color: selected ? T.dark : '#374151' }}>
            {method.label}
          </p>
          <p className="text-[10px] mt-0.5 leading-tight" style={{ color: '#94A3B8' }}>{method.desc}</p>
          {method.browserRequired && (
            <span
              className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(251,191,36,0.12)', color: '#D97706', border: '1px solid rgba(251,191,36,0.25)' }}
            >
              Browser
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Auth status badge ─────────────────────────────────────────────────────────

function AuthStatusBadge({ state, info }: { state: AuthState; info?: SnowflakeAuthStatusResponse }) {
  const configs = {
    idle:          { bg: 'rgba(241,245,249,0.9)', text: '#64748B', border: '#E2E8F0', label: 'Not Authenticated', dot: '#94A3B8' },
    pending:       { bg: T.light50,               text: T.mid,     border: T.ice,     label: 'Connecting…',       dot: T.primary },
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

// ── Section divider ───────────────────────────────────────────────────────────

function FieldSection({ label }: { label: string }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest pt-1" style={{ color: '#94A3B8' }}>{label}</p>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SnowflakeAssessmentPage() {
  const navigate = useNavigate()

  // ── Auth method selector
  const [authMethod, setAuthMethod] = useState<SnowflakeAuthMethod>('browser_sso')

  // ── Common connection fields
  const [account, setAccount] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [database, setDatabase] = useState('')

  // ── Password-based
  const [password, setPassword] = useState('')
  const [passcode, setPasscode] = useState('')

  // ── Key-pair
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [privateKeyPassphrase, setPrivateKeyPassphrase] = useState('')

  // ── OAuth token (bring your own)
  const [oauthToken, setOauthToken] = useState('')

  // ── OAuth flows
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [oauthAuthUrl, setOauthAuthUrl] = useState('')
  const [oauthTokenUrl, setOauthTokenUrl] = useState('')
  const [oauthScope, setOauthScope] = useState('')

  // ── Workload Identity
  const [workloadProvider, setWorkloadProvider] = useState('AZURE')

  // ── TOML Profile
  const [tomlConnectionName, setTomlConnectionName] = useState('myconnection')

  // ── Auth state machine
  const [authId, setAuthId] = useState<string | null>(null)
  const [authState, setAuthState] = useState<AuthState>('idle')
  const [authInfo, setAuthInfo] = useState<SnowflakeAuthStatusResponse | undefined>()
  const [authError, setAuthError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Assessment options
  const [label, setLabel] = useState('')
  const [includeQueryHistory, setIncludeQueryHistory] = useState(true)
  const [includeStorageUsage, setIncludeStorageUsage] = useState(true)
  const [includeWarehouseMetering, setIncludeWarehouseMetering] = useState(true)
  const [maxDatabases, setMaxDatabases] = useState('10')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // ── Submission
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // Reset auth state when method changes
  function handleMethodChange(m: SnowflakeAuthMethod) {
    if (authState !== 'idle') handleReset()
    setAuthMethod(m)
  }

  function buildAuthRequest(): SnowflakeAuthRequest {
    const creds: import('../types/api').SnowflakeCredentials = { auth_method: authMethod }

    if (authMethod !== 'toml_profile') {
      if (account.trim())   creds.account   = account.trim()
      if (username.trim())  creds.username  = username.trim()
      if (role.trim())      creds.role      = role.trim()
      if (warehouse.trim()) creds.warehouse = warehouse.trim()
      if (database.trim())  creds.database  = database.trim()
    }

    if (['username_password', 'mfa_push', 'mfa_totp'].includes(authMethod)) {
      creds.password = password
    }
    if (authMethod === 'mfa_totp') {
      creds.passcode = passcode
    }
    if (authMethod === 'key_pair') {
      creds.private_key_path = privateKeyPath
      if (privateKeyPassphrase) creds.private_key_passphrase = privateKeyPassphrase
    }
    if (authMethod === 'oauth_token') {
      creds.oauth_token = oauthToken
    }
    if (['oauth_auth_code', 'oauth_client_credentials'].includes(authMethod)) {
      creds.oauth_client_id     = oauthClientId
      creds.oauth_client_secret = oauthClientSecret
      creds.oauth_token_url     = oauthTokenUrl
      if (oauthScope) creds.oauth_scope = oauthScope
      if (authMethod === 'oauth_auth_code') {
        creds.oauth_auth_url = oauthAuthUrl
      }
    }
    if (authMethod === 'workload_identity') {
      creds.workload_identity_provider = workloadProvider
    }
    if (authMethod === 'toml_profile') {
      creds.toml_connection_name = tomlConnectionName || 'myconnection'
    }

    return { credentials: creds }
  }

  function getCanStartAuth(): boolean {
    if (authState !== 'idle') return false
    switch (authMethod) {
      case 'toml_profile':             return tomlConnectionName.trim().length > 0
      case 'username_password':        return !!account.trim() && !!username.trim() && !!password
      case 'browser_sso':
      case 'browser_sso_cached':       return !!account.trim() && !!username.trim()
      case 'mfa_push':                 return !!account.trim() && !!username.trim() && !!password
      case 'mfa_totp':                 return !!account.trim() && !!username.trim() && !!password && !!passcode
      case 'key_pair':                 return !!account.trim() && !!username.trim() && !!privateKeyPath.trim()
      case 'oauth_token':              return !!account.trim() && !!username.trim() && !!oauthToken.trim()
      case 'oauth_auth_code':          return !!account.trim() && !!username.trim() && !!oauthClientId.trim() && !!oauthClientSecret.trim() && !!oauthAuthUrl.trim() && !!oauthTokenUrl.trim()
      case 'oauth_client_credentials': return !!account.trim() && !!username.trim() && !!oauthClientId.trim() && !!oauthClientSecret.trim() && !!oauthTokenUrl.trim()
      case 'workload_identity':        return !!account.trim() && !!username.trim()
      default:                         return false
    }
  }

  async function handleInitAuth() {
    if (!getCanStartAuth()) return
    setAuthError(null)
    setAuthState('pending')
    try {
      const req = buildAuthRequest()
      const res = await api.snowflakeInitAuth(req)
      const newAuthId: string = res.data.auth_id
      setAuthId(newAuthId)

      pollRef.current = setInterval(async () => {
        try {
          const status = await api.snowflakeAuthStatus(newAuthId)
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
            setAuthError(s.error || 'Authentication failed.')
          }
        } catch { /* non-fatal polling error */ }
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
      const res = await api.snowflakeAssess(req)
      navigate(`/snowflake/sessions/${res.data.job_id}`)
    } catch (err) {
      setSubmitError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const canStartAuth = getCanStartAuth()
  const canAssess = authState === 'authenticated' && !submitting
  const isBrowserMethod = BROWSER_METHOD_IDS.has(authMethod)
  const isLocked = authState === 'pending' || authState === 'authenticated'
  const currentMeta = METHODS.find(m => m.id === authMethod)!

  // ── Derived: which fields to show ─────────────────────────────────────────
  const showAccount  = authMethod !== 'toml_profile'
  const showUsername = authMethod !== 'toml_profile'
  const showPassword = ['username_password', 'mfa_push', 'mfa_totp'].includes(authMethod)
  const showPasscode = authMethod === 'mfa_totp'
  const showKeyPair  = authMethod === 'key_pair'
  const showOAuthToken = authMethod === 'oauth_token'
  const showOAuthFlows = authMethod === 'oauth_auth_code' || authMethod === 'oauth_client_credentials'
  const showAuthCodeUrl = authMethod === 'oauth_auth_code'
  const showWorkload = authMethod === 'workload_identity'
  const showToml    = authMethod === 'toml_profile'
  const showCommonOptional = authMethod !== 'toml_profile'

  return (
    <div className="min-h-screen" style={{ background: T.gradSurface }}>

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ background: T.gradHero }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute rounded-full" style={{ width: '600px', height: '600px', top: '-200px', right: '-100px', background: 'radial-gradient(circle, rgba(0,184,230,0.06) 0%, transparent 70%)' }} />
          <div className="absolute rounded-full" style={{ width: '400px', height: '400px', bottom: '-100px', left: '20%', background: 'radial-gradient(circle, rgba(0,153,204,0.05) 0%, transparent 70%)' }} />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="absolute rounded-full" style={{ width: `${4 + i * 2}px`, height: `${4 + i * 2}px`, top: `${15 + i * 12}%`, left: `${8 + i * 15}%`, background: `rgba(0,212,255,${0.08 - i * 0.01})`, boxShadow: `0 0 ${6 + i * 4}px rgba(0,212,255,0.15)` }} />
          ))}
        </div>

        <div className="relative max-w-4xl mx-auto px-6 py-10">
          <div className="flex items-center gap-4">
            <div
              className="flex items-center justify-center h-14 w-14 rounded-2xl shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(0,153,204,0.3) 0%, rgba(0,184,230,0.2) 100%)', border: '1px solid rgba(0,212,255,0.25)', boxShadow: '0 4px 24px rgba(0,184,230,0.20)', backdropFilter: 'blur(8px)' }}
            >
              <Snowflake className="h-7 w-7" style={{ color: T.accent }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,212,255,0.12)', color: T.accent, border: '1px solid rgba(0,212,255,0.20)' }}>
                  Data Cloud
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Snowflake Assessment</h1>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(176,212,232,0.85)' }}>
                Head-to-toe platform analysis — 11 authentication methods, warehouses, databases, security, cost &amp; performance
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { n: '01', icon: Shield,   label: 'Choose Auth Method', sub: '11 methods — SSO, Key-Pair, OAuth…' },
              { n: '02', icon: Settings2, label: 'Configure Scope',    sub: 'Select modules & depth' },
              { n: '03', icon: Zap,      label: 'Run Assessment',      sub: '15-step platform analysis' },
            ].map(({ n, icon: Icon, label: lbl, sub }) => (
              <div key={n} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.10)', backdropFilter: 'blur(8px)' }}>
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

        {/* ── Step 1: Authentication ───────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.96)', border: `1px solid ${T.ice}`, boxShadow: T.shadowCard }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: T.light100, background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 100%)` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: T.gradBtn, boxShadow: T.shadowBtn }}>
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: T.dark }}>Step 1 — Snowflake Authentication</h2>
                  <p className="text-[11px]" style={{ color: '#64748B' }}>Choose an authentication method and provide your credentials</p>
                </div>
              </div>
              <AuthStatusBadge state={authState} info={authInfo} />
            </div>
          </div>

          <div className="p-6 space-y-5">

            {/* ── Method selector ──────────────────────────────────────── */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#94A3B8' }}>Authentication Method</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {METHODS.map(m => (
                  <MethodCard
                    key={m.id}
                    method={m}
                    selected={authMethod === m.id}
                    onSelect={() => handleMethodChange(m.id)}
                    disabled={isLocked}
                  />
                ))}
              </div>
            </div>

            {/* ── Method-specific + common fields ──────────────────────── */}
            <div className="pt-1 border-t space-y-4" style={{ borderColor: T.light100 }}>

              {/* TOML Profile */}
              {showToml && (
                <div>
                  <FieldSection label="Profile" />
                  <div className="mt-2">
                    <FormLabel required>Connection Name</FormLabel>
                    <InputField
                      icon={FileText}
                      placeholder="myconnection"
                      value={tomlConnectionName}
                      onChange={setTomlConnectionName}
                      disabled={isLocked}
                      mono
                      hint="Named entry in ~/.snowflake/connections.toml — credentials live in that file"
                    />
                  </div>
                </div>
              )}

              {/* Account + Username */}
              {showAccount && (
                <div>
                  <FieldSection label="Account" />
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <FormLabel required>Snowflake Account Identifier</FormLabel>
                      <InputField
                        icon={Globe}
                        placeholder="myorg-myaccount  or  myaccount.us-east-1"
                        value={account}
                        onChange={setAccount}
                        disabled={isLocked}
                        hint="Format: <org>-<account>  or  <account>.<region>.aws/azure/gcp"
                      />
                    </div>
                    {showUsername && (
                      <div>
                        <FormLabel required={!isBrowserMethod ? false : true}>
                          Username{isBrowserMethod ? ' (login hint)' : ''}
                        </FormLabel>
                        <InputField
                          icon={User}
                          placeholder="your.email@company.com"
                          value={username}
                          onChange={setUsername}
                          disabled={isLocked}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Password */}
              {showPassword && (
                <div>
                  <FieldSection label="Credentials" />
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <FormLabel required>Password</FormLabel>
                      <InputField
                        icon={Lock}
                        placeholder="••••••••"
                        value={password}
                        onChange={setPassword}
                        disabled={isLocked}
                        showToggle
                      />
                    </div>
                    {showPasscode && (
                      <div>
                        <FormLabel required>TOTP Passcode</FormLabel>
                        <InputField
                          icon={Hash}
                          placeholder="123456"
                          value={passcode}
                          onChange={setPasscode}
                          disabled={isLocked}
                          mono
                          hint="6-digit code from your authenticator app"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Key-Pair */}
              {showKeyPair && (
                <div>
                  <FieldSection label="RSA Key-Pair" />
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <FormLabel required>Private Key File Path</FormLabel>
                      <InputField
                        icon={Key}
                        placeholder="/home/user/.snowflake/rsa_key.p8"
                        value={privateKeyPath}
                        onChange={setPrivateKeyPath}
                        disabled={isLocked}
                        mono
                        hint="Absolute server-side path to the PKCS#8 private key file"
                      />
                    </div>
                    <div>
                      <FormLabel>Key Passphrase (optional)</FormLabel>
                      <InputField
                        icon={Lock}
                        placeholder="Leave blank if unencrypted"
                        value={privateKeyPassphrase}
                        onChange={setPrivateKeyPassphrase}
                        disabled={isLocked}
                        showToggle
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* OAuth Token */}
              {showOAuthToken && (
                <div>
                  <FieldSection label="Access Token" />
                  <div className="mt-2">
                    <FormLabel required>OAuth Access Token</FormLabel>
                    <TextareaField
                      icon={Zap}
                      placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…"
                      value={oauthToken}
                      onChange={setOauthToken}
                      disabled={isLocked}
                      rows={3}
                      hint="Pre-fetched token from MSAL, mssparkutils.credentials.getToken(), azure-identity, etc."
                    />
                  </div>
                </div>
              )}

              {/* OAuth Flows */}
              {showOAuthFlows && (
                <div>
                  <FieldSection label="OAuth Application" />
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <FormLabel required>Client ID</FormLabel>
                      <InputField
                        icon={Link2}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        value={oauthClientId}
                        onChange={setOauthClientId}
                        disabled={isLocked}
                        mono
                      />
                    </div>
                    <div>
                      <FormLabel required>Client Secret</FormLabel>
                      <InputField
                        icon={Lock}
                        placeholder="••••••••••••••••"
                        value={oauthClientSecret}
                        onChange={setOauthClientSecret}
                        disabled={isLocked}
                        showToggle
                      />
                    </div>
                    {showAuthCodeUrl && (
                      <div className="md:col-span-2">
                        <FormLabel required>Authorization URL</FormLabel>
                        <InputField
                          icon={ExternalLink}
                          placeholder="https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
                          value={oauthAuthUrl}
                          onChange={setOauthAuthUrl}
                          disabled={isLocked}
                          mono
                          hint="IdP authorization endpoint (PKCE flow)"
                        />
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <FormLabel required>Token URL</FormLabel>
                      <InputField
                        icon={Server}
                        placeholder="https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
                        value={oauthTokenUrl}
                        onChange={setOauthTokenUrl}
                        disabled={isLocked}
                        mono
                        hint="IdP token endpoint"
                      />
                    </div>
                    <div>
                      <FormLabel>Scope (optional)</FormLabel>
                      <InputField
                        icon={Shield}
                        placeholder="session:role:SYSADMIN"
                        value={oauthScope}
                        onChange={setOauthScope}
                        disabled={isLocked}
                        mono
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Workload Identity */}
              {showWorkload && (
                <div>
                  <FieldSection label="Cloud Provider" />
                  <div className="mt-2 w-64">
                    <FormLabel required>Identity Provider</FormLabel>
                    <SelectField
                      icon={Cloud}
                      value={workloadProvider}
                      onChange={setWorkloadProvider}
                      disabled={isLocked}
                      options={[
                        { value: 'AZURE', label: 'Azure (Managed Identity)' },
                        { value: 'AWS',   label: 'AWS (IAM Role / IRSA)' },
                        { value: 'GCP',   label: 'GCP (Workload Identity)' },
                        { value: 'OIDC',  label: 'Generic OIDC' },
                      ]}
                      hint="The connector auto-fetches short-lived credentials — no secrets needed"
                    />
                  </div>
                </div>
              )}

              {/* Common optional: Role, Warehouse, Database */}
              {showCommonOptional && (
                <div>
                  <FieldSection label="Connection Defaults (optional)" />
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <FormLabel>Default Role</FormLabel>
                      <InputField
                        icon={Shield}
                        placeholder="ACCOUNTADMIN"
                        value={role}
                        onChange={setRole}
                        disabled={isLocked}
                      />
                    </div>
                    <div>
                      <FormLabel>Default Warehouse</FormLabel>
                      <InputField
                        icon={Zap}
                        placeholder="COMPUTE_WH"
                        value={warehouse}
                        onChange={setWarehouse}
                        disabled={isLocked}
                      />
                    </div>
                    <div>
                      <FormLabel>Default Database</FormLabel>
                      <InputField
                        icon={Database}
                        placeholder="ANALYTICS"
                        value={database}
                        onChange={setDatabase}
                        disabled={isLocked}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Auth error ────────────────────────────────────────────── */}
            {authError && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl text-sm" style={{ background: 'rgba(254,242,242,0.9)', border: '1px solid #FECACA', color: '#DC2626' }}>
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Authentication failed</p>
                  <p className="text-xs mt-0.5 opacity-80">{authError}</p>
                  {(authError.includes('390190') || authError.toLowerCase().includes('saml')) && (
                    <div className="mt-2 text-xs space-y-1" style={{ color: '#7F1D1D' }}>
                      <p className="font-semibold">SAML / SSO identifier mismatch — try one of:</p>
                      <ul className="list-disc ml-4 space-y-0.5">
                        <li>Use <strong>org-account format</strong>: <code>{'<orgname>-<accountname>'}</code></li>
                        <li>Run <code>SELECT CURRENT_ORGANIZATION_NAME(), CURRENT_ACCOUNT_NAME();</code> in Snowsight</li>
                        <li>Use your full <strong>email address</strong> in the Username field</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Auth success banner ───────────────────────────────────── */}
            {authState === 'authenticated' && authInfo && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl text-sm" style={{ background: 'rgba(236,253,245,0.9)', border: '1px solid #A7F3D0', color: '#065F46' }}>
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#10B981' }} />
                <div className="flex-1">
                  <p className="font-semibold">Connected to Snowflake</p>
                  <p className="text-xs mt-0.5 opacity-80">
                    Account: <strong>{authInfo.account}</strong>
                    {authInfo.current_user && <> · User: <strong>{authInfo.current_user}</strong></>}
                    {authInfo.current_role && <> · Role: <strong>{authInfo.current_role}</strong></>}
                    {authInfo.auth_method && <> · Method: <strong>{authInfo.auth_method}</strong></>}
                  </p>
                </div>
              </div>
            )}

            {/* ── Auth actions ──────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
              {authState === 'idle' && (
                <button
                  onClick={handleInitAuth}
                  disabled={!canStartAuth}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: T.gradBtn, boxShadow: canStartAuth ? T.shadowBtn : 'none' }}
                  onMouseEnter={(e) => canStartAuth && (e.currentTarget.style.boxShadow = T.shadowBtnH)}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = T.shadowBtn)}
                >
                  <currentMeta.icon className="h-4 w-4" />
                  {isBrowserMethod ? 'Login via Browser' : `Connect with ${currentMeta.label}`}
                </button>
              )}
              {authState === 'pending' && (
                <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: T.light100, color: T.mid }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isBrowserMethod ? 'Waiting for browser authentication…' : 'Connecting to Snowflake…'}
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
                  Reset &amp; Re-authenticate
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
          <div className="px-6 py-4 border-b" style={{ borderColor: T.light100, background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 100%)` }}>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: authState === 'authenticated' ? T.gradBtn : '#E2E8F0', boxShadow: authState === 'authenticated' ? T.shadowBtn : 'none' }}>
                <Settings2 className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold" style={{ color: T.dark }}>Step 2 — Assessment Configuration</h2>
                <p className="text-[11px]" style={{ color: '#64748B' }}>Configure scope and modules to include in the analysis</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <FormLabel>Assessment Label</FormLabel>
              <InputField
                icon={Tag}
                placeholder="e.g. Production Snowflake Q3 2025 Assessment"
                value={label}
                onChange={setLabel}
              />
            </div>

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
            style={{ background: canAssess ? T.gradBtn : '#94A3B8', boxShadow: canAssess ? T.shadowBtn : 'none' }}
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
