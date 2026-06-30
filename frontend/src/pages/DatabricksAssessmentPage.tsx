import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Globe, Key, Tag, ChevronRight, CheckCircle,
  AlertCircle, Loader2, Eye, EyeOff,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { DatabricksAssessmentRequest } from '../types/api'
import { DatabricksLogo } from '../components/ui/SourceLogos'

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
  brand:       '#FF3621',
  brandFaint:  'rgba(255,54,33,0.06)',
  brandBorder: 'rgba(255,54,33,0.15)',
  brandText:   '#9B3B2C',
  textPrimary: '#0D1117',
  textMuted:   '#767A8C',
  green:       '#059669',
  red:         '#DC2626',
  redBg:       'rgba(220,38,38,0.07)',
  shadow1:     '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.08)',
  shadow2:     '0 4px 12px rgba(77,168,160,0.10), 0 16px 40px rgba(77,168,160,0.12)',
  mono:        '"JetBrains Mono","Fira Code",monospace',
}

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
  mono = false, hint, showToggle = false,
}: {
  icon?: React.ElementType; placeholder?: string; value: string
  onChange: (v: string) => void; type?: string; mono?: boolean
  hint?: string; showToggle?: boolean
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

const checks = [
  'Cluster inventory & auto-termination', 'SQL Warehouse configuration',
  'Unity Catalog — catalogs, schemas, tables', 'External locations & storage credentials',
  'Job scheduler & DLT pipelines', 'MLflow experiments & registered models',
  'Model Serving endpoints', 'Vector Search indexes',
  'Users, groups & service principals', 'PAT & IP access list posture',
  'Secrets scopes', 'DBFS legacy mount detection',
  'Delta Sharing configuration', 'Cost optimisation signals',
]

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

  return (
    <div style={{
      minHeight: '100vh',
      background: D.bg,
      fontFamily: "'Inter Variable','Inter',system-ui,sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── Hero header — full width ─────────────────────────────────────────── */}
      <div style={{
        padding: '28px 40px 24px',
        background: D.surface,
        borderBottom: `1px solid ${D.borderFaint}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: D.surface,
            border: `1.5px solid ${D.borderFaint}`,
            boxShadow: D.shadow1,
            flexShrink: 0,
          }}>
            <DatabricksLogo size={36} />
          </div>
          <div>
            <h1 style={{
              fontSize: 20, fontWeight: 800, color: D.textPrimary,
              margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2,
            }}>
              Databricks Assessment
            </h1>
            <p style={{ fontSize: 12, color: D.textMuted, margin: '4px 0 0' }}>
              Workspace inventory · Unity Catalog · Compute · Security · MLflow
            </p>
          </div>
        </div>

        {/* Launch button — top right */}
        <button
          onClick={handleStart}
          disabled={!canSubmit || starting}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '11px 24px', borderRadius: 11, fontSize: 13, fontWeight: 700,
            background: canSubmit && !starting
              ? `linear-gradient(135deg, ${D.tealDark}, ${D.teal})`
              : D.borderFaint,
            color: canSubmit && !starting ? '#fff' : D.textMuted,
            border: 'none',
            cursor: canSubmit && !starting ? 'pointer' : 'not-allowed',
            boxShadow: canSubmit && !starting ? `0 4px 18px ${D.tealGlow}` : 'none',
            transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
            flexShrink: 0,
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
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)' }}
          onMouseUp={e => { if (canSubmit && !starting) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)' }}
        >
          {starting
            ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
            : null
          }
          {starting ? 'Starting…' : <>Start Assessment <ChevronRight style={{ width: 15, height: 15 }} /></>}
        </button>
      </div>

      {/* ── Body — two-column layout ─────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 340px',
        gap: 0,
        alignItems: 'start',
      }}>

        {/* Left — connection form */}
        <div style={{ padding: '32px 40px', borderRight: `1px solid ${D.borderFaint}` }}>

          {/* Section label */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24,
          }}>
            <Globe style={{ width: 15, height: 15, color: D.teal }} />
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.09em', color: D.textMuted,
            }}>
              Workspace Connection
            </span>
          </div>

          <div style={{ display: 'grid', gap: 20, maxWidth: 560 }}>
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

            {/* Test connection */}
            <div style={{
              paddingTop: 20, borderTop: `1px solid ${D.borderFaint}`,
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
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(108,189,181,0.14)'
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

            {/* Error banner */}
            {startError && (
              <div style={{
                background: D.redBg, border: '1px solid rgba(220,38,38,0.20)',
                borderRadius: 10, padding: '11px 14px',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <AlertCircle style={{ width: 14, height: 14, color: D.red, flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: D.red, margin: 0 }}>{startError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — coverage */}
        <div style={{
          padding: '32px 28px',
          background: D.surface,
          minHeight: '100%',
        }}>
          {/* Coverage header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: D.brand, display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{
              fontSize: 11, fontWeight: 700, color: D.brandText,
              textTransform: 'uppercase', letterSpacing: '0.09em',
            }}>
              35-Step Assessment Covers
            </span>
          </div>

          <div style={{
            background: `linear-gradient(145deg, ${D.brandFaint}, ${D.surface})`,
            border: `1px solid ${D.brandBorder}`,
            borderRadius: 14, padding: '18px 16px',
          }}>
            <div style={{ display: 'grid', gap: 10 }}>
              {checks.map(item => (
                <div key={item} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9,
                  fontSize: 12, color: '#6B4A3E', lineHeight: 1.45,
                }}>
                  <span style={{ color: D.brand, flexShrink: 0, marginTop: 1, fontSize: 10 }}>▸</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Info panel */}
          <div style={{
            marginTop: 20, padding: '14px 16px',
            background: D.tealFaint, borderRadius: 12,
            border: `1px solid ${D.borderFaint}`,
          }}>
            <p style={{ fontSize: 11, color: D.tealDark, margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
              Supports AWS, Azure, and GCP Databricks workspaces. Cloud is auto-detected from the workspace URL.
            </p>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
