import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, Shield, Zap, Eye, EyeOff, ChevronRight,
  CheckCircle, XCircle, Loader2, AlertTriangle, Info,
  Key, User, Building2, Globe, Settings, BarChart3,
  Layers, GitBranch, CloudCog, FlaskConical,
} from 'lucide-react'
import axios from 'axios'
import { DataverseFullLogo } from '../components/ui/SourceLogos'
import type {
  DataverseAuthMethod,
  DataverseCredentials,
  DataverseAssessmentRequest,
} from '../types/api'

// ── Nature Green Teal theme ───────────────────────────────────────────────────
const T = {
  primary:     '#4DA8A0',
  mid:         '#6CBDB5',
  accent:      '#93CCC6',
  accentLight: '#CCEFEC',
  dark:        '#358F87',
  darkMid:     '#4DA8A0',
  surface:     '#F0FAF9',
  light50:     '#F0FAF9',
  light100:    '#CCEFEC',
  light200:    '#A8E2DD',
  ice:         '#93CCC6',
  text:        '#25706A',
  textMid:     '#4DA8A0',
  glow:        'rgba(77,168,160,0.18)',
  glowDeep:    'rgba(77,168,160,0.30)',
  shadowCard:  '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.08), 0 12px 40px rgba(77,168,160,0.05)',
  shadowHover: '0 4px 12px rgba(77,168,160,0.14), 0 16px 48px rgba(77,168,160,0.10)',
  shadowBtn:   '0 2px 12px rgba(77,168,160,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
  shadowBtnHover: '0 4px 20px rgba(77,168,160,0.50), inset 0 1px 0 rgba(255,255,255,0.20)',
  gradHero:    'linear-gradient(135deg, #F0FAF9 0%, #CCEFEC 100%)',
  gradSurface: 'linear-gradient(180deg, #F0FAF9 0%, #CCEFEC 100%)',
  gradBtn:     'linear-gradient(135deg, #4DA8A0 0%, #6CBDB5 60%, #93CCC6 100%)',
  gradAccent:  'linear-gradient(135deg, #4DA8A0, #93CCC6)',
}

type AuthState = 'idle' | 'testing' | 'ok' | 'failed'

interface MethodMeta {
  id: DataverseAuthMethod
  label: string
  desc: string
  icon: React.ElementType
}

const METHODS: MethodMeta[] = [
  {
    id: 'client_credentials',
    label: 'Service Principal',
    desc: 'App registration with client secret (recommended for automated assessments)',
    icon: Key,
  },
  {
    id: 'username_password',
    label: 'User Credentials',
    desc: 'Username & password (requires non-MFA account)',
    icon: User,
  },
]

const DOMAIN_GROUPS = [
  { key: 'include_data_volume',  label: 'Data Volume',      icon: BarChart3,   desc: 'Record counts, storage, duplicates' },
  { key: 'include_data_quality', label: 'Data Quality',     icon: FlaskConical, desc: 'Duplicate rules, validation signals' },
  { key: 'include_security',     label: 'Security',         icon: Shield,      desc: 'Roles, users, field-level security' },
  { key: 'include_flows',        label: 'Flows',            icon: Zap,         desc: 'Cloud flows, suspended, solution gaps' },
  { key: 'include_plugins',      label: 'Plugins & Code',   icon: CloudCog,    desc: 'Plugin assemblies, steps, custom APIs' },
  { key: 'include_ui',           label: 'UI & Forms',       icon: Layers,      desc: 'Forms, views, PCF controls, apps' },
  { key: 'include_audit',        label: 'Audit',            icon: Eye,         desc: 'Audit config, plugin trace, async log' },
  { key: 'include_ai',           label: 'AI & Copilot',     icon: GitBranch,   desc: 'AI Builder, Copilot settings' },
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
          <Icon
            style={{
              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
              width: '15px', height: '15px', color: T.mid, pointerEvents: 'none',
            }}
          />
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

export default function DataverseAssessmentPage() {
  const navigate = useNavigate()
  const [authMethod, setAuthMethod] = useState<DataverseAuthMethod>('client_credentials')

  // credential fields
  const [envUrl,        setEnvUrl]        = useState('')
  const [tenantId,      setTenantId]      = useState('')
  const [clientId,      setClientId]      = useState('')
  const [clientSecret,  setClientSecret]  = useState('')
  const [username,      setUsername]      = useState('')
  const [password,      setPassword]      = useState('')

  // assessment options
  const [label,        setLabel]        = useState('')
  const [maxEntities,  setMaxEntities]  = useState(500)
  const [options, setOptions] = useState({
    include_data_volume:  true,
    include_data_quality: true,
    include_security:     true,
    include_flows:        true,
    include_plugins:      true,
    include_ui:           true,
    include_audit:        true,
    include_ai:           true,
  })

  const [authState, setAuthState]   = useState<AuthState>('idle')
  const [orgName,   setOrgName]     = useState('')
  const [authError, setAuthError]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const token = () => localStorage.getItem('sat_token') || ''

  function buildCredentials(): DataverseCredentials {
    return {
      auth_method:     authMethod,
      environment_url: envUrl.trim(),
      tenant_id:       tenantId.trim() || undefined,
      client_id:       clientId.trim() || undefined,
      client_secret:   clientSecret || undefined,
      username:        username.trim() || undefined,
      password:        password || undefined,
    }
  }

  async function handleTestConnection() {
    if (!envUrl.trim()) { setAuthError('Environment URL is required.'); return }
    setAuthState('testing')
    setAuthError('')
    setOrgName('')
    try {
      const resp = await axios.post(
        '/api/v1/dataverse/test-connection',
        { credentials: buildCredentials() },
        { headers: { Authorization: `Bearer ${token()}` } },
      )
      const org = resp.data?.organization
      setOrgName(org?.name || 'Connected')
      setAuthState('ok')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail || 'Connection failed — check credentials.'
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
      const payload: DataverseAssessmentRequest = {
        credentials: buildCredentials(),
        label:        label.trim() || undefined,
        max_entities: maxEntities,
        ...options,
      }
      const resp = await axios.post('/api/v1/dataverse/assess', payload, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      navigate(`/dataverse/sessions/${resp.data.job_id}`)
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
      <div style={{ background: T.gradHero, borderBottom: '1px solid #DBEEFF', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative orb */}
        <div style={{
          position: 'absolute', width: 700, height: 700, top: -350, right: -200,
          borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(0,132,212,0.06) 0%, transparent 60%)',
        }} />

        <div style={{ position: 'relative', maxWidth: 1000, margin: '0 auto', padding: '32px 32px 28px' }}>
          {/* Logo — full wordmark, anchored left */}
          <div style={{ marginBottom: 16 }}>
            <DataverseFullLogo height={40} />
          </div>

          {/* Category badge */}
          <div style={{ marginBottom: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20,
              background: 'rgba(77,168,160,0.07)', color: T.dark, border: '1px solid rgba(77,168,160,0.20)',
            }}>
              Power Platform
            </span>
          </div>

          {/* Title + description */}
          <h1 style={{ color: T.dark, fontSize: 24, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
            Dataverse Assessment
          </h1>
          <p style={{ color: T.textMid, fontSize: 12, margin: 0, marginTop: 6, lineHeight: 1.6 }}>
            23 domains · 100+ checks · Tables, Security, Flows, Plugins, Solutions &amp; more
          </p>

          {/* Domain badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
            {['Tables', 'Columns', 'Security Roles', 'Users & Teams', 'Solutions', 'Flows', 'Plugins', 'Audit', 'AI & Copilot'].map(d => (
              <span key={d} style={{
                fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(77,168,160,0.18)',
                color: T.dark, letterSpacing: '0.03em', backdropFilter: 'blur(4px)',
              }}>{d}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 24px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* Left column: auth + credentials */}
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
                        background: active ? T.light50 : '#fafafa',
                        textAlign: 'left', transition: 'all 160ms',
                        boxShadow: active ? `0 0 0 3px ${T.glow}` : 'none',
                      }}
                    >
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
                        background: active ? T.gradAccent : `${T.light100}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon style={{ width: '15px', height: '15px', color: active ? '#fff' : T.mid }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: active ? T.primary : T.text, margin: 0 }}>{m.label}</p>
                        <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0, marginTop: '2px', lineHeight: 1.4 }}>{m.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Credential fields */}
            <div style={{
              background: '#fff', borderRadius: '16px', padding: '22px',
              boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: T.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
                Connection Details
              </p>

              <InputField
                label="Environment URL"
                required
                value={envUrl}
                onChange={setEnvUrl}
                placeholder="https://yourorg.crm.dynamics.com"
                hint="Your Dataverse / Power Platform environment URL"
                icon={Globe}
              />

              {/* Client credentials fields */}
              {authMethod === 'client_credentials' && (
                <>
                  <InputField
                    label="Tenant ID"
                    required
                    value={tenantId}
                    onChange={setTenantId}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    hint="Azure AD / Entra ID tenant ID"
                    icon={Building2}
                  />
                  <InputField
                    label="Client ID (App ID)"
                    required
                    value={clientId}
                    onChange={setClientId}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    hint="App registration application (client) ID"
                    icon={Key}
                  />
                  <InputField
                    label="Client Secret"
                    required
                    value={clientSecret}
                    onChange={setClientSecret}
                    placeholder="App registration client secret value"
                    showToggle
                    icon={Shield}
                  />
                </>
              )}

              {/* Username/password fields */}
              {authMethod === 'username_password' && (
                <>
                  <InputField
                    label="Tenant ID"
                    required
                    value={tenantId}
                    onChange={setTenantId}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    icon={Building2}
                  />
                  <InputField
                    label="Client ID"
                    required
                    value={clientId}
                    onChange={setClientId}
                    placeholder="Application (client) ID"
                    icon={Key}
                  />
                  <InputField
                    label="Username"
                    required
                    value={username}
                    onChange={setUsername}
                    placeholder="user@tenant.onmicrosoft.com"
                    icon={User}
                  />
                  <InputField
                    label="Password"
                    required
                    value={password}
                    onChange={setPassword}
                    placeholder="Account password"
                    showToggle
                    icon={Shield}
                  />
                </>
              )}

              {/* Connection status */}
              {authState !== 'idle' && (
                <div style={{
                  marginTop: '4px', padding: '10px 14px', borderRadius: '10px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: authState === 'ok' ? 'rgba(5,150,105,0.06)' : authState === 'failed' ? 'rgba(220,38,38,0.06)' : 'rgba(77,168,160,0.06)',
                  border: `1px solid ${authState === 'ok' ? 'rgba(5,150,105,0.20)' : authState === 'failed' ? 'rgba(220,38,38,0.20)' : T.light200}`,
                }}>
                  {authState === 'testing' && <Loader2 style={{ width: '15px', height: '15px', color: T.primary, animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                  {authState === 'ok'      && <CheckCircle style={{ width: '15px', height: '15px', color: '#059669', flexShrink: 0 }} />}
                  {authState === 'failed'  && <XCircle style={{ width: '15px', height: '15px', color: '#dc2626', flexShrink: 0 }} />}
                  <p style={{
                    fontSize: '12.5px', fontWeight: 600, margin: 0,
                    color: authState === 'ok' ? '#065f46' : authState === 'failed' ? '#991b1b' : T.primary,
                  }}>
                    {authState === 'testing' ? 'Testing connection…'
                      : authState === 'ok'    ? `Connected — ${orgName}`
                      : authError}
                  </p>
                </div>
              )}

              <button
                onClick={handleTestConnection}
                disabled={authState === 'testing' || !envUrl.trim()}
                style={{
                  width: '100%', marginTop: '14px', padding: '11px 0',
                  borderRadius: '10px', fontSize: '13.5px', fontWeight: 600,
                  cursor: authState === 'testing' || !envUrl.trim() ? 'not-allowed' : 'pointer',
                  border: `1.5px solid ${T.light200}`,
                  background: authState === 'testing' || !envUrl.trim() ? '#ecfeff' : '#fff',
                  color: authState === 'testing' || !envUrl.trim() ? '#38bdf8' : T.primary,
                  transition: 'all 160ms',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {authState === 'testing'
                  ? <><Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} /> Testing…</>
                  : <><Settings style={{ width: '14px', height: '14px' }} /> Test Connection</>
                }
              </button>
            </div>
          </div>

          {/* Right column: assessment options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Assessment label */}
            <div style={{
              background: '#fff', borderRadius: '16px', padding: '22px',
              boxShadow: T.shadowCard, border: `1px solid ${T.light100}`,
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: T.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
                Assessment Options
              </p>

              <InputField
                label="Assessment Label"
                value={label}
                onChange={setLabel}
                placeholder="e.g. Production – June 2026"
                hint="Optional — shown in session history"
                icon={Database}
              />

              {/* Max entities slider */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <FieldLabel>Max Entities to Scan</FieldLabel>
                  <span style={{
                    fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: '99px',
                    background: T.light50, color: T.primary, border: `1px solid ${T.light200}`,
                  }}>{maxEntities.toLocaleString()}</span>
                </div>
                <input
                  type="range" min={50} max={2000} step={50}
                  value={maxEntities}
                  onChange={e => setMaxEntities(Number(e.target.value))}
                  style={{ width: '100%', accentColor: T.primary, cursor: 'pointer', height: '4px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>50</span>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>2,000</span>
                </div>
              </div>

              {/* Domain toggles */}
              <p style={{ fontSize: '11px', fontWeight: 700, color: T.textMid, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>
                Assessment Domains
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {DOMAIN_GROUPS.map(({ key, label: lbl, icon: Icon, desc }) => {
                  const on = options[key as keyof typeof options]
                  return (
                    <button
                      key={key}
                      onClick={() => setOptions(o => ({ ...o, [key]: !o[key as keyof typeof o] }))}
                      title={desc}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '9px 11px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                        border: on ? `1.5px solid ${T.primary}` : `1.5px solid ${T.light100}`,
                        background: on ? T.light50 : '#fafafa',
                        transition: 'all 150ms',
                      }}
                    >
                      <div style={{
                        width: '26px', height: '26px', borderRadius: '7px', flexShrink: 0,
                        background: on ? T.gradAccent : T.light100,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon style={{ width: '13px', height: '13px', color: on ? '#fff' : T.mid }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: on ? T.primary : '#64748b' }}>{lbl}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Info card */}
            <div style={{
              borderRadius: '14px', padding: '16px',
              background: 'linear-gradient(135deg, rgba(77,168,160,0.06) 0%, rgba(108,189,181,0.06) 100%)',
              border: `1px solid ${T.light200}`,
              display: 'flex', gap: '12px', alignItems: 'flex-start',
            }}>
              <Info style={{ width: '16px', height: '16px', color: T.primary, flexShrink: 0, marginTop: '1px' }} />
              <div>
                <p style={{ fontSize: '12px', fontWeight: 700, color: T.primary, margin: 0 }}>What gets assessed</p>
                <p style={{ fontSize: '11.5px', color: T.text, margin: '4px 0 0', lineHeight: 1.5 }}>
                  23 domains including Tables, Columns, Relationships, Security Roles, Users, Field Security, Solutions, Flows, Plugins, Workflows, UI Forms, Web Resources, Integrations, Audit, Environment, Performance, Service Management, Retention & AI/Copilot.
                </p>
              </div>
            </div>

            {/* Submit error */}
            {submitError && (
              <div style={{
                padding: '12px 14px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start',
                background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.20)',
              }}>
                <AlertTriangle style={{ width: '15px', height: '15px', color: '#dc2626', flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '12.5px', color: '#991b1b', margin: 0 }}>{submitError}</p>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleSubmit}
              disabled={submitting || authState !== 'ok'}
              style={{
                width: '100%', padding: '14px 0',
                borderRadius: '12px', fontSize: '14.5px', fontWeight: 700,
                cursor: submitting || authState !== 'ok' ? 'not-allowed' : 'pointer',
                border: 'none',
                background: submitting || authState !== 'ok'
                  ? `linear-gradient(135deg, #67e8f9 0%, #38bdf8 100%)`
                  : T.gradBtn,
                color: '#fff',
                boxShadow: submitting || authState !== 'ok' ? 'none' : T.shadowBtn,
                transition: 'all 200ms',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              }}
              onMouseEnter={e => {
                if (!submitting && authState === 'ok') {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = T.shadowBtnHover
                  ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = T.shadowBtn
                ;(e.currentTarget as HTMLButtonElement).style.transform = ''
              }}
            >
              {submitting
                ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Starting Assessment…</>
                : <><BarChart3 style={{ width: '16px', height: '16px' }} /> Run Dataverse Assessment <ChevronRight style={{ width: '15px', height: '15px' }} /></>
              }
            </button>

            {authState !== 'ok' && (
              <p style={{ textAlign: 'center', fontSize: '11.5px', color: '#94a3b8', marginTop: '-8px' }}>
                Test the connection first to enable the assessment
              </p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
