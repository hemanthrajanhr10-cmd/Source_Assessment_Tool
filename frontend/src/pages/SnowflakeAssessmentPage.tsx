import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, Globe, User, Shield, Layers,
  CheckCircle2, AlertCircle, Loader2, ArrowRight,
  Tag, Settings2, RefreshCw,
  ChevronDown, ChevronUp, Zap, BarChart3,
  Key, Lock, Smartphone, Hash, Cloud, FileText,
  Server, ExternalLink, Eye, EyeOff, Link2,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { SnowflakeFullLogo } from '../components/ui/SourceLogos'
import type {
  SnowflakeAuthMethod,
  SnowflakeAuthRequest,
  SnowflakeAuthStatusResponse,
  SnowflakeAssessmentRequest,
} from '../types/api'

// ── Ocean design tokens ───────────────────────────────────────────────────────

const D = {
  bg:          '#EFF6FF',
  surface:     '#FFFFFF',
  surface2:    '#F8FAFF',
  surface3:    '#EFF6FF',
  border:      '#C5D5EC',
  borderFaint: '#DDE8F5',
  amber:       '#29B5E8',
  amberDim:    '#0099CC',
  amberGlow:   'rgba(41,181,232,0.15)',
  amberFaint:  'rgba(41,181,232,0.07)',
  textPrimary: '#0D1117',
  textSecond:  '#404555',
  textMuted:   '#767A8C',
  green:       '#059669',
  greenDim:    'rgba(5,150,105,0.10)',
  red:         '#DC2626',
  redDim:      'rgba(220,38,38,0.08)',
  blue:        '#0056B3',
  blueDim:     'rgba(0,86,179,0.10)',
  shadowCard:  '0 1px 3px rgba(0,86,179,0.04), 0 4px 16px rgba(0,86,179,0.06)',
  shadowHover: '0 4px 12px rgba(0,86,179,0.08), 0 16px 40px rgba(0,86,179,0.10)',
  shadowAmber: '0 2px 12px rgba(41,181,232,0.30)',
  fontSyne:    'inherit',
  fontDM:      'inherit',
  fontMono:    '"JetBrains Mono", "Fira Code", monospace',
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
  { id: 'username_password',        label: 'Password',           desc: 'Username & password',          icon: Lock,         browserRequired: false, group: 'Basic'       },
  { id: 'browser_sso',              label: 'Browser SSO',        desc: 'Opens system browser',          icon: Globe,        browserRequired: true,  group: 'SSO'         },
  { id: 'browser_sso_cached',       label: 'SSO + Cache',        desc: 'Browser with cached token',     icon: Globe,        browserRequired: true,  group: 'SSO'         },
  { id: 'mfa_push',                 label: 'MFA Push',           desc: 'Password + Duo push',           icon: Smartphone,   browserRequired: false, group: 'MFA'         },
  { id: 'mfa_totp',                 label: 'MFA TOTP',           desc: 'Password + 6-digit code',       icon: Hash,         browserRequired: false, group: 'MFA'         },
  { id: 'key_pair',                 label: 'Key-Pair JWT',       desc: 'RSA private key (headless)',     icon: Key,          browserRequired: false, group: 'Certificate' },
  { id: 'oauth_token',              label: 'OAuth Token',        desc: 'Pre-fetched access token',      icon: Zap,          browserRequired: false, group: 'OAuth'       },
  { id: 'oauth_auth_code',          label: 'OAuth Auth Code',    desc: 'PKCE browser flow',             icon: ExternalLink, browserRequired: true,  group: 'OAuth'       },
  { id: 'oauth_client_credentials', label: 'OAuth Client Creds', desc: 'Machine-to-machine flow',       icon: Server,       browserRequired: false, group: 'OAuth'       },
  { id: 'workload_identity',        label: 'Workload Identity',  desc: 'Azure / AWS / GCP native',      icon: Cloud,        browserRequired: false, group: 'Platform'    },
  { id: 'toml_profile',             label: 'TOML Profile',       desc: '~/.snowflake/connections.toml', icon: FileText,     browserRequired: false, group: 'Profile'     },
]

const BROWSER_METHOD_IDS = new Set<SnowflakeAuthMethod>(['browser_sso', 'browser_sso_cached', 'oauth_auth_code'])

// ── Form input components ─────────────────────────────────────────────────────

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{
      display: 'block', fontSize: 10, fontFamily: D.fontDM, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em', color: D.textMuted,
      marginBottom: 6,
    }}>
      {children}
      {required && <span style={{ color: D.red, marginLeft: 3 }}>*</span>}
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
  const [focused, setFocused] = useState(false)
  const effectiveType = showToggle ? (show ? 'text' : 'password') : type

  return (
    <div>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <div style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}>
            <Icon style={{ width: 14, height: 14, color: focused ? D.amber : D.textMuted }} />
          </div>
        )}
        <input
          type={effectiveType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: `9px ${showToggle ? 36 : 12}px 9px ${Icon ? 36 : 12}px`,
            borderRadius: 9, fontSize: 13,
            fontFamily: mono ? D.fontMono : D.fontDM,
            background: disabled ? D.borderFaint : D.surface2,
            border: `1px solid ${focused ? D.amber : D.border}`,
            color: D.textPrimary,
            outline: 'none',
            boxShadow: focused ? `0 0 0 3px ${D.amberGlow}` : 'none',
            transition: 'all 0.15s ease',
            opacity: disabled ? 0.5 : 1,
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: D.textMuted, display: 'flex', alignItems: 'center',
            }}
            tabIndex={-1}
          >
            {show
              ? <EyeOff style={{ width: 14, height: 14 }} />
              : <Eye style={{ width: 14, height: 14 }} />
            }
          </button>
        )}
      </div>
      {hint && (
        <p style={{ fontSize: 10, fontFamily: D.fontDM, color: D.textMuted, marginTop: 4 }}>{hint}</p>
      )}
    </div>
  )
}

function TextareaField({
  icon: Icon, placeholder, value, onChange, disabled = false, hint, rows = 4,
}: {
  icon?: React.ElementType; placeholder?: string; value: string
  onChange: (v: string) => void; disabled?: boolean; hint?: string; rows?: number
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <div style={{ position: 'absolute', left: 12, top: 11, pointerEvents: 'none' }}>
            <Icon style={{ width: 14, height: 14, color: focused ? D.amber : D.textMuted }} />
          </div>
        )}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: `9px 12px 9px ${Icon ? 36 : 12}px`,
            borderRadius: 9, fontSize: 12, fontFamily: D.fontMono,
            background: disabled ? D.borderFaint : D.surface2,
            border: `1px solid ${focused ? D.amber : D.border}`,
            color: D.textPrimary, outline: 'none', resize: 'none',
            boxShadow: focused ? `0 0 0 3px ${D.amberGlow}` : 'none',
            transition: 'all 0.15s ease',
            opacity: disabled ? 0.5 : 1,
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
      {hint && <p style={{ fontSize: 10, fontFamily: D.fontDM, color: D.textMuted, marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

function SelectField({
  icon: Icon, value, onChange, options, disabled = false, hint,
}: {
  icon?: React.ElementType; value: string; onChange: (v: string) => void
  options: { label: string; value: string }[]; disabled?: boolean; hint?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon style={{ width: 14, height: 14, color: focused ? D.amber : D.textMuted }} />
          </div>
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: `9px 32px 9px ${Icon ? 36 : 12}px`,
            borderRadius: 9, fontSize: 13, fontFamily: D.fontDM,
            background: disabled ? D.borderFaint : D.surface2,
            border: `1px solid ${focused ? D.amber : D.border}`,
            color: D.textPrimary, outline: 'none', appearance: 'none',
            boxShadow: focused ? `0 0 0 3px ${D.amberGlow}` : 'none',
            transition: 'all 0.15s ease',
            opacity: disabled ? 0.5 : 1,
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <ChevronDown style={{ width: 13, height: 13, color: D.textMuted }} />
        </div>
      </div>
      {hint && <p style={{ fontSize: 10, fontFamily: D.fontDM, color: D.textMuted, marginTop: 4 }}>{hint}</p>}
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
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
      background: checked ? D.amberFaint : 'transparent',
      border: `1px solid ${checked ? D.amber + '33' : D.borderFaint}`,
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.15s ease',
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: checked ? `linear-gradient(135deg, ${D.amberDim}, ${D.amber})` : D.surface3,
        border: `2px solid ${checked ? D.amber : D.border}`,
        boxShadow: checked ? D.shadowAmber : 'none',
        transition: 'all 0.15s ease',
      }}>
        {checked && <CheckCircle2 style={{ width: 10, height: 10, color: '#ffffff' }} />}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontFamily: D.fontDM, fontWeight: 600, color: D.textPrimary }}>{label}</p>
        <p style={{ fontSize: 11, fontFamily: D.fontDM, color: D.textMuted, marginTop: 2 }}>{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
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
  const [hov, setHov] = useState(false)
  const Icon = method.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      style={{
        width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10,
        background: selected ? D.amberFaint : hov ? D.surface2 : D.surface,
        border: `1.5px solid ${selected ? D.amber : hov ? D.border : D.borderFaint}`,
        boxShadow: selected ? D.shadowAmber : hov ? D.shadowCard : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: selected ? `linear-gradient(135deg, ${D.amberDim}, ${D.amber})` : D.surface3,
          boxShadow: selected ? D.shadowAmber : 'none',
          border: `1px solid ${selected ? 'transparent' : D.border}`,
          transition: 'all 0.15s ease',
        }}>
          <Icon style={{ width: 13, height: 13, color: selected ? '#ffffff' : D.textSecond }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 12, fontFamily: D.fontDM, fontWeight: 700,
            color: selected ? D.amber : D.textPrimary, lineHeight: 1.2 }}>
            {method.label}
          </p>
          <p style={{ fontSize: 10, fontFamily: D.fontDM, color: D.textMuted, marginTop: 2 }}>{method.desc}</p>
          {method.browserRequired && (
            <span style={{
              display: 'inline-block', marginTop: 4, fontSize: 9, fontFamily: D.fontDM,
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              padding: '2px 6px', borderRadius: 4,
              background: D.amberFaint, color: D.amberDim,
              border: `1px solid ${D.amber}33`,
            }}>
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
  const cfg = {
    idle:          { bg: D.borderFaint,  text: D.textMuted,   border: D.border,       dot: D.textMuted,  label: 'Not Connected' },
    pending:       { bg: D.amberFaint,   text: D.amber,        border: D.amber+'33',   dot: D.amber,      label: 'Connecting…' },
    authenticated: { bg: D.greenDim,     text: D.green,        border: D.green+'33',   dot: D.green,      label: info?.current_user ? `${info.current_user}` : 'Authenticated' },
    failed:        { bg: D.redDim,       text: D.red,          border: D.red+'33',     dot: D.red,        label: 'Failed' },
  }[state]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', borderRadius: 8, fontSize: 12,
      fontFamily: D.fontDM, fontWeight: 600,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0,
        boxShadow: state === 'pending' ? `0 0 8px ${D.amber}` : state === 'authenticated' ? `0 0 6px ${D.green}` : 'none',
      }} />
      {cfg.label}
      {state === 'pending' && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
    </div>
  )
}

// ── Section divider label ─────────────────────────────────────────────────────

function FieldSection({ label }: { label: string }) {
  return (
    <p style={{ fontSize: 10, fontFamily: D.fontDM, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em', color: D.textMuted, paddingTop: 4 }}>
      {label}
    </p>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: 14, overflow: 'hidden', boxShadow: D.shadowCard, ...style,
    }}>
      {children}
    </div>
  )
}

function CardHeader({ icon: Icon, step, title, sub, badge }: {
  icon: React.ElementType; step: string; title: string; sub: string; badge?: React.ReactNode
}) {
  return (
    <div style={{
      padding: '16px 24px', borderBottom: `1px solid ${D.borderFaint}`,
      background: `linear-gradient(135deg, ${D.surface2} 0%, ${D.surface} 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(135deg, ${D.amberDim}, ${D.amber})`,
          boxShadow: D.shadowAmber,
        }}>
          <Icon style={{ width: 16, height: 16, color: '#ffffff' }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
            <span style={{ fontSize: 9, fontFamily: D.fontMono, fontWeight: 700,
              color: D.amberDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {step}
            </span>
          </div>
          <h2 style={{ fontSize: 14, fontFamily: D.fontSyne, fontWeight: 700, color: D.textPrimary, margin: 0 }}>
            {title}
          </h2>
          <p style={{ fontSize: 11, fontFamily: D.fontDM, color: D.textMuted, marginTop: 1 }}>{sub}</p>
        </div>
      </div>
      {badge}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SnowflakeAssessmentPage() {
  const navigate = useNavigate()

  const [authMethod, setAuthMethod] = useState<SnowflakeAuthMethod>('browser_sso')

  const [account, setAccount] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [database, setDatabase] = useState('')
  const [password, setPassword] = useState('')
  const [passcode, setPasscode] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [privateKeyPassphrase, setPrivateKeyPassphrase] = useState('')
  const [oauthToken, setOauthToken] = useState('')
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [oauthAuthUrl, setOauthAuthUrl] = useState('')
  const [oauthTokenUrl, setOauthTokenUrl] = useState('')
  const [oauthScope, setOauthScope] = useState('')
  const [workloadProvider, setWorkloadProvider] = useState('AZURE')
  const [tomlConnectionName, setTomlConnectionName] = useState('myconnection')

  const [authId, setAuthId] = useState<string | null>(null)
  const [authState, setAuthState] = useState<AuthState>('idle')
  const [authInfo, setAuthInfo] = useState<SnowflakeAuthStatusResponse | undefined>()
  const [authError, setAuthError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [label, setLabel] = useState('')
  const [includeQueryHistory, setIncludeQueryHistory] = useState(true)
  const [includeStorageUsage, setIncludeStorageUsage] = useState(true)
  const [includeWarehouseMetering, setIncludeWarehouseMetering] = useState(true)
  const [includeLoginHistory, setIncludeLoginHistory] = useState(true)
  const [includeAccessHistory, setIncludeAccessHistory] = useState(true)
  const [includeGovernance, setIncludeGovernance] = useState(true)
  const [includeIntegrations, setIncludeIntegrations] = useState(true)
  const [maxDatabases, setMaxDatabases] = useState('10')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

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
    if (['username_password', 'mfa_push', 'mfa_totp'].includes(authMethod)) creds.password = password
    if (authMethod === 'mfa_totp') creds.passcode = passcode
    if (authMethod === 'key_pair') {
      creds.private_key_path = privateKeyPath
      if (privateKeyPassphrase) creds.private_key_passphrase = privateKeyPassphrase
    }
    if (authMethod === 'oauth_token') creds.oauth_token = oauthToken
    if (['oauth_auth_code', 'oauth_client_credentials'].includes(authMethod)) {
      creds.oauth_client_id     = oauthClientId
      creds.oauth_client_secret = oauthClientSecret
      creds.oauth_token_url     = oauthTokenUrl
      if (oauthScope) creds.oauth_scope = oauthScope
      if (authMethod === 'oauth_auth_code') creds.oauth_auth_url = oauthAuthUrl
    }
    if (authMethod === 'workload_identity') creds.workload_identity_provider = workloadProvider
    if (authMethod === 'toml_profile') creds.toml_connection_name = tomlConnectionName || 'myconnection'
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
      const res = await api.snowflakeInitAuth(buildAuthRequest())
      const newAuthId: string = res.data.auth_id
      setAuthId(newAuthId)
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.snowflakeAuthStatus(newAuthId)
          const s = status.data
          if (s.status === 'authenticated') {
            clearInterval(pollRef.current!); pollRef.current = null
            setAuthState('authenticated'); setAuthInfo(s)
          } else if (s.status === 'failed') {
            clearInterval(pollRef.current!); pollRef.current = null
            setAuthState('failed'); setAuthError(s.error || 'Authentication failed.')
          }
        } catch { /* non-fatal */ }
      }, 2000)
    } catch (err) {
      setAuthState('failed'); setAuthError(getApiErrorMessage(err))
    }
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    setAuthId(null); setAuthState('idle')
    setAuthInfo(undefined); setAuthError(null)
  }

  async function handleStartAssessment() {
    if (!authId || authState !== 'authenticated') return
    setSubmitting(true); setSubmitError(null)
    try {
      const req: SnowflakeAssessmentRequest = {
        auth_id: authId,
        label: label.trim() || undefined,
        include_query_history: includeQueryHistory,
        include_storage_usage: includeStorageUsage,
        include_warehouse_metering: includeWarehouseMetering,
        include_login_history: includeLoginHistory,
        include_access_history: includeAccessHistory,
        include_governance: includeGovernance,
        include_integrations: includeIntegrations,
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

  const canStartAuth   = getCanStartAuth()
  const canAssess      = authState === 'authenticated' && !submitting
  const isBrowserMethod = BROWSER_METHOD_IDS.has(authMethod)
  const isLocked       = authState === 'pending' || authState === 'authenticated'
  const currentMeta    = METHODS.find(m => m.id === authMethod)!

  const showAccount      = authMethod !== 'toml_profile'
  const showUsername     = authMethod !== 'toml_profile'
  const showPassword     = ['username_password', 'mfa_push', 'mfa_totp'].includes(authMethod)
  const showPasscode     = authMethod === 'mfa_totp'
  const showKeyPair      = authMethod === 'key_pair'
  const showOAuthToken   = authMethod === 'oauth_token'
  const showOAuthFlows   = authMethod === 'oauth_auth_code' || authMethod === 'oauth_client_credentials'
  const showAuthCodeUrl  = authMethod === 'oauth_auth_code'
  const showWorkload     = authMethod === 'workload_identity'
  const showToml         = authMethod === 'toml_profile'
  const showCommonOpt    = authMethod !== 'toml_profile'

  const G: React.CSSProperties = { display: 'grid' }

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEEFF 100%)',
        borderBottom: `1px solid ${D.border}`,
      }}>
        <div style={{
          position: 'absolute', width: 700, height: 700, top: -350, right: -200,
          borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(41,181,232,0.06) 0%, transparent 60%)',
        }} />

        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 32px 28px' }}>
          {/* Logo — full wordmark, anchored left */}
          <div style={{ marginBottom: 16 }}>
            <SnowflakeFullLogo height={40} />
          </div>

          {/* Category badge */}
          <div style={{ marginBottom: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20,
              background: D.amberFaint, color: D.amberDim, border: `1px solid ${D.amber}33`,
            }}>
              Data Cloud
            </span>
          </div>

          {/* Title + description */}
          <h1 style={{ fontSize: 24, fontWeight: 800, color: D.textPrimary, margin: 0, lineHeight: 1.2 }}>
            Snowflake Assessment
          </h1>
          <p style={{ fontSize: 12, color: D.textMuted, marginTop: 6, lineHeight: 1.6 }}>
            11 authentication methods · 22-step analysis · warehouses, security, cost, performance, governance
          </p>

          {/* Step indicators */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
            {[
              { n: '01', Icon: Shield,    label: 'Authenticate',     sub: '11 methods — SSO, Key-Pair, OAuth' },
              { n: '02', Icon: Settings2, label: 'Configure Scope',  sub: 'Modules, depth, label' },
              { n: '03', Icon: Zap,       label: 'Run Assessment',   sub: '22-step platform analysis' },
            ].map(({ n, Icon, label: lbl, sub }) => (
              <div key={n} style={{
                padding: '12px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.72)', border: `1px solid ${D.border}`,
                backdropFilter: 'blur(4px)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: D.amberDim, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                  <Icon style={{ width: 12, height: 12, color: D.amber }} />
                </div>
                <p style={{ fontSize: 12, fontWeight: 700, color: D.textPrimary, margin: 0 }}>{lbl}</p>
                <p style={{ fontSize: 10, color: D.textMuted, marginTop: 2 }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Step 1: Authentication ──────────────────────────────────── */}
        <Card>
          <CardHeader
            icon={Shield} step="Step 01"
            title="Snowflake Authentication"
            sub="Choose an authentication method and provide credentials"
            badge={<AuthStatusBadge state={authState} info={authInfo} />}
          />

          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* method grid */}
            <div>
              <p style={{ fontSize: 10, fontFamily: D.fontDM, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em', color: D.textMuted, marginBottom: 10 }}>
                Authentication Method
              </p>
              <div style={{ ...G, gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {METHODS.map(m => (
                  <MethodCard
                    key={m.id} method={m}
                    selected={authMethod === m.id}
                    onSelect={() => handleMethodChange(m.id)}
                    disabled={isLocked}
                  />
                ))}
              </div>
            </div>

            {/* divider */}
            <div style={{ borderTop: `1px solid ${D.borderFaint}`, paddingTop: 4 }} />

            {/* TOML Profile */}
            {showToml && (
              <div>
                <FieldSection label="Profile" />
                <div style={{ marginTop: 8, maxWidth: 360 }}>
                  <FormLabel required>Connection Name</FormLabel>
                  <InputField
                    icon={FileText} placeholder="myconnection"
                    value={tomlConnectionName} onChange={setTomlConnectionName}
                    disabled={isLocked} mono
                    hint="Named entry in ~/.snowflake/connections.toml"
                  />
                </div>
              </div>
            )}

            {/* Account + Username */}
            {showAccount && (
              <div>
                <FieldSection label="Account" />
                <div style={{ ...G, gridTemplateColumns: showUsername ? '1fr 1fr' : '1fr', gap: 16, marginTop: 8 }}>
                  <div style={{ gridColumn: showUsername ? '1 / 3' : undefined }}>
                    <FormLabel required>Snowflake Account Identifier</FormLabel>
                    <InputField
                      icon={Globe} placeholder="myorg-myaccount  or  myaccount.us-east-1"
                      value={account} onChange={setAccount} disabled={isLocked}
                      hint="Format: org-account  or  account.region.aws|azure|gcp"
                    />
                  </div>
                  {showUsername && (
                    <div>
                      <FormLabel required={isBrowserMethod}>
                        Username{isBrowserMethod ? ' (login hint)' : ''}
                      </FormLabel>
                      <InputField
                        icon={User} placeholder="your.email@company.com"
                        value={username} onChange={setUsername} disabled={isLocked}
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
                <div style={{ ...G, gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
                  <div>
                    <FormLabel required>Password</FormLabel>
                    <InputField
                      icon={Lock} placeholder="••••••••"
                      value={password} onChange={setPassword}
                      disabled={isLocked} showToggle
                    />
                  </div>
                  {showPasscode && (
                    <div>
                      <FormLabel required>TOTP Passcode</FormLabel>
                      <InputField
                        icon={Hash} placeholder="123456"
                        value={passcode} onChange={setPasscode}
                        disabled={isLocked} mono
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
                <div style={{ ...G, gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
                  <div style={{ gridColumn: '1 / 3' }}>
                    <FormLabel required>Private Key File Path</FormLabel>
                    <InputField
                      icon={Key} placeholder="/home/user/.snowflake/rsa_key.p8"
                      value={privateKeyPath} onChange={setPrivateKeyPath}
                      disabled={isLocked} mono
                      hint="Absolute server-side path to the PKCS#8 private key file"
                    />
                  </div>
                  <div>
                    <FormLabel>Key Passphrase (optional)</FormLabel>
                    <InputField
                      icon={Lock} placeholder="Leave blank if unencrypted"
                      value={privateKeyPassphrase} onChange={setPrivateKeyPassphrase}
                      disabled={isLocked} showToggle
                    />
                  </div>
                </div>
              </div>
            )}

            {/* OAuth Token */}
            {showOAuthToken && (
              <div>
                <FieldSection label="Access Token" />
                <div style={{ marginTop: 8 }}>
                  <FormLabel required>OAuth Access Token</FormLabel>
                  <TextareaField
                    icon={Zap} placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…"
                    value={oauthToken} onChange={setOauthToken}
                    disabled={isLocked} rows={3}
                    hint="Pre-fetched token from MSAL, azure-identity, mssparkutils, etc."
                  />
                </div>
              </div>
            )}

            {/* OAuth Flows */}
            {showOAuthFlows && (
              <div>
                <FieldSection label="OAuth Application" />
                <div style={{ ...G, gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
                  <div>
                    <FormLabel required>Client ID</FormLabel>
                    <InputField
                      icon={Link2} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={oauthClientId} onChange={setOauthClientId}
                      disabled={isLocked} mono
                    />
                  </div>
                  <div>
                    <FormLabel required>Client Secret</FormLabel>
                    <InputField
                      icon={Lock} placeholder="••••••••••••••••"
                      value={oauthClientSecret} onChange={setOauthClientSecret}
                      disabled={isLocked} showToggle
                    />
                  </div>
                  {showAuthCodeUrl && (
                    <div style={{ gridColumn: '1 / 3' }}>
                      <FormLabel required>Authorization URL</FormLabel>
                      <InputField
                        icon={ExternalLink}
                        placeholder="https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
                        value={oauthAuthUrl} onChange={setOauthAuthUrl}
                        disabled={isLocked} mono hint="IdP authorization endpoint (PKCE flow)"
                      />
                    </div>
                  )}
                  <div style={{ gridColumn: '1 / 3' }}>
                    <FormLabel required>Token URL</FormLabel>
                    <InputField
                      icon={Server}
                      placeholder="https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
                      value={oauthTokenUrl} onChange={setOauthTokenUrl}
                      disabled={isLocked} mono hint="IdP token endpoint"
                    />
                  </div>
                  <div>
                    <FormLabel>Scope (optional)</FormLabel>
                    <InputField
                      icon={Shield} placeholder="session:role:SYSADMIN"
                      value={oauthScope} onChange={setOauthScope}
                      disabled={isLocked} mono
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Workload Identity */}
            {showWorkload && (
              <div>
                <FieldSection label="Cloud Provider" />
                <div style={{ marginTop: 8, maxWidth: 300 }}>
                  <FormLabel required>Identity Provider</FormLabel>
                  <SelectField
                    icon={Cloud} value={workloadProvider} onChange={setWorkloadProvider}
                    disabled={isLocked}
                    options={[
                      { value: 'AZURE', label: 'Azure (Managed Identity)' },
                      { value: 'AWS',   label: 'AWS (IAM Role / IRSA)' },
                      { value: 'GCP',   label: 'GCP (Workload Identity)' },
                      { value: 'OIDC',  label: 'Generic OIDC' },
                    ]}
                    hint="Connector auto-fetches short-lived credentials — no secrets needed"
                  />
                </div>
              </div>
            )}

            {/* Common optional */}
            {showCommonOpt && (
              <div>
                <FieldSection label="Connection Defaults (optional)" />
                <div style={{ ...G, gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 8 }}>
                  <div>
                    <FormLabel>Default Role</FormLabel>
                    <InputField icon={Shield} placeholder="ACCOUNTADMIN"
                      value={role} onChange={setRole} disabled={isLocked} />
                  </div>
                  <div>
                    <FormLabel>Default Warehouse</FormLabel>
                    <InputField icon={Zap} placeholder="COMPUTE_WH"
                      value={warehouse} onChange={setWarehouse} disabled={isLocked} />
                  </div>
                  <div>
                    <FormLabel>Default Database</FormLabel>
                    <InputField icon={Database} placeholder="ANALYTICS"
                      value={database} onChange={setDatabase} disabled={isLocked} />
                  </div>
                </div>
              </div>
            )}

            {/* Auth error */}
            {authError && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 16px', borderRadius: 10, fontSize: 12,
                fontFamily: D.fontDM, background: D.redDim,
                border: `1px solid ${D.red}33`, color: D.red,
              }}>
                <AlertCircle style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                <div>
                  <p style={{ fontWeight: 700, marginBottom: 2 }}>Authentication failed</p>
                  <p style={{ opacity: 0.85 }}>{authError}</p>
                  {(authError.includes('390190') || authError.toLowerCase().includes('saml')) && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${D.red}33` }}>
                      <p style={{ fontWeight: 700, marginBottom: 4 }}>SAML / SSO identifier mismatch — try one of:</p>
                      <ul style={{ paddingLeft: 16, margin: 0 }}>
                        <li>Use org-account format: {'<orgname>-<accountname>'}</li>
                        <li>Run SELECT CURRENT_ORGANIZATION_NAME(), CURRENT_ACCOUNT_NAME(); in Snowsight</li>
                        <li>Use your full email address in the Username field</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Auth success */}
            {authState === 'authenticated' && authInfo && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 16px', borderRadius: 10, fontSize: 12,
                fontFamily: D.fontDM, background: D.greenDim,
                border: `1px solid ${D.green}33`, color: D.green,
              }}>
                <CheckCircle2 style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                <div>
                  <p style={{ fontWeight: 700, marginBottom: 2 }}>Connected to Snowflake</p>
                  <p style={{ opacity: 0.85 }}>
                    Account: {authInfo.account}
                    {authInfo.current_user && ` · User: ${authInfo.current_user}`}
                    {authInfo.current_role && ` · Role: ${authInfo.current_role}`}
                    {authInfo.auth_method  && ` · Method: ${authInfo.auth_method}`}
                  </p>
                </div>
              </div>
            )}

            {/* Auth actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {authState === 'idle' && (
                <button
                  onClick={handleInitAuth}
                  disabled={!canStartAuth}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 22px', borderRadius: 10, fontSize: 13,
                    fontFamily: D.fontDM, fontWeight: 700, cursor: canStartAuth ? 'pointer' : 'not-allowed',
                    background: canStartAuth
                      ? `linear-gradient(135deg, ${D.amberDim}, ${D.amber})`
                      : D.surface3,
                    color: canStartAuth ? '#ffffff' : D.textMuted,
                    border: 'none',
                    boxShadow: canStartAuth ? D.shadowAmber : 'none',
                    opacity: canStartAuth ? 1 : 0.5,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <currentMeta.icon style={{ width: 15, height: 15 }} />
                  {isBrowserMethod ? 'Login via Browser' : `Connect with ${currentMeta.label}`}
                </button>
              )}
              {authState === 'pending' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 22px', borderRadius: 10, fontSize: 13,
                  fontFamily: D.fontDM, fontWeight: 600,
                  background: D.amberFaint, color: D.amber,
                  border: `1px solid ${D.amber}33`,
                }}>
                  <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                  {isBrowserMethod ? 'Waiting for browser authentication…' : 'Connecting to Snowflake…'}
                </div>
              )}
              {(authState === 'authenticated' || authState === 'failed') && (
                <button
                  onClick={handleReset}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 18px', borderRadius: 10, fontSize: 13,
                    fontFamily: D.fontDM, fontWeight: 600, cursor: 'pointer',
                    background: D.surface2, color: D.textSecond,
                    border: `1px solid ${D.border}`, boxShadow: D.shadowCard,
                  }}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} />
                  Reset &amp; Re-authenticate
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* ── Step 2: Assessment Configuration ────────────────────────── */}
        <Card style={{
          opacity: authState === 'authenticated' ? 1 : 0.45,
          pointerEvents: authState === 'authenticated' ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}>
          <CardHeader
            icon={Settings2} step="Step 02"
            title="Assessment Configuration"
            sub="Configure modules and scope for the analysis"
          />

          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <FormLabel>Assessment Label</FormLabel>
              <InputField
                icon={Tag} placeholder="e.g. Production Snowflake Q3 2025 Assessment"
                value={label} onChange={setLabel}
              />
            </div>

            <div>
              <p style={{ fontSize: 10, fontFamily: D.fontDM, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em', color: D.textMuted, marginBottom: 6 }}>
                ACCOUNT_USAGE Modules
              </p>
              <p style={{ fontSize: 11, fontFamily: D.fontDM, color: D.textMuted, marginBottom: 10 }}>
                Requires ACCOUNTADMIN or SNOWFLAKE.ACCOUNT_USAGE access. Non-fatal if unavailable.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ToggleOpt label="Query Performance Metrics"
                  description="7-day query history: avg/P95 latency, bytes scanned, spill, partition %, top slow queries"
                  checked={includeQueryHistory} onChange={setIncludeQueryHistory} />
                <ToggleOpt label="Storage Usage & Trends"
                  description="Table, stage and failsafe bytes with 30-day daily trend"
                  checked={includeStorageUsage} onChange={setIncludeStorageUsage} />
                <ToggleOpt label="Warehouse Credit Metering"
                  description="30-day compute vs cloud services credits, per-warehouse and per-service-type breakdown"
                  checked={includeWarehouseMetering} onChange={setIncludeWarehouseMetering} />
                <ToggleOpt label="Login History"
                  description="30-day logins: total, failed, unique users, client types, failure reasons"
                  checked={includeLoginHistory} onChange={setIncludeLoginHistory} />
                <ToggleOpt label="Access History"
                  description="30-day object access events, distinct objects, top users by access count"
                  checked={includeAccessHistory} onChange={setIncludeAccessHistory} />
                <ToggleOpt label="Governance Policies"
                  description="Projection, aggregation, authentication, password and session policies; tags inventory"
                  checked={includeGovernance} onChange={setIncludeGovernance} />
                <ToggleOpt label="Integrations & Alerts"
                  description="Storage, notification, security, API and catalog integrations; alerts inventory; replication groups"
                  checked={includeIntegrations} onChange={setIncludeIntegrations} />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 11, fontFamily: D.fontDM, fontWeight: 600, color: D.textSecond,
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                {showAdvanced
                  ? <ChevronUp style={{ width: 13, height: 13 }} />
                  : <ChevronDown style={{ width: 13, height: 13 }} />}
                Advanced Options
              </button>
              {showAdvanced && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${D.borderFaint}` }}>
                  <div style={{ maxWidth: 200 }}>
                    <FormLabel>Max Databases to Enumerate</FormLabel>
                    <InputField
                      icon={Layers} placeholder="10"
                      value={maxDatabases} onChange={setMaxDatabases}
                      hint="Schemas and tables fetched for up to N databases (1–50)"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ── Submit ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
          <div>
            {submitError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                fontFamily: D.fontDM, color: D.red,
              }}>
                <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                {submitError}
              </div>
            )}
          </div>
          <button
            onClick={handleStartAssessment}
            disabled={!canAssess}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 28px', borderRadius: 12, fontSize: 14,
              fontFamily: D.fontDM, fontWeight: 700, cursor: canAssess ? 'pointer' : 'not-allowed',
              background: canAssess
                ? `linear-gradient(135deg, ${D.amberDim}, ${D.amber})`
                : D.surface3,
              color: canAssess ? '#ffffff' : D.textMuted,
              border: 'none',
              boxShadow: canAssess ? D.shadowAmber : 'none',
              opacity: canAssess ? 1 : 0.5,
              transition: 'all 0.15s ease',
            }}
          >
            {submitting ? (
              <>
                <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                Starting assessment…
              </>
            ) : (
              <>
                <BarChart3 style={{ width: 16, height: 16 }} />
                Start Snowflake Assessment
                <ArrowRight style={{ width: 15, height: 15 }} />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
