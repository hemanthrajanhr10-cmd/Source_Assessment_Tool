import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Globe, Key, Tag, ChevronRight, CheckCircle,
  AlertCircle, Loader2,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { DatabricksAssessmentRequest } from '../types/api'
import { DatabricksLogo } from '../components/ui/SourceLogos'
import { theme } from './databricks/theme'
import { Button } from './databricks/components/Button'
import { FieldLabel, InputField } from './databricks/components/Field'
import { SectionHeader } from './databricks/components/Section'
import { Reveal } from './databricks/components/Reveal'
import GlobalStyles from './databricks/components/GlobalStyles'

const coverage = [
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
    <div className="db-scope" style={{ minHeight: '100vh', background: theme.color.canvas, fontFamily: theme.font.body, display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '26px 40px 22px', background: theme.color.surface,
        borderBottom: `1px solid ${theme.color.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: theme.radius.md, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: theme.color.surface, border: `1px solid ${theme.color.border}`,
            flexShrink: 0,
          }}>
            <DatabricksLogo size={32} />
          </div>
          <div>
            <h1 style={{
              fontFamily: theme.font.display, fontSize: 21, fontWeight: 800,
              color: theme.color.ink, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2,
            }}>
              Databricks Assessment
            </h1>
            <p style={{ fontSize: 12, color: theme.color.inkMuted, margin: '4px 0 0' }}>
              Workspace inventory · Unity Catalog · Compute · Security · MLflow
            </p>
          </div>
        </div>

        <Button variant="primary" Icon={starting ? Loader2 : undefined} disabled={!canSubmit || starting} onClick={handleStart}>
          {starting ? 'Starting…' : <>Start Assessment <ChevronRight style={{ width: 14, height: 14, marginLeft: -2 }} /></>}
        </Button>
      </div>

      {/* ── Body — two-column layout ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', alignItems: 'start', maxWidth: 1400, margin: '0 auto', width: '100%' }}>

        {/* Left — connection form */}
        <div style={{ padding: '32px 40px', borderRight: `1px solid ${theme.color.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
            <Globe style={{ width: 14, height: 14, color: theme.color.inkMuted }} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.color.inkMuted }}>
              Workspace Connection
            </span>
          </div>

          <div style={{ display: 'grid', gap: 20, maxWidth: 560 }}>
            <Reveal>
              <FieldLabel required>Workspace URL</FieldLabel>
              <InputField
                icon={Globe}
                placeholder="https://adb-1234567890.7.azuredatabricks.net"
                value={workspaceUrl}
                onChange={setWorkspaceUrl}
                hint="Your workspace URL from the Databricks UI (Azure, AWS, or GCP)"
              />
            </Reveal>

            <Reveal delay={0.05}>
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
            </Reveal>

            <Reveal delay={0.1}>
              <FieldLabel>Label (optional)</FieldLabel>
              <InputField
                icon={Tag}
                placeholder="e.g. Prod Workspace — Q3 2026"
                value={label}
                onChange={setLabel}
              />
            </Reveal>

            {/* Test connection */}
            <Reveal delay={0.15} style={{ paddingTop: 20, borderTop: `1px solid ${theme.color.divider}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Button variant="secondary" Icon={testing ? Loader2 : undefined} disabled={!canSubmit || testing} onClick={handleTest}>
                {testing ? 'Testing…' : 'Test Connection'}
              </Button>

              {testResult?.ok && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme.color.success, fontSize: 13, fontWeight: 600 }}>
                  <CheckCircle style={{ width: 15, height: 15 }} />
                  Connected as <strong>{testResult.user_name}</strong>
                </span>
              )}
              {testError && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme.color.danger, fontSize: 12 }}>
                  <AlertCircle style={{ width: 14, height: 14 }} /> {testError}
                </span>
              )}
            </Reveal>

            {startError && (
              <div style={{
                background: theme.color.dangerBg, borderRadius: theme.radius.sm,
                padding: '11px 14px', display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <AlertCircle style={{ width: 14, height: 14, color: theme.color.danger, flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: theme.color.danger, margin: 0 }}>{startError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right — coverage panel */}
        <div style={{ padding: '32px 28px', minHeight: '100%' }}>
          <SectionHeader title="Assessment Coverage" count={coverage.length} />
          <div style={{ display: 'grid', gap: 0, marginTop: 4 }}>
            {coverage.map((item, i) => (
              <Reveal key={item} delay={0.1 + i * 0.03} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '9px 0', borderBottom: i < coverage.length - 1 ? `1px solid ${theme.color.divider}` : 'none',
              }}>
                <span style={{
                  fontFamily: theme.font.mono, fontSize: 10, color: theme.color.accent,
                  fontWeight: 700, flexShrink: 0, marginTop: 1, width: 16,
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 12, color: theme.color.inkSecondary, lineHeight: 1.5 }}>{item}</span>
              </Reveal>
            ))}
          </div>

          <p style={{
            marginTop: 22, paddingTop: 16, borderTop: `1px solid ${theme.color.divider}`,
            fontSize: 11, color: theme.color.inkMuted, lineHeight: 1.6,
          }}>
            Supports AWS, Azure, and GCP Databricks workspaces. Cloud is auto-detected from the workspace URL.
          </p>
        </div>
      </div>

      <GlobalStyles />
    </div>
  )
}
