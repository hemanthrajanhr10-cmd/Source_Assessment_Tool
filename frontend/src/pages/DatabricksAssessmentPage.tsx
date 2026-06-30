import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Key, Tag, ChevronRight, CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { DatabricksAssessmentRequest } from '../types/api'
import { DatabricksLogo } from '../components/ui/SourceLogos'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:          '#F6FFFE',
  surface:     '#FFFFFF',
  surface2:    '#F0FAFA',
  border:      '#B2DDD9',
  borderFaint: '#D4EFEC',
  teal:        '#6CBDB5',
  tealDark:    '#4DA8A0',
  tealGlow:    'rgba(108,189,181,0.18)',
  tealFaint:   'rgba(108,189,181,0.07)',
  tealMid:     '#93CCC6',
  brand:       '#FF3621',
  brandGlow:   'rgba(255,54,33,0.12)',
  brandFaint:  'rgba(255,54,33,0.06)',
  textPrimary: '#0D1117',
  textSecond:  '#404555',
  textMuted:   '#767A8C',
  green:       '#059669',
  greenBg:     'rgba(5,150,105,0.08)',
  red:         '#DC2626',
  redBg:       'rgba(220,38,38,0.07)',
  shadow1:     '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.08)',
  shadow2:     '0 4px 12px rgba(77,168,160,0.10), 0 16px 40px rgba(77,168,160,0.12)',
  mono:        '"JetBrains Mono","Fira Code",monospace',
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{
      display: 'block', fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.09em',
      color: D.textMuted, marginBottom: 6,
    }}>
      {children}{required && <span style={{ color: D.red, marginLeft: 3 }}>*</span>}
    </label>
  )
}

function InputField({
  icon: Icon, placeholder, value, onChange, type = 'text',
  mono = false, hint, showToggle = false, disabled = false,
}: {
  icon?: React.ElementType; placeholder?: string; value: string
  onChange: (v: string) => void; type?: string; mono?: boolean
  hint?: string; showToggle?: boolean; disabled?: boolean
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
            pointerEvents: 'none', display: 'flex', alignItems: 'center',
          }}>
            <Icon style={{ width: 14, height: 14, color: focused ? D.teal : D.textMuted, transition: 'color 0.15s' }} />
          </div>
        )}
        <input
          type={effectiveType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: `10px ${showToggle ? 38 : 14}px 10px ${Icon ? 36 : 14}px`,
            borderRadius: 10, fontSize: 13,
            fontFamily: mono ? D.mono : 'inherit',
            background: focused ? D.surface : D.surface2,
            border: `1.5px solid ${focused ? D.teal : D.border}`,
            color: D.textPrimary, outline: 'none',
            boxShadow: focused ? `0 0 0 3px ${D.tealGlow}` : 'none',
            transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
            opacity: disabled ? 0.5 : 1,
          }}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            tabIndex={-1}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: D.textMuted,
              display: 'flex', alignItems: 'center', padding: 4,
            }}
          >
            {show ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize: 10, color: D.textMuted, marginTop: 5, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: D.surface, borderRadius: 16,
        border: `1px solid ${hovered ? D.teal : D.border}`,
        boxShadow: hovered ? D.shadow2 : D.shadow1,
        overflow: 'hidden', marginBottom: 16,
        transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function SectionHeader({ icon: Icon, title }: { icon?: React.ElementType; title: string }) {
  return (
    <div style={{
      padding: '14px 20px',
      background: `linear-gradient(90deg, ${D.tealFaint}, transparent)`,
      borderBottom: `1px solid ${D.borderFaint}`,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {Icon && <Icon style={{ width: 14, height: 14, color: D.teal }} />}
      <span style={{
        fontSize: 11, fontWeight: 700, color: D.textPrimary,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {title}
      </span>
    </div>
  )
}

export default function DatabricksAssessmentPage() {
  const navigate = useNavigate()

  const [workspaceUrl, setWorkspaceUrl] = useState('')
  const [accessToken, setAccessToken]   = useState('')
  const [label, setLabel]               = useState('')
  const [testing, setTesting]           = useState(false)
  const [testResult, setTestResult]     = useState<{ ok: boolean; user_name?: string } | null>(null)
  const [testError, setTestError]       = useState('')
  const [starting, setStarting]         = useState(false)
  const [startError, setStartError]     = useState('')

  function buildRequest(): DatabricksAssessmentRequest {
    return {
      credentials: { workspace_url: workspaceUrl.trim(), access_token: accessToken },
      label: label.trim() || undefined,
    }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null); setTestError('')
    try {
      const res = await api.databricksTestConnection(buildRequest())
      setTestResult(res.data)
    } catch (err) {
      setTestError(getApiErrorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  async function handleStart() {
    setStarting(true); setStartError('')
    try {
      const res = await api.databricksStartAssessment(buildRequest())
      navigate(`/databricks/sessions/${res.data.job_id}`)
    } catch (err) {
      setStartError(getApiErrorMessage(err))
      setStarting(false)
    }
  }

  const canSubmit = workspaceUrl.trim() && accessToken.trim()

  const checks = [
    'Cluster inventory & auto-termination', 'SQL Warehouse configuration',
    'Unity Catalog — catalogs, schemas, tables', 'External locations & storage credentials',
    'Job scheduler & DLT pipelines', 'MLflow experiments & registered models',
    'Model Serving endpoints', 'Vector Search indexes',
    'Users, groups & service principals', 'PAT & IP access list posture',
    'Secrets scopes', 'DBFS legacy mount detection',
    'Delta Sharing configuration', 'Cost optimisation signals',
  ]

  return (
    <div style={{ minHeight: '100vh', background: D.bg, padding: '32px 24px 56px', fontFamily: "'Inter Variable','Inter',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* ── Hero header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: D.surface,
            boxShadow: `0 4px 20px ${D.brandGlow}, inset 0 1px 0 rgba(255,255,255,0.9)`,
            border: `1.5px solid ${D.borderFaint}`,
            flexShrink: 0,
          }}>
            <DatabricksLogo size={44} />
          </div>
          <div>
            <h1 style={{
              fontSize: 22, fontWeight: 800, color: D.textPrimary,
              margin: 0, letterSpacing: '-0.03em', lineHeight: 1.2,
            }}>
              Databricks Assessment
            </h1>
            <p style={{ fontSize: 13, color: D.textMuted, margin: '5px 0 0', letterSpacing: '0.01em' }}>
              Workspace inventory · Unity Catalog · Compute · Security · MLflow
            </p>
          </div>
        </div>

        {/* ── Connection card ── */}
        <Card>
          <SectionHeader icon={Globe} title="Workspace Connection" />
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div>
              <FieldLabel required>Workspace URL</FieldLabel>
              <InputField
                icon={Globe}
                placeholder="https://adb-1234567890.7.azuredatabricks.net"
                value={workspaceUrl}
                onChange={setWorkspaceUrl}
                hint="Your workspace URL from the Databricks UI (Azure, AWS, or GCP)"
              />
            </div>
            <div>
              <FieldLabel required>Personal Access Token (PAT)</FieldLabel>
              <InputField
                icon={Key}
                placeholder="dapiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                value={accessToken}
                onChange={setAccessToken}
                showToggle
                mono
                hint="Generate in User Settings → Developer → Access Tokens. Needs workspace admin or broad read access."
              />
            </div>
            <div>
              <FieldLabel>Label (optional)</FieldLabel>
              <InputField
                icon={Tag}
                placeholder="e.g. Prod Workspace — Q3 2026"
                value={label}
                onChange={setLabel}
              />
            </div>

            {/* Test connection row */}
            <div style={{
              paddingTop: 16, borderTop: `1px solid ${D.borderFaint}`,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <button
                onClick={handleTest}
                disabled={!canSubmit || testing}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: D.tealFaint, border: `1.5px solid ${D.teal}`, color: D.tealDark,
                  cursor: canSubmit && !testing ? 'pointer' : 'not-allowed',
                  opacity: !canSubmit || testing ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  if (canSubmit && !testing) {
                    (e.currentTarget as HTMLButtonElement).style.background = `rgba(108,189,181,0.14)`
                    ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = D.tealFaint
                  ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
                }}
              >
                {testing
                  ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
                  : null
                }
                {testing ? 'Testing…' : 'Test Connection'}
              </button>

              {testResult?.ok && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: D.green, fontSize: 13, fontWeight: 600 }}>
                  <CheckCircle style={{ width: 15, height: 15 }} />
                  Connected as <strong>{testResult.user_name}</strong>
                </span>
              )}
              {testError && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: D.red, fontSize: 12 }}>
                  <AlertCircle style={{ width: 14, height: 14 }} /> {testError}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* ── Coverage card ── */}
        <Card style={{ background: `linear-gradient(145deg, ${D.brandFaint}, ${D.surface})`, border: `1px solid rgba(255,54,33,0.15)` }}>
          <div style={{
            padding: '14px 20px', borderBottom: `1px solid rgba(255,54,33,0.12)`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: D.brand, display: 'inline-block',
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9B3B2C', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              35-Step Assessment Covers
            </span>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 24px' }}>
              {checks.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#6B4A3E', lineHeight: 1.4 }}>
                  <span style={{ color: D.brand, flexShrink: 0, marginTop: 2, fontSize: 10 }}>▸</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── Error banner ── */}
        {startError && (
          <div style={{
            background: D.redBg, border: '1px solid rgba(220,38,38,0.20)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 16,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertCircle style={{ width: 14, height: 14, color: D.red, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: D.red, margin: 0 }}>{startError}</p>
          </div>
        )}

        {/* ── Launch button ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleStart}
            disabled={!canSubmit || starting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              background: canSubmit && !starting
                ? `linear-gradient(135deg, ${D.tealDark}, ${D.teal})`
                : D.borderFaint,
              color: canSubmit && !starting ? '#fff' : D.textMuted,
              border: 'none',
              cursor: canSubmit && !starting ? 'pointer' : 'not-allowed',
              boxShadow: canSubmit && !starting ? `0 4px 18px ${D.tealGlow}` : 'none',
              transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={e => {
              if (canSubmit && !starting) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 28px ${D.tealGlow}`
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow = canSubmit && !starting ? `0 4px 18px ${D.tealGlow}` : 'none'
            }}
            onMouseDown={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)'
            }}
            onMouseUp={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'
            }}
          >
            {starting
              ? <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />
              : null
            }
            {starting ? 'Starting…' : <>Start Assessment <ChevronRight style={{ width: 16, height: 16 }} /></>}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
