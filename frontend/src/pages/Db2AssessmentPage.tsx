import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, Server, User, Lock, Shield, Globe,
  CheckCircle2, AlertCircle, Loader2, ArrowRight,
  Tag, Settings2, BarChart3, Eye, EyeOff, Link2,
  Radio, Wifi, Info, Network,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { IbmDb2FullLogo } from '../components/ui/SourceLogos'
import type { Db2ConnectionParams } from '../types/api'

// ── Design tokens ─────────────────────────────────────────────────────────────

const D = {
  bg:          '#F0FAF9',
  surface:     '#FFFFFF',
  surface2:    '#F0FAF9',
  border:      '#A8E2DD',
  borderFaint: '#CCEFEC',
  teal:        '#6CBDB5',
  tealDim:     '#4DA8A0',
  tealGlow:    'rgba(108,189,181,0.15)',
  tealFaint:   'rgba(108,189,181,0.07)',
  textPrimary: '#0D1117',
  textSecond:  '#404555',
  textMuted:   '#767A8C',
  green:       '#059669',
  greenDim:    'rgba(5,150,105,0.10)',
  red:         '#DC2626',
  redDim:      'rgba(220,38,38,0.08)',
  shadowCard:  '0 1px 3px rgba(77,168,160,0.04), 0 4px 16px rgba(77,168,160,0.06)',
  shadowTeal:  '0 2px 12px rgba(108,189,181,0.30)',
  fontMono:    '"JetBrains Mono", "Fira Code", monospace',
}

// ── Shared UI components ──────────────────────────────────────────────────────

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
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon style={{ width: 14, height: 14, color: focused ? D.teal : D.textMuted }} />
          </div>
        )}
        <input
          type={effectiveType} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} disabled={disabled}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: `9px ${showToggle ? 36 : 12}px 9px ${Icon ? 36 : 12}px`,
            borderRadius: 9, fontSize: 13, fontFamily: mono ? D.fontMono : 'inherit',
            background: disabled ? D.borderFaint : D.surface2,
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

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: 14, overflow: 'hidden', boxShadow: D.shadowCard, ...style }}>
      {children}
    </div>
  )
}

function CardHeader({ icon: Icon, step, title, sub, badge }: {
  icon: React.ElementType; step: string; title: string; sub: string; badge?: React.ReactNode
}) {
  return (
    <div style={{ padding: '16px 24px', borderBottom: `1px solid ${D.borderFaint}`,
      background: `linear-gradient(135deg, ${D.surface2} 0%, ${D.surface} 100%)`,
      display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(135deg, ${D.tealDim}, ${D.teal})`, boxShadow: D.shadowTeal }}>
          <Icon style={{ width: 16, height: 16, color: '#ffffff' }} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: D.tealDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 1 }}>{step}</div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: D.textPrimary, margin: 0 }}>{title}</h2>
          <p style={{ fontSize: 11, color: D.textMuted, marginTop: 1 }}>{sub}</p>
        </div>
      </div>
      {badge}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Db2AssessmentPage() {
  const navigate = useNavigate()

  // Direct connection
  const [hostname, setHostname]   = useState('')
  const [port, setPort]           = useState('50000')
  const [database, setDatabase]   = useState('')
  const [username, setUsername]   = useState('')
  const [password, setPassword]   = useState('')
  const [sslEnabled, setSslEnabled] = useState(false)
  const [sslCert, setSslCert]     = useState('')

  // Azure Hybrid Connection Manager
  const [useHcm, setUseHcm]         = useState(false)
  const [hcmLocalHost, setHcmLocalHost] = useState('127.0.0.1')
  const [hcmLocalPort, setHcmLocalPort] = useState('')
  const [hcmRelayNamespace, setHcmRelayNamespace] = useState('')
  const [hcmConnectionName, setHcmConnectionName] = useState('')

  // Scope
  const [schemaFilter, setSchemaFilter] = useState('')
  const [label, setLabel]         = useState('')

  // State
  const [testing, setTesting]     = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; service_level?: string } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function buildParams(): Db2ConnectionParams {
    return {
      hostname:    hostname.trim(),
      port:        parseInt(port, 10) || 50000,
      database:    database.trim(),
      username:    username.trim(),
      password,
      ssl_enabled: sslEnabled,
      ssl_server_certificate: sslCert.trim() || undefined,
      use_hcm:     useHcm,
      hcm_local_host:      hcmLocalHost.trim() || '127.0.0.1',
      hcm_local_port:      hcmLocalPort ? parseInt(hcmLocalPort, 10) : undefined,
      hcm_relay_namespace: hcmRelayNamespace.trim() || undefined,
      hcm_connection_name: hcmConnectionName.trim() || undefined,
      schema_filter: schemaFilter.trim() || undefined,
      label:         label.trim() || undefined,
    }
  }

  const canConnect = hostname.trim() && database.trim() && username.trim() && password
    && (!useHcm || hcmLocalPort.trim())

  async function handleTestConnection() {
    if (!canConnect) return
    setTesting(true); setTestResult(null); setTestError(null)
    try {
      const res = await api.db2TestConnection(buildParams())
      setTestResult(res.data)
    } catch (err) {
      setTestError(getApiErrorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  async function handleStartAssessment() {
    if (!canConnect) return
    setSubmitting(true); setSubmitError(null)
    try {
      const res = await api.db2Assess(buildParams())
      navigate(`/db2/sessions/${res.data.job_id}`)
    } catch (err) {
      setSubmitError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const G: React.CSSProperties = { display: 'grid' }

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #F0FAF9 0%, #CCEFEC 100%)',
        borderBottom: `1px solid ${D.border}` }}>
        <div style={{ position: 'absolute', width: 600, height: 600, top: -300, right: -150,
          borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, ${D.tealFaint} 0%, transparent 60%)` }} />
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 32px 28px' }}>
          <div style={{ marginBottom: 16 }}><IbmDb2FullLogo height={40} /></div>
          <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20,
              background: D.tealFaint, color: D.tealDim, border: `1px solid ${D.teal}33` }}>
              On-Premises Database
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20,
              background: 'rgba(5,150,105,0.08)', color: '#059669', border: '1px solid rgba(5,150,105,0.20)' }}>
              <Network style={{ width: 9, height: 9 }} /> Azure Hybrid Connection Manager
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: D.textPrimary, margin: 0, lineHeight: 1.2 }}>
            IBM Db2 for LUW Assessment
          </h1>
          <p style={{ fontSize: 12, color: D.textMuted, marginTop: 6, lineHeight: 1.6 }}>
            35-step head-to-toe analysis via Azure HCM · schemas, tables, indexes, bufferpools, tablespaces,
            WLM, RCAC, BLU Acceleration, federation, top SQL, active connections, 15-sheet Excel export
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 20 }}>
            {[
              { n: '01', Icon: Network,   label: 'HCM Relay',  sub: 'Azure Hybrid Connection Manager' },
              { n: '02', Icon: Shield,    label: 'Credentials',sub: 'Db2 username + password' },
              { n: '03', Icon: Settings2, label: 'Configure',  sub: 'Schema filter, label' },
              { n: '04', Icon: BarChart3, label: '35 Steps',   sub: 'Head-to-toe Db2 analysis' },
            ].map(({ n, Icon, label: lbl, sub }) => (
              <div key={n} style={{ padding: '12px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.72)', border: `1px solid ${D.border}`,
                backdropFilter: 'blur(4px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: D.tealDim }}>{n}</span>
                  <Icon style={{ width: 12, height: 12, color: D.teal }} />
                </div>
                <p style={{ fontSize: 12, fontWeight: 700, color: D.textPrimary, margin: 0 }}>{lbl}</p>
                <p style={{ fontSize: 10, color: D.textMuted, marginTop: 2 }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Step 1: Azure HCM ─────────────────────────────────────────── */}
        <Card>
          <CardHeader
            icon={Network} step="Step 01"
            title="Azure Hybrid Connection Manager"
            sub="Configure on-prem connectivity via Azure HCM relay"
            badge={
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: useHcm ? 'rgba(5,150,105,0.10)' : D.tealFaint,
                color: useHcm ? '#059669' : D.textMuted,
                border: `1px solid ${useHcm ? 'rgba(5,150,105,0.25)' : D.borderFaint}` }}>
                {useHcm ? 'HCM Active' : 'Direct TCP'}
              </span>
            }
          />
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* HCM explainer */}
            <div style={{ padding: '14px 16px', borderRadius: 12, background: D.tealFaint,
              border: `1px solid ${D.teal}25`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Info style={{ width: 16, height: 16, color: D.tealDim, flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: D.textPrimary, marginBottom: 4 }}>
                  What is Azure Hybrid Connection Manager?
                </p>
                <p style={{ fontSize: 11, color: D.textMuted, lineHeight: 1.6, margin: 0 }}>
                  Azure HCM creates an outbound relay from your on-prem network through Azure Service Bus
                  — no inbound firewall ports needed. Install the HCM listener on the machine that can
                  reach your Db2 server. The app then connects to a <strong>local listener port</strong>
                  (e.g. <code style={{ fontFamily: D.fontMono }}>127.0.0.1:5000</code>) which relays
                  traffic transparently to <code style={{ fontFamily: D.fontMono }}>HOSTNAME:PORT</code> on-prem.
                </p>
              </div>
            </div>

            <Toggle
              checked={useHcm}
              onChange={setUseHcm}
              label="Route connection via Azure HCM local listener"
              sub="Enable when the on-prem Db2 server is only reachable via HCM relay, not direct TCP from this app"
            />

            {useHcm && (
              <div style={{ padding: '18px 20px', borderRadius: 12, background: D.surface2,
                border: `1px solid ${D.border}`, display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* HCM local listener */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: D.tealDim, textTransform: 'uppercase',
                    letterSpacing: '0.08em', marginBottom: 12 }}>
                    LOCAL HCM LISTENER (ibm_db connects here)
                  </p>
                  <div style={{ ...G, gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                    <div>
                      <FormLabel>Local Listener Host</FormLabel>
                      <InputField icon={Radio} placeholder="127.0.0.1" value={hcmLocalHost}
                        onChange={setHcmLocalHost} mono hint="Typically 127.0.0.1 — the HCM listener binds locally" />
                    </div>
                    <div>
                      <FormLabel required>Local Listener Port</FormLabel>
                      <InputField icon={Wifi} placeholder="5000" value={hcmLocalPort}
                        onChange={setHcmLocalPort} mono hint="Port the HCM agent listens on (e.g. 5000)" />
                    </div>
                  </div>
                </div>

                {/* Azure reference fields */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: D.textMuted, textTransform: 'uppercase',
                    letterSpacing: '0.08em', marginBottom: 12 }}>
                    AZURE RELAY REFERENCE (display only — for documentation)
                  </p>
                  <div style={{ ...G, gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <FormLabel>Service Bus Relay Namespace</FormLabel>
                      <InputField icon={Link2} placeholder="my-namespace.servicebus.windows.net"
                        value={hcmRelayNamespace} onChange={setHcmRelayNamespace} mono
                        hint="Azure Service Bus namespace hosting this hybrid connection" />
                    </div>
                    <div>
                      <FormLabel>Hybrid Connection Name</FormLabel>
                      <InputField icon={Network} placeholder="db2-onprem-connection"
                        value={hcmConnectionName} onChange={setHcmConnectionName} mono
                        hint="Hybrid connection name configured in Azure Portal" />
                    </div>
                  </div>
                </div>

                <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 11,
                  background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.20)', color: '#047857' }}>
                  <strong>How it works:</strong> ibm_db will connect to{' '}
                  <code style={{ fontFamily: D.fontMono, background: 'rgba(5,150,105,0.10)', padding: '0 4px', borderRadius: 4 }}>
                    {hcmLocalHost || '127.0.0.1'}:{hcmLocalPort || '????'}
                  </code>
                  {' '}→ HCM relays → on-prem{' '}
                  <code style={{ fontFamily: D.fontMono, background: 'rgba(5,150,105,0.10)', padding: '0 4px', borderRadius: 4 }}>
                    {hostname || 'HOSTNAME'}:{port || '50000'}
                  </code>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── Step 2: Db2 Connection ────────────────────────────────────── */}
        <Card>
          <CardHeader icon={Database} step="Step 02" title="Db2 Connection Details"
            sub="On-prem server address, database name, and credentials" />
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

            {useHcm && (
              <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 11,
                background: D.tealFaint, border: `1px solid ${D.teal}25`, color: D.textMuted }}>
                <strong style={{ color: D.tealDim }}>HCM Mode:</strong> Enter the <em>on-prem</em> Db2 hostname and port
                exactly as configured in the Azure HCM endpoint — even though ibm_db will connect via the local listener above.
              </div>
            )}

            {/* Host + Port + Database */}
            <div style={{ ...G, gridTemplateColumns: '2fr 1fr 2fr', gap: 16 }}>
              <div>
                <FormLabel required>On-Prem Hostname / IP</FormLabel>
                <InputField icon={Server} placeholder="db2server.internal.corp.com"
                  value={hostname} onChange={setHostname} />
              </div>
              <div>
                <FormLabel required>Port</FormLabel>
                <InputField icon={Globe} placeholder="50000" value={port} onChange={setPort}
                  mono hint={sslEnabled ? "50001 = SSL" : "50000 = plain"} />
              </div>
              <div>
                <FormLabel required>Database Name</FormLabel>
                <InputField icon={Database} placeholder="SAMPLE" value={database}
                  onChange={setDatabase} mono />
              </div>
            </div>

            {/* Username + Password */}
            <div style={{ ...G, gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <FormLabel required>Username</FormLabel>
                <InputField icon={User} placeholder="db2inst1" value={username} onChange={setUsername} />
              </div>
              <div>
                <FormLabel required>Password</FormLabel>
                <InputField icon={Lock} placeholder="••••••••" value={password}
                  onChange={setPassword} showToggle />
              </div>
            </div>

            {/* SSL toggle */}
            <Toggle checked={sslEnabled} onChange={setSslEnabled}
              label="Enable SSL / TLS encryption"
              sub="Encrypts the connection — use port 50001 with SSL enabled" />
            {sslEnabled && (
              <div>
                <FormLabel>SSL Server Certificate Path (optional)</FormLabel>
                <InputField icon={Shield} placeholder="/etc/ssl/db2/server.arm"
                  value={sslCert} onChange={setSslCert} mono
                  hint="Server-side path to the Db2 SSL certificate (.arm or .pem)" />
              </div>
            )}

            {/* Test connection feedback */}
            {testResult?.success && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 16px', borderRadius: 10, fontSize: 12,
                background: D.greenDim, border: `1px solid ${D.green}33`, color: D.green }}>
                <CheckCircle2 style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                <div>
                  <p style={{ fontWeight: 700, marginBottom: 2 }}>Connected successfully{useHcm ? ' via HCM relay' : ''}</p>
                  <p style={{ opacity: 0.85 }}>
                    {testResult.message}
                    {testResult.service_level && ` · Version: ${testResult.service_level}`}
                  </p>
                </div>
              </div>
            )}
            {testError && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 16px', borderRadius: 10, fontSize: 12,
                background: D.redDim, border: `1px solid ${D.red}33`, color: D.red }}>
                <AlertCircle style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                <div>
                  <p style={{ fontWeight: 700, marginBottom: 2 }}>Connection failed</p>
                  <p style={{ opacity: 0.85 }}>{testError}</p>
                </div>
              </div>
            )}

            <button onClick={handleTestConnection} disabled={!canConnect || testing}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: canConnect && !testing ? 'pointer' : 'not-allowed',
                background: D.surface2, border: `1px solid ${D.border}`,
                color: D.textSecond, boxShadow: D.shadowCard,
                opacity: !canConnect ? 0.5 : 1, transition: 'all 0.15s' }}>
              {testing
                ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                : <CheckCircle2 style={{ width: 14, height: 14 }} />}
              Test Connection{useHcm ? ' via HCM' : ''}
            </button>
          </div>
        </Card>

        {/* ── Step 3: Configuration ─────────────────────────────────────── */}
        <Card>
          <CardHeader icon={Settings2} step="Step 03" title="Assessment Configuration"
            sub="Optional scope filters and labeling" />
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ ...G, gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <FormLabel>Assessment Label</FormLabel>
                <InputField icon={Tag} placeholder="e.g. Production Db2 Q3 2025"
                  value={label} onChange={setLabel} />
              </div>
              <div>
                <FormLabel>Schema Filter (optional)</FormLabel>
                <InputField icon={Database} placeholder="MYSCHEMA" mono
                  value={schemaFilter} onChange={setSchemaFilter}
                  hint="Restrict extraction to one schema. Leave blank for all non-system schemas." />
              </div>
            </div>

            {/* Coverage checklist */}
            <div style={{ padding: '14px 16px', borderRadius: 10, fontSize: 12,
              background: D.tealFaint, border: `1px solid ${D.teal}33`, color: D.tealDim }}>
              <p style={{ fontWeight: 700, marginBottom: 8 }}>35-Step Assessment Coverage</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 8px' }}>
                {[
                  'Instance & version info', 'Database configuration (DBCFG)', 'DBM configuration (DBMCFG)',
                  'Schemas, tables, views', 'Columns with cardinality stats', 'Indexes (cluster ratio, density)',
                  'Stored procedures', 'User-defined functions', 'Triggers',
                  'Sequences', 'User-defined types (UDTs)', 'Compiled packages',
                  'Event monitors', 'Tablespaces (live utilization)', 'Bufferpools (live hit-ratio)',
                  'Storage groups', 'Security — DBADM/SECADM/DATAACCESS', 'Security — RCAC & column masks',
                  'Roles, trusted contexts, audit', 'Table & column grants', 'Schema & package grants',
                  'Performance snapshot', 'Active connections', 'Top SQL by execution time',
                  'WLM service classes', 'WLM workloads', 'Federation wrappers & servers',
                  'BLU Acceleration status', 'XSR XML schema objects', '15-sheet Excel export',
                ].map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <CheckCircle2 style={{ width: 10, height: 10, color: D.teal, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: D.textSecond }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
          <div>
            {submitError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: D.red }}>
                <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                {submitError}
              </div>
            )}
          </div>
          <button onClick={handleStartAssessment} disabled={!canConnect || submitting}
            style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              cursor: canConnect && !submitting ? 'pointer' : 'not-allowed',
              background: canConnect && !submitting
                ? `linear-gradient(135deg, ${D.tealDim}, ${D.teal})`
                : D.surface2,
              color: canConnect && !submitting ? '#ffffff' : D.textMuted,
              border: 'none', boxShadow: canConnect && !submitting ? D.shadowTeal : 'none',
              opacity: !canConnect ? 0.5 : 1, transition: 'all 0.15s ease' }}>
            {submitting ? (
              <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />Starting assessment…</>
            ) : (
              <><BarChart3 style={{ width: 16, height: 16 }} />Start 35-Step IBM Db2 Assessment<ArrowRight style={{ width: 15, height: 15 }} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
