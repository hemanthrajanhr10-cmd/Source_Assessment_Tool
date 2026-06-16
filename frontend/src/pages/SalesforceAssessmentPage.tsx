import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, CheckCircle, XCircle, Loader2, AlertTriangle,
  Key, User, Zap, Shield, Database, BarChart3,
  Globe, Settings2, Code2, Package, ChevronRight, Info,
} from 'lucide-react'
import axios from 'axios'
import { SalesforceFullLogo } from '../components/ui/SourceLogos'
import type {
  SalesforceAuthMethod,
  SalesforceApiScope,
  SalesforceCredentials,
  SalesforceAssessmentRequest,
} from '../types/api'

// ── Salesforce brand theme — Cloud Blue ───────────────────────────────────────
const T = {
  primary:     '#0176D3',
  mid:         '#0A5FA8',
  accent:      '#1B96FF',
  accentLight: '#D9EDFF',
  dark:        '#032D60',
  darkMid:     '#0176D3',
  surface:     '#F3F8FE',
  light50:     '#F3F8FE',
  light100:    '#D9EDFF',
  light200:    '#AACBFF',
  ice:         '#57A3FD',
  text:        '#032D60',
  textMid:     '#0176D3',
  glow:        'rgba(1,118,211,0.16)',
  glowDeep:    'rgba(1,118,211,0.28)',
  shadowCard:  '0 1px 3px rgba(1,118,211,0.06), 0 4px 16px rgba(1,118,211,0.08)',
  shadowHover: '0 4px 12px rgba(1,118,211,0.14), 0 16px 48px rgba(1,118,211,0.10)',
  shadowBtn:   '0 2px 12px rgba(1,118,211,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
  gradHero:    'linear-gradient(135deg, #F3F8FE 0%, #D9EDFF 100%)',
  gradSurface: 'linear-gradient(180deg, #F3F8FE 0%, #D9EDFF 100%)',
  gradBtn:     'linear-gradient(135deg, #0176D3 0%, #1B96FF 100%)',
}

type AuthState = 'idle' | 'testing' | 'ok' | 'failed'

interface MethodMeta {
  id: SalesforceAuthMethod
  label: string
  desc: string
  icon: React.ElementType
}

const METHODS: MethodMeta[] = [
  {
    id: 'username_password',
    label: 'Username + Password',
    desc: 'Standard Salesforce credentials with optional security token',
    icon: User,
  },
  {
    id: 'oauth_client_credentials',
    label: 'OAuth Client Credentials',
    desc: 'Connected App client_id + client_secret (server-to-server)',
    icon: Key,
  },
  {
    id: 'connected_app_token',
    label: 'Access Token / Session ID',
    desc: 'Pre-issued access token or session ID from an existing OAuth flow',
    icon: Shield,
  },
]

interface ApiCard {
  scope: SalesforceApiScope
  label: string
  tagline: string
  icon: React.ElementType
  color: string
  checks: string[]
}

const API_CARDS: ApiCard[] = [
  {
    scope: 'rest_api',
    label: 'REST API',
    tagline: 'sObjects · SOQL · Organisation metadata',
    icon: Globe,
    color: '#0176D3',
    checks: ['Org info', 'sObject inventory', 'Platform events', 'Named credentials'],
  },
  {
    scope: 'metadata_api',
    label: 'Metadata API',
    tagline: 'Custom objects · Fields · Validation rules · Layouts',
    icon: Database,
    color: '#0A5FA8',
    checks: ['Custom objects', 'Custom fields', 'Validation rules', 'Record types', 'Page layouts'],
  },
  {
    scope: 'tooling_api',
    label: 'Tooling API',
    tagline: 'Apex · Flows · Coverage · Debug logs',
    icon: Code2,
    color: '#1B96FF',
    checks: ['Apex classes', 'Apex triggers', 'Test coverage', 'Flow inventory', 'Workflow rules'],
  },
  {
    scope: 'bulk_api',
    label: 'Bulk API v2',
    tagline: 'Ingest jobs · Query jobs · Data volume signals',
    icon: Package,
    color: '#032D60',
    checks: ['Ingest job history', 'Query job history', 'Failed job audit'],
  },
  {
    scope: 'analytics_api',
    label: 'Analytics (Connect API)',
    tagline: 'Reports · Dashboards · Einstein Analytics',
    icon: BarChart3,
    color: '#57A3FD',
    checks: ['Report count', 'Dashboard count'],
  },
  {
    scope: 'security',
    label: 'Security',
    tagline: 'Users · Profiles · Permission sets · Roles',
    icon: Shield,
    color: '#0A5FA8',
    checks: ['Active / inactive users', 'Profile count', 'Permission sets', 'Role hierarchy'],
  },
  {
    scope: 'automation',
    label: 'Automation',
    tagline: 'Flows · Process Builder · Workflow rules',
    icon: Zap,
    color: '#1B96FF',
    checks: ['Active flows', 'Inactive Process Builders', 'Legacy workflow rules'],
  },
  {
    scope: 'integration',
    label: 'Integrations',
    tagline: 'Connected apps · Named credentials · Platform events',
    icon: Settings2,
    color: '#0176D3',
    checks: ['Connected apps', 'Named credentials', 'Platform event objects'],
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: T.text, marginBottom: '6px', letterSpacing: '0.02em' }}>
      {children}
      {required && <span style={{ color: T.primary, marginLeft: '3px' }}>*</span>}
    </label>
  )
}

function InputField({
  label, required, value, onChange, placeholder, hint, type = 'text',
  icon: Icon, showToggle,
}: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void
  placeholder?: string; hint?: string; type?: string; icon?: React.ElementType; showToggle?: boolean
}) {
  const [show, setShow] = useState(false)
  const inputType = showToggle ? (show ? 'text' : 'password') : type

  return (
    <div style={{ marginBottom: '16px' }}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <Icon style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            width: '15px', height: '15px', color: T.mid, pointerEvents: 'none',
          }} />
        )}
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: `10px ${showToggle ? '40px' : '12px'} 10px ${Icon ? '36px' : '12px'}`,
            border: `1.5px solid ${T.light200}`,
            borderRadius: '10px',
            fontSize: '13.5px',
            color: T.dark,
            background: '#fff',
            outline: 'none',
            transition: 'border-color 180ms, box-shadow 180ms',
          }}
          onFocus={e => {
            e.target.style.borderColor = T.primary
            e.target.style.boxShadow = `0 0 0 3px ${T.glow}`
          }}
          onBlur={e => {
            e.target.style.borderColor = T.light200
            e.target.style.boxShadow = 'none'
          }}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{
              position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: T.mid, padding: '2px',
            }}
          >
            {show ? <EyeOff style={{ width: '15px', height: '15px' }} /> : <Eye style={{ width: '15px', height: '15px' }} />}
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{hint}</p>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SalesforceAssessmentPage() {
  const navigate = useNavigate()
  const [authMethod, setAuthMethod] = useState<SalesforceAuthMethod>('username_password')

  // Credential fields
  const [instanceUrl,    setInstanceUrl]    = useState('')
  const [apiVersion,     setApiVersion]     = useState('59.0')
  const [username,       setUsername]       = useState('')
  const [password,       setPassword]       = useState('')
  const [securityToken,  setSecurityToken]  = useState('')
  const [clientId,       setClientId]       = useState('')
  const [clientSecret,   setClientSecret]   = useState('')
  const [accessToken,    setAccessToken]    = useState('')

  // Assessment options
  const [label,       setLabel]      = useState('')
  const [maxObjects,  setMaxObjects] = useState(500)
  const [selectedScopes, setSelectedScopes] = useState<Set<SalesforceApiScope>>(
    new Set(API_CARDS.map(c => c.scope))
  )

  const [authState,    setAuthState]    = useState<AuthState>('idle')
  const [orgInfo,      setOrgInfo]      = useState<{ org_name?: string; org_type?: string; org_id?: string } | null>(null)
  const [authError,    setAuthError]    = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')

  const token = () => localStorage.getItem('sat_token') || ''

  function buildCredentials(): SalesforceCredentials {
    const base: SalesforceCredentials = {
      auth_method:  authMethod,
      instance_url: instanceUrl.trim(),
      api_version:  apiVersion.trim() || '59.0',
    }
    if (authMethod === 'username_password') {
      base.username       = username.trim() || undefined
      base.password       = password || undefined
      base.security_token = securityToken || undefined
    } else if (authMethod === 'oauth_client_credentials') {
      base.client_id     = clientId.trim() || undefined
      base.client_secret = clientSecret || undefined
    } else {
      base.access_token = accessToken || undefined
    }
    return base
  }

  function toggleScope(scope: SalesforceApiScope) {
    setSelectedScopes(prev => {
      const next = new Set(prev)
      next.has(scope) ? next.delete(scope) : next.add(scope)
      return next
    })
  }

  async function handleTestConnection() {
    if (!instanceUrl.trim()) { setAuthError('Instance URL is required.'); return }
    setAuthState('testing')
    setAuthError('')
    setOrgInfo(null)
    try {
      const resp = await axios.post(
        '/api/v1/salesforce/test-connection',
        { credentials: buildCredentials() },
        { headers: { Authorization: `Bearer ${token()}` } },
      )
      const org = resp.data?.org || {}
      setOrgInfo({ org_name: org.org_name, org_type: org.org_type, org_id: org.org_id })
      setAuthState('ok')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail || 'Connection failed — check credentials and instance URL.'
      setAuthError(msg)
      setAuthState('failed')
    }
  }

  async function handleSubmit() {
    if (authState !== 'ok') {
      setSubmitError('Please verify the connection before running the assessment.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const payload: SalesforceAssessmentRequest = {
        credentials: buildCredentials(),
        label:        label.trim() || undefined,
        api_scopes:   Array.from(selectedScopes),
        max_objects:  maxObjects,
        include_objects:       selectedScopes.has('metadata_api') || selectedScopes.has('rest_api'),
        include_fields:        selectedScopes.has('metadata_api'),
        include_relationships: selectedScopes.has('metadata_api'),
        include_validation:    selectedScopes.has('metadata_api'),
        include_apex:          selectedScopes.has('tooling_api'),
        include_flows:         selectedScopes.has('automation') || selectedScopes.has('tooling_api'),
        include_security:      selectedScopes.has('security'),
        include_bulk:          selectedScopes.has('bulk_api'),
        include_analytics:     selectedScopes.has('analytics_api'),
        include_integrations:  selectedScopes.has('integration'),
      }
      const resp = await axios.post('/api/v1/salesforce/assess', payload, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      navigate(`/salesforce/sessions/${resp.data.job_id}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail || 'Failed to start assessment.'
      setSubmitError(msg)
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.gradSurface }}>

      {/* Hero header */}
      <div style={{ background: T.gradHero, borderBottom: `1px solid ${T.light100}`, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', width: 700, height: 700, top: -350, right: -200,
          borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(1,118,211,0.06) 0%, transparent 60%)',
        }} />

        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '32px 32px 28px' }}>
          <div style={{ marginBottom: 16 }}>
            <SalesforceFullLogo height={38} />
          </div>

          <div style={{ marginBottom: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20,
              background: 'rgba(1,118,211,0.08)', color: T.dark, border: '1px solid rgba(1,118,211,0.20)',
            }}>
              CRM · Cloud Platform
            </span>
          </div>

          <h1 style={{ color: T.dark, fontSize: 24, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
            Salesforce Assessment
          </h1>
          <p style={{ color: T.textMid, fontSize: 12, margin: 0, marginTop: 6, lineHeight: 1.6 }}>
            8 API surfaces · 10 domains · REST, Metadata, Tooling, Bulk, Analytics, Security, Automation &amp; Integrations
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
            {['REST API', 'Metadata API', 'Tooling API', 'Bulk API v2', 'Analytics', 'Security', 'Automation', 'Integrations'].map(d => (
              <span key={d} style={{
                fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                background: 'rgba(255,255,255,0.72)', border: `1px solid rgba(1,118,211,0.18)`,
                color: T.dark, letterSpacing: '0.03em', backdropFilter: 'blur(4px)',
              }}>{d}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px 60px' }}>

        {/* ── API Surface cards ── */}
        <section style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: T.dark, margin: 0, letterSpacing: '0.02em' }}>
              Select API Surfaces to Assess
            </h2>
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: T.accentLight, color: T.primary, border: `1px solid ${T.light200}`,
            }}>
              {selectedScopes.size}/{API_CARDS.length} selected
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px',
          }}>
            {API_CARDS.map(card => {
              const active = selectedScopes.has(card.scope)
              const Icon = card.icon
              return (
                <button
                  key={card.scope}
                  onClick={() => toggleScope(card.scope)}
                  style={{
                    background: active ? '#fff' : 'rgba(255,255,255,0.55)',
                    borderRadius: '14px',
                    padding: '16px',
                    border: active
                      ? `2px solid ${card.color}`
                      : `1.5px solid ${T.light200}`,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 180ms',
                    boxShadow: active ? T.shadowCard : 'none',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Active glow strip */}
                  {active && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                      background: `linear-gradient(90deg, ${card.color}, ${T.accent})`,
                      borderRadius: '14px 14px 0 0',
                    }} />
                  )}

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: active ? `${card.color}14` : T.light50,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      border: active ? `1px solid ${card.color}30` : `1px solid ${T.light200}`,
                    }}>
                      <Icon style={{ width: '18px', height: '18px', color: active ? card.color : '#94a3b8' }} />
                    </div>
                    {active && (
                      <CheckCircle style={{ width: '16px', height: '16px', color: card.color, flexShrink: 0 }} />
                    )}
                  </div>

                  <p style={{ fontSize: '13px', fontWeight: 700, color: active ? card.color : T.dark, margin: '0 0 3px' }}>
                    {card.label}
                  </p>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>
                    {card.tagline}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {card.checks.map(c => (
                      <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <ChevronRight style={{ width: '10px', height: '10px', color: active ? card.color : '#94a3b8', flexShrink: 0 }} />
                        <span style={{ fontSize: '10.5px', color: active ? '#374151' : '#94a3b8' }}>{c}</span>
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Two-column: Auth + Options ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>

          {/* Left: Auth */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Auth method selector */}
            <div style={{
              background: '#fff', borderRadius: '16px', padding: '22px',
              boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: T.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>
                Authentication Method
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {METHODS.map(m => {
                  const active = authMethod === m.id
                  const Icon = m.icon
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setAuthMethod(m.id); setAuthState('idle'); setAuthError('') }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                        padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
                        border: active ? `2px solid ${T.primary}` : `1.5px solid ${T.light100}`,
                        background: active ? T.accentLight : '#fafafa',
                        transition: 'all 150ms', textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                        background: active ? `${T.primary}18` : T.light50,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: active ? `1px solid ${T.primary}30` : `1px solid ${T.light200}`,
                      }}>
                        <Icon style={{ width: '15px', height: '15px', color: active ? T.primary : '#94a3b8' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: active ? T.primary : T.dark, margin: '0 0 3px' }}>{m.label}</p>
                        <p style={{ fontSize: '11px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>{m.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Credentials */}
            <div style={{
              background: '#fff', borderRadius: '16px', padding: '22px',
              boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: T.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
                Connection Details
              </p>

              <InputField
                label="Instance URL" required
                value={instanceUrl} onChange={setInstanceUrl}
                placeholder="https://myorg.salesforce.com"
                icon={Globe}
                hint="Your Salesforce org URL (no trailing slash)"
              />
              <InputField
                label="API Version"
                value={apiVersion} onChange={setApiVersion}
                placeholder="59.0"
                hint="Salesforce REST API version (default 59.0)"
              />

              {authMethod === 'username_password' && (
                <>
                  <InputField label="Username" required value={username} onChange={setUsername} placeholder="user@company.com" icon={User} />
                  <InputField label="Password" required value={password} onChange={setPassword} icon={Key} showToggle />
                  <InputField
                    label="Security Token"
                    value={securityToken} onChange={setSecurityToken}
                    icon={Shield}
                    showToggle
                    hint="Append to password if your org enforces IP restrictions"
                  />
                </>
              )}

              {authMethod === 'oauth_client_credentials' && (
                <>
                  <InputField label="Client ID (Consumer Key)" required value={clientId} onChange={setClientId} icon={Key} />
                  <InputField label="Client Secret (Consumer Secret)" required value={clientSecret} onChange={setClientSecret} icon={Shield} showToggle />
                </>
              )}

              {authMethod === 'connected_app_token' && (
                <InputField
                  label="Access Token / Session ID" required
                  value={accessToken} onChange={setAccessToken}
                  icon={Key}
                  showToggle
                  hint="Paste the Bearer token from an existing OAuth session"
                />
              )}

              {/* Test connection button */}
              <button
                onClick={handleTestConnection}
                disabled={authState === 'testing'}
                style={{
                  width: '100%', padding: '11px', borderRadius: '10px', border: 'none',
                  background: authState === 'ok' ? 'rgba(5,150,105,0.10)' : authState === 'failed' ? 'rgba(220,38,38,0.08)' : T.light100,
                  color: authState === 'ok' ? '#065f46' : authState === 'failed' ? '#991b1b' : T.primary,
                  fontSize: '13px', fontWeight: 700, cursor: authState === 'testing' ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'all 180ms',
                }}
              >
                {authState === 'testing' && <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />}
                {authState === 'ok'      && <CheckCircle style={{ width: '14px', height: '14px' }} />}
                {authState === 'failed'  && <XCircle style={{ width: '14px', height: '14px' }} />}
                {authState === 'testing' ? 'Connecting…'
                  : authState === 'ok'    ? `Connected — ${orgInfo?.org_name || 'OK'}`
                  : authState === 'failed' ? 'Connection Failed — Retry'
                  : 'Test Connection'}
              </button>

              {/* Org info badge */}
              {authState === 'ok' && orgInfo && (
                <div style={{
                  marginTop: '10px', padding: '10px 14px', borderRadius: '10px',
                  background: 'rgba(5,150,105,0.07)', border: '1px solid rgba(5,150,105,0.20)',
                  display: 'flex', flexDirection: 'column', gap: '4px',
                }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {orgInfo.org_name && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#065f46' }}>
                        {orgInfo.org_name}
                      </span>
                    )}
                    {orgInfo.org_type && (
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                        background: orgInfo.org_type === 'Sandbox' ? 'rgba(217,119,6,0.12)' : 'rgba(5,150,105,0.12)',
                        color: orgInfo.org_type === 'Sandbox' ? '#92400e' : '#065f46',
                        border: orgInfo.org_type === 'Sandbox' ? '1px solid rgba(217,119,6,0.25)' : '1px solid rgba(5,150,105,0.25)',
                      }}>
                        {orgInfo.org_type}
                      </span>
                    )}
                  </div>
                  {orgInfo.org_id && (
                    <span style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'monospace' }}>
                      ID: {orgInfo.org_id}
                    </span>
                  )}
                </div>
              )}

              {/* Auth error */}
              {authError && (
                <div style={{
                  marginTop: '10px', padding: '10px 12px', borderRadius: '10px',
                  background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)',
                  display: 'flex', gap: '8px', alignItems: 'flex-start',
                }}>
                  <AlertTriangle style={{ width: '14px', height: '14px', color: '#dc2626', flexShrink: 0, marginTop: '1px' }} />
                  <p style={{ fontSize: '11.5px', color: '#991b1b', margin: 0, lineHeight: 1.5 }}>{authError}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Options + Submit */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Session label */}
            <div style={{
              background: '#fff', borderRadius: '16px', padding: '22px',
              boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: T.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
                Assessment Label
              </p>
              <InputField
                label="Label (optional)"
                value={label} onChange={setLabel}
                placeholder="e.g. Production Org Q3 2025"
                hint="A descriptive name for this assessment session"
              />
              <div style={{ marginTop: '4px' }}>
                <FieldLabel>Max Objects to Inspect</FieldLabel>
                <input
                  type="number"
                  value={maxObjects}
                  onChange={e => setMaxObjects(Number(e.target.value))}
                  min={1} max={5000}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                    border: `1.5px solid ${T.light200}`, borderRadius: '10px',
                    fontSize: '13.5px', color: T.dark, background: '#fff', outline: 'none',
                  }}
                />
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Limits deep field inspection to the first N custom objects (1–5000)
                </p>
              </div>
            </div>

            {/* API surface summary */}
            <div style={{
              background: '#fff', borderRadius: '16px', padding: '22px',
              boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: T.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>
                Assessment Scope Summary
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {API_CARDS.map(card => {
                  const on = selectedScopes.has(card.scope)
                  return (
                    <div key={card.scope} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 12px', borderRadius: '8px',
                      background: on ? `${card.color}09` : '#f8fafc',
                      border: `1px solid ${on ? card.color + '22' : T.light200}`,
                    }}>
                      <card.icon style={{ width: '14px', height: '14px', color: on ? card.color : '#94a3b8', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: on ? card.color : '#94a3b8', flex: 1 }}>
                        {card.label}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: on ? '#065f46' : '#94a3b8' }}>
                        {on ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Info callout */}
            <div style={{
              padding: '14px 16px', borderRadius: '12px',
              background: 'rgba(1,118,211,0.06)', border: `1px solid rgba(1,118,211,0.18)`,
              display: 'flex', gap: '10px',
            }}>
              <Info style={{ width: '14px', height: '14px', color: T.primary, flexShrink: 0, marginTop: '1px' }} />
              <p style={{ fontSize: '11.5px', color: T.dark, margin: 0, lineHeight: 1.6 }}>
                The assessment runs as a background job and uses only read-only API calls.
                Credentials are used only during the assessment and never stored.
              </p>
            </div>

            {/* Submit error */}
            {submitError && (
              <div style={{
                padding: '10px 14px', borderRadius: '10px',
                background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)',
                display: 'flex', gap: '8px', alignItems: 'flex-start',
              }}>
                <AlertTriangle style={{ width: '14px', height: '14px', color: '#dc2626', flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '11.5px', color: '#991b1b', margin: 0 }}>{submitError}</p>
              </div>
            )}

            {/* Start assessment */}
            <button
              onClick={handleSubmit}
              disabled={submitting || authState !== 'ok' || selectedScopes.size === 0}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: (submitting || authState !== 'ok' || selectedScopes.size === 0)
                  ? '#e2e8f0'
                  : T.gradBtn,
                color: (submitting || authState !== 'ok' || selectedScopes.size === 0) ? '#94a3b8' : '#fff',
                fontSize: '14px', fontWeight: 700, cursor: (submitting || authState !== 'ok' || selectedScopes.size === 0) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                boxShadow: authState === 'ok' ? T.shadowBtn : 'none',
                transition: 'all 200ms',
              }}
            >
              {submitting
                ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Starting Assessment…</>
                : <>Start Salesforce Assessment <ChevronRight style={{ width: '16px', height: '16px' }} /></>
              }
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
