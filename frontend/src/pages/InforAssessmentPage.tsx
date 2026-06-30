import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Globe, User, Lock, Tag, ArrowRight,
  CheckCircle2, AlertCircle, Loader2,
  Eye, EyeOff, Network, ChevronRight,
  Cpu, Layers, Info, Zap,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { InforPNGLogo } from '../components/ui/SourceLogos'
import type { InforEngine, InforAssessmentRequest } from '../types/api'
import { INFOR_ENGINES, INFOR_EDITION_OPTIONS } from '../types/api'

// ── Design tokens (matches Db2AssessmentPage) ─────────────────────────────────

const D = {
  bg:          '#F6FFFE',
  surface:     '#FFFFFF',
  surface2:    '#F0FAFA',
  border:      '#B2DDD9',
  borderFaint: '#D4EFEC',
  teal:        '#6CBDB5',
  tealDim:     '#4DA8A0',
  tealGlow:    'rgba(108,189,181,0.18)',
  tealFaint:   'rgba(108,189,181,0.07)',
  textPrimary: '#0D1117',
  textSecond:  '#404555',
  textMuted:   '#767A8C',
  green:       '#059669',
  greenDim:    'rgba(5,150,105,0.10)',
  red:         '#DC2626',
  redDim:      'rgba(220,38,38,0.08)',
  navy:        '#1E4D8C',
  blue:        '#0083BE',
  blueDim:     'rgba(0,131,190,0.10)',
  shadowCard:  '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.08)',
  fontMono:    '"JetBrains Mono", "Fira Code", monospace',
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{
      display: 'block', fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em', color: D.textMuted, marginBottom: 6,
    }}>
      {children}{required && <span style={{ color: D.red, marginLeft: 3 }}>*</span>}
    </label>
  )
}

function InputField({
  icon: Icon, placeholder, value, onChange, type = 'text',
  mono = false, disabled = false, hint, showToggle = false, readOnly = false,
}: {
  icon?: React.ElementType; placeholder?: string; value: string
  onChange: (v: string) => void; type?: string; mono?: boolean
  disabled?: boolean; hint?: string; showToggle?: boolean; readOnly?: boolean
}) {
  const [show, setShow] = useState(false)
  const [focused, setFocused] = useState(false)
  const effectiveType = showToggle ? (show ? 'text' : 'password') : type
  return (
    <div>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon style={{ width: 14, height: 14, color: focused ? D.teal : D.textMuted }} />
          </div>
        )}
        <input
          type={effectiveType} value={value}
          onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
          placeholder={placeholder} disabled={disabled} readOnly={readOnly}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: `9px ${showToggle ? 36 : 12}px 9px ${Icon ? 36 : 12}px`,
            borderRadius: 9, fontSize: 13, fontFamily: mono ? D.fontMono : 'inherit',
            background: (disabled || readOnly) ? D.borderFaint : D.surface2,
            border: `1px solid ${focused ? D.teal : D.border}`,
            color: D.textPrimary, outline: 'none',
            boxShadow: focused ? `0 0 0 3px ${D.tealGlow}` : 'none',
            transition: 'all 0.15s ease', opacity: disabled ? 0.5 : 1,
          }}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        />
        {showToggle && (
          <button type="button" onClick={() => setShow(!show)} tabIndex={-1}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: D.textMuted, display: 'flex', alignItems: 'center' }}>
            {show ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize: 10, color: D.textMuted, marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label, sub }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 38, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 2,
        background: checked ? `linear-gradient(135deg, ${D.tealDim}, ${D.teal})` : D.border,
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: checked ? 19 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s',
        }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: D.textPrimary, margin: 0 }}>{label}</p>
        {sub && <p style={{ fontSize: 10, color: D.textMuted, marginTop: 1 }}>{sub}</p>}
      </div>
    </label>
  )
}

function Section({ title, icon: Icon, children }: {
  title: string; icon?: React.ElementType; children: React.ReactNode
}) {
  return (
    <div style={{
      background: D.surface, borderRadius: 14,
      border: `1px solid ${D.borderFaint}`,
      boxShadow: D.shadowCard, overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{
        padding: '14px 20px',
        background: `linear-gradient(90deg, ${D.tealFaint}, transparent)`,
        borderBottom: `1px solid ${D.borderFaint}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {Icon && <Icon style={{ width: 15, height: 15, color: D.teal }} />}
        <span style={{ fontSize: 12, fontWeight: 700, color: D.textPrimary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

// ── Engine selector card ──────────────────────────────────────────────────────

function EngineCard({
  engine, selected, onClick,
}: {
  engine: typeof INFOR_ENGINES[number]; selected: boolean; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const active = selected || hovered
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
        background: selected ? `linear-gradient(135deg, ${D.blueDim}, rgba(30,77,140,0.06))` : active ? D.tealFaint : D.surface2,
        border: `2px solid ${selected ? D.blue : active ? D.teal : D.borderFaint}`,
        boxShadow: selected ? `0 0 0 3px rgba(0,131,190,0.12)` : 'none',
        transition: 'all 0.15s ease', display: 'flex', alignItems: 'flex-start', gap: 12,
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: selected ? `linear-gradient(135deg, ${D.navy}, ${D.blue})` : D.borderFaint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: selected ? '#fff' : D.textMuted, fontFamily: D.fontMono }}>
          {engine.shortLabel}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: selected ? D.navy : D.textPrimary }}>{engine.label}</span>
          {selected && <CheckCircle2 style={{ width: 13, height: 13, color: D.blue, flexShrink: 0 }} />}
        </div>
        <p style={{ fontSize: 11, color: D.textMuted, margin: 0, lineHeight: 1.45 }}>{engine.description}</p>
        <p style={{ fontSize: 10, color: D.blue, margin: '5px 0 0', fontWeight: 600 }}>
          API: {engine.apiSurface}
        </p>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InforAssessmentPage() {
  const navigate = useNavigate()

  // Step: 'engine' → 'credentials' → 'launching'
  const [step, setStep] = useState<'engine' | 'credentials'>('engine')

  // Engine / edition selection
  const [engine, setEngine] = useState<InforEngine | null>(null)
  const [edition, setEdition] = useState('')
  const [useEditionPicker, setUseEditionPicker] = useState(false)

  // ION API credentials
  const [tenantId, setTenantId]         = useState('')
  const [ionApiUrl, setIonApiUrl]       = useState('')
  const [clientId, setClientId]         = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [username, setUsername]         = useState('')
  const [password, setPassword]         = useState('')
  const [label, setLabel]               = useState('')
  const [useHcm, setUseHcm]             = useState(false)
  const [hcmHost, setHcmHost]           = useState('')
  const [hcmPort, setHcmPort]           = useState('9350')

  // UI state
  const [testing, setTesting]   = useState(false)
  const [launching, setLaunching] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; engine?: InforEngine } | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const selectedEngineMeta = INFOR_ENGINES.find(e => e.value === engine)

  function buildRequest(): InforAssessmentRequest {
    return {
      engine: engine || undefined,
      edition: edition || undefined,
      label: label || undefined,
      credentials: {
        tenant_id: tenantId.trim(),
        ion_api_url: ionApiUrl.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret,
        username: username.trim() || undefined,
        password: password || undefined,
        use_hcm: useHcm,
        hcm_local_host: useHcm && hcmHost ? hcmHost.trim() : undefined,
        hcm_local_port: useHcm && hcmPort ? Number(hcmPort) : undefined,
      },
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const { data } = await api.inforTestConnection(buildRequest())
      if (data.ok) {
        setTestResult({
          ok: true,
          message: `Connected to "${data.tenant_name || data.tenant_id}". Engine: ${data.engine_label || data.detected_engine || 'unknown'}`,
          engine: data.detected_engine,
        })
        if (data.detected_engine && !engine) setEngine(data.detected_engine)
      } else {
        setTestResult({ ok: false, message: data.error || 'Connection failed' })
      }
    } catch (err) {
      setTestResult({ ok: false, message: getApiErrorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  async function handleLaunch() {
    if (!tenantId.trim() || !ionApiUrl.trim() || !clientId.trim() || !clientSecret) {
      setError('Tenant ID, ION API URL, Client ID, and Client Secret are required.')
      return
    }
    if (!engine && !edition) {
      setError('Select an engine or edition — Infor has no single unified API; the engine determines which metadata is extracted.')
      return
    }
    setLaunching(true)
    setError(null)
    try {
      const { data } = await api.inforStartAssessment(buildRequest())
      navigate(`/infor/sessions/${data.job_id}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
      setLaunching(false)
    }
  }

  const credentialsComplete = tenantId.trim() && ionApiUrl.trim() && clientId.trim() && clientSecret

  return (
    <div style={{
      minHeight: '100vh', background: D.bg, padding: '32px 24px 56px',
      fontFamily: "'Inter Variable','Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: D.surface, border: `1.5px solid ${D.borderFaint}`,
            boxShadow: D.shadowCard, flexShrink: 0,
          }}>
            <InforPNGLogo size={38} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: D.textPrimary, margin: 0, lineHeight: 1.2 }}>
              Infor CloudSuite Assessment
            </h1>
            <p style={{ fontSize: 12, color: D.textMuted, marginTop: 3 }}>
              M3 · LN · CSI/SyteLine — engine-routed via Infor ION API
            </p>
          </div>
        </div>

        {/* ── Critical architectural note ── */}
        <div style={{
          background: `linear-gradient(90deg, rgba(0,131,190,0.06), rgba(30,77,140,0.04))`,
          border: `1px solid rgba(0,131,190,0.22)`, borderRadius: 12,
          padding: '12px 16px', marginBottom: 20,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Info style={{ width: 15, height: 15, color: D.blue, flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: D.navy, margin: '0 0 3px' }}>
              Engine selection is required — CloudSuite is a vertical label, not a data model.
            </p>
            <p style={{ fontSize: 11, color: D.textSecond, margin: 0, lineHeight: 1.5 }}>
              The actual API surface depends on the underlying engine: <strong>M3</strong> uses MRS001/002/003 + MDBREADMI,{' '}
              <strong>LN</strong> uses the BOD catalog + VRC customisations, and{' '}
              <strong>CSI</strong> uses the SyteLine schema via ION Grid REST.{' '}
              Specifying the wrong engine will silently produce incorrect or incomplete metadata.
            </p>
          </div>
        </div>

        {/* ── Step 1: Engine selection ── */}
        {step === 'engine' && (
          <>
            <Section title="Step 1 — Select the underlying engine" icon={Cpu}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                {INFOR_ENGINES.map(e => (
                  <EngineCard
                    key={e.value}
                    engine={e}
                    selected={engine === e.value}
                    onClick={() => { setEngine(e.value); setEdition('') }}
                  />
                ))}
              </div>

              <div style={{
                borderTop: `1px dashed ${D.borderFaint}`, paddingTop: 16, marginTop: 4,
              }}>
                <Toggle
                  checked={useEditionPicker}
                  onChange={(v) => { setUseEditionPicker(v); if (!v) setEdition('') }}
                  label="Pick by CloudSuite edition instead"
                  sub="Maps your edition to the correct underlying engine automatically"
                />
                {useEditionPicker && (
                  <div style={{ marginTop: 14 }}>
                    <FormLabel>CloudSuite edition</FormLabel>
                    <select
                      value={edition}
                      onChange={(e) => {
                        const opt = INFOR_EDITION_OPTIONS.find(o => o.edition === e.target.value)
                        setEdition(e.target.value)
                        if (opt) setEngine(opt.engine)
                      }}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 9, fontSize: 13,
                        border: `1px solid ${D.border}`, background: D.surface2,
                        color: D.textPrimary, outline: 'none',
                      }}
                    >
                      <option value="">Select edition…</option>
                      {INFOR_EDITION_OPTIONS.map(o => (
                        <option key={o.edition} value={o.edition}>
                          {o.label} → {o.engine.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    {edition && (
                      <p style={{ fontSize: 11, color: D.green, marginTop: 6, fontWeight: 600 }}>
                        Engine resolved: {INFOR_ENGINES.find(e => e.value === engine)?.label}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Section>

            {selectedEngineMeta && (
              <div style={{
                background: D.blueDim, border: `1px solid rgba(0,131,190,0.20)`,
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <Zap style={{ width: 13, height: 13, color: D.blue, flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 11, color: D.navy, margin: 0, lineHeight: 1.5 }}>
                  <strong>{selectedEngineMeta.label}</strong> selected.{' '}
                  Deployment: {selectedEngineMeta.deploymentNote}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setStep('credentials')}
                disabled={!engine}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '11px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                  background: engine ? `linear-gradient(135deg, ${D.tealDim}, ${D.teal})` : D.borderFaint,
                  color: engine ? '#fff' : D.textMuted,
                  border: 'none', cursor: engine ? 'pointer' : 'not-allowed',
                  boxShadow: engine ? `0 2px 12px ${D.tealGlow}` : 'none',
                  transition: 'all 0.15s',
                }}
              >
                Continue to credentials
                <ChevronRight style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Credentials ── */}
        {step === 'credentials' && (
          <>
            {/* Back + engine summary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button
                onClick={() => setStep('engine')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: D.surface, border: `1px solid ${D.border}`,
                  color: D.textSecond, cursor: 'pointer',
                }}
              >
                ← Change engine
              </button>
              {selectedEngineMeta && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: `linear-gradient(90deg, ${D.blueDim}, transparent)`,
                  border: `1px solid rgba(0,131,190,0.20)`, borderRadius: 8,
                  padding: '6px 12px',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: `linear-gradient(135deg, ${D.navy}, ${D.blue})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', fontFamily: D.fontMono }}>
                      {selectedEngineMeta.shortLabel}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: D.navy }}>
                    {selectedEngineMeta.label}
                  </span>
                </div>
              )}
            </div>

            {/* Label */}
            <Section title="Assessment label (optional)" icon={Tag}>
              <InputField
                icon={Tag} placeholder="e.g. ACME Corp M3 Production"
                value={label} onChange={setLabel}
                hint="Descriptive name shown in the sessions list"
              />
            </Section>

            {/* ION API Credentials */}
            <Section title="Infor ION API credentials" icon={Globe}>
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <FormLabel required>Tenant ID</FormLabel>
                  <InputField
                    icon={Layers} placeholder="e.g. ACME_TST"
                    value={tenantId} onChange={setTenantId}
                    mono hint="Your Infor ION tenant identifier (shown in Ming.le admin)"
                  />
                </div>
                <div>
                  <FormLabel required>ION API Gateway URL</FormLabel>
                  <InputField
                    icon={Globe} placeholder="https://mingle-ionapi.inforcloudsuite.com"
                    value={ionApiUrl} onChange={setIonApiUrl}
                    hint="Base URL of the Infor ION API Gateway (no trailing slash)"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FormLabel required>Client ID</FormLabel>
                    <InputField
                      icon={User} placeholder="OAuth2 client_id"
                      value={clientId} onChange={setClientId} mono
                    />
                  </div>
                  <div>
                    <FormLabel required>Client Secret</FormLabel>
                    <InputField
                      icon={Lock} placeholder="OAuth2 client_secret"
                      value={clientSecret} onChange={setClientSecret}
                      showToggle mono
                    />
                  </div>
                </div>
                <div style={{ borderTop: `1px dashed ${D.borderFaint}`, paddingTop: 14 }}>
                  <p style={{ fontSize: 11, color: D.textMuted, marginBottom: 10 }}>
                    Optional: resource-owner credentials (required by some ION API deployments)
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <FormLabel>Service account username</FormLabel>
                      <InputField icon={User} placeholder="svc-sat@acme.com" value={username} onChange={setUsername} />
                    </div>
                    <div>
                      <FormLabel>Password</FormLabel>
                      <InputField icon={Lock} placeholder="••••••••" value={password} onChange={setPassword} showToggle />
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* HCM relay */}
            {(engine === 'm3' || engine === 'ln') && (
              <Section title="On-premise connectivity (Azure Relay)" icon={Network}>
                <div style={{ marginBottom: useHcm ? 16 : 0 }}>
                  <Toggle
                    checked={useHcm}
                    onChange={setUseHcm}
                    label="Route via Azure Relay Hybrid Connection"
                    sub={`Required for on-prem ${engine === 'm3' ? 'M3' : 'LN'} deployments where the ION API is not publicly reachable`}
                  />
                </div>
                {useHcm && (
                  <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                    <div>
                      <FormLabel required>Local HCM listener host</FormLabel>
                      <InputField icon={Network} placeholder="localhost" value={hcmHost} onChange={setHcmHost} mono />
                    </div>
                    <div>
                      <FormLabel required>Port</FormLabel>
                      <InputField placeholder="9350" value={hcmPort} onChange={setHcmPort} mono />
                    </div>
                  </div>
                )}
                {!useHcm && (
                  <p style={{ fontSize: 11, color: D.textMuted, marginTop: 6 }}>
                    Disabled — connecting directly to the ION API URL above. Enable if the ION API is behind a corporate firewall.
                  </p>
                )}
              </Section>
            )}

            {/* Test connection */}
            <div style={{
              background: D.surface, border: `1px solid ${D.borderFaint}`, borderRadius: 14,
              padding: 20, marginBottom: 16, boxShadow: D.shadowCard,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: D.textPrimary, margin: 0 }}>
                    Test ION API connectivity
                  </p>
                  <p style={{ fontSize: 11, color: D.textMuted, marginTop: 2 }}>
                    Validates OAuth credentials and detects/confirms the engine
                  </p>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={testing || !tenantId.trim() || !ionApiUrl.trim() || !clientId.trim() || !clientSecret}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                    background: D.tealFaint, border: `1px solid ${D.teal}`,
                    color: D.tealDim, cursor: 'pointer',
                    opacity: (testing || !tenantId || !ionApiUrl || !clientId || !clientSecret) ? 0.5 : 1,
                  }}
                >
                  {testing ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : <Zap style={{ width: 13, height: 13 }} />}
                  {testing ? 'Testing…' : 'Test connection'}
                </button>
              </div>

              {testResult && (
                <div style={{
                  marginTop: 14, padding: '10px 14px', borderRadius: 9,
                  background: testResult.ok ? D.greenDim : D.redDim,
                  border: `1px solid ${testResult.ok ? 'rgba(5,150,105,0.20)' : 'rgba(220,38,38,0.20)'}`,
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  {testResult.ok
                    ? <CheckCircle2 style={{ width: 14, height: 14, color: D.green, flexShrink: 0, marginTop: 1 }} />
                    : <AlertCircle style={{ width: 14, height: 14, color: D.red, flexShrink: 0, marginTop: 1 }} />
                  }
                  <p style={{ fontSize: 12, color: testResult.ok ? D.green : D.red, margin: 0, fontWeight: 600 }}>
                    {testResult.message}
                  </p>
                </div>
              )}
            </div>

            {/* Error banner */}
            {error && (
              <div style={{
                background: D.redDim, border: `1px solid rgba(220,38,38,0.22)`,
                borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <AlertCircle style={{ width: 14, height: 14, color: D.red, flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: D.red, margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Launch */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleLaunch}
                disabled={launching || !credentialsComplete}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 28px', borderRadius: 11, fontSize: 14, fontWeight: 700,
                  background: credentialsComplete && !launching
                    ? `linear-gradient(135deg, ${D.tealDim}, ${D.teal})`
                    : D.borderFaint,
                  color: credentialsComplete && !launching ? '#fff' : D.textMuted,
                  border: 'none', cursor: credentialsComplete && !launching ? 'pointer' : 'not-allowed',
                  boxShadow: credentialsComplete ? `0 2px 16px ${D.tealGlow}` : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {launching
                  ? <><Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} /> Launching…</>
                  : <><ArrowRight style={{ width: 15, height: 15 }} /> Start assessment</>
                }
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
