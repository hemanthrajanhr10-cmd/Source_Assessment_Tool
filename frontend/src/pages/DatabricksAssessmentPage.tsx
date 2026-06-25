import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Key, Tag, ChevronRight, CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { DatabricksAssessmentRequest } from '../types/api'
import { DatabricksIconLogo } from '../components/ui/SourceLogos'

const FIELD: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #CBD5E1', fontSize: 14, outline: 'none',
  background: '#FAFBFC', color: '#1E293B', boxSizing: 'border-box',
}
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4, display: 'block' }
const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E8F0',
  borderRadius: 16, padding: 24, marginBottom: 20,
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
}
const BTN_PRIMARY: React.CSSProperties = {
  background: 'linear-gradient(135deg, #FF3621, #FC5C35)',
  color: '#fff', border: 'none', borderRadius: 10,
  padding: '11px 28px', fontWeight: 700, fontSize: 14,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
}
const BTN_SECONDARY: React.CSSProperties = {
  background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0',
  borderRadius: 10, padding: '11px 20px', fontWeight: 600, fontSize: 14,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
}

export default function DatabricksAssessmentPage() {
  const navigate = useNavigate()

  const [workspaceUrl, setWorkspaceUrl]     = useState('')
  const [accessToken, setAccessToken]       = useState('')
  const [showToken, setShowToken]           = useState(false)
  const [label, setLabel]                   = useState('')
  const [testing, setTesting]               = useState(false)
  const [testResult, setTestResult]         = useState<{ ok: boolean; user_name?: string } | null>(null)
  const [testError, setTestError]           = useState('')
  const [starting, setStarting]             = useState(false)
  const [startError, setStartError]         = useState('')

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
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>

      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 32 }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16,
          background: 'linear-gradient(135deg, #FF3621 0%, #FC5C35 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(255,54,33,0.30)',
        }}>
          <DatabricksIconLogo size={36} />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: 0 }}>
            Databricks Assessment
          </h1>
          <p style={{ fontSize: 14, color: '#64748B', margin: '4px 0 0' }}>
            Workspace inventory · Unity Catalog · Compute · Security · MLflow
          </p>
        </div>
      </div>

      {/* Connection card */}
      <div style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', marginTop: 0, marginBottom: 20 }}>
          Workspace Connection
        </h2>

        <div style={{ marginBottom: 16 }}>
          <label style={LABEL}>
            <Globe size={12} style={{ marginRight: 4 }} />
            Workspace URL
          </label>
          <input
            style={FIELD}
            placeholder="https://adb-1234567890123456.7.azuredatabricks.net"
            value={workspaceUrl}
            onChange={e => setWorkspaceUrl(e.target.value)}
            autoComplete="off"
          />
          <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
            Your workspace URL from the Databricks UI (Azure, AWS, or GCP)
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={LABEL}>
            <Key size={12} style={{ marginRight: 4 }} />
            Personal Access Token (PAT)
          </label>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...FIELD, paddingRight: 40 }}
              type={showToken ? 'text' : 'password'}
              placeholder="dapiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowToken(s => !s)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
            Generate a PAT in User Settings → Developer → Access Tokens. Needs workspace admin or broad read access.
          </p>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={LABEL}>
            <Tag size={12} style={{ marginRight: 4 }} />
            Label (optional)
          </label>
          <input
            style={FIELD}
            placeholder="e.g. Prod Workspace — Q3 2026"
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
        </div>

        {/* Test connection */}
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button style={BTN_SECONDARY} onClick={handleTest} disabled={!canSubmit || testing}>
            {testing
              ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Testing…</>
              : 'Test Connection'
            }
          </button>

          {testResult?.ok && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16A34A', fontSize: 13, fontWeight: 600 }}>
              <CheckCircle size={16} />
              Connected as <strong>{testResult.user_name}</strong>
            </span>
          )}
          {testError && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#DC2626', fontSize: 13 }}>
              <AlertCircle size={14} /> {testError}
            </span>
          )}
        </div>
      </div>

      {/* What will be assessed */}
      <div style={{ ...CARD, background: 'linear-gradient(135deg, #FFF7F6 0%, #FFF 100%)', border: '1px solid #FFD9D2' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#9B3B2C', marginTop: 0, marginBottom: 12 }}>
          35-Step Assessment Covers
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
          {[
            'Cluster inventory & auto-termination', 'SQL Warehouse configuration',
            'Unity Catalog — catalogs, schemas, tables', 'External locations & storage credentials',
            'Job scheduler & DLT pipelines', 'MLflow experiments & registered models',
            'Model Serving endpoints', 'Vector Search indexes',
            'Users, groups & service principals', 'PAT & IP access list posture',
            'Secrets scopes', 'DBFS legacy mount detection',
            'Delta Sharing configuration', 'Cost optimisation signals',
          ].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6B4A3E' }}>
              <span style={{ color: '#FF3621', flexShrink: 0 }}>▸</span> {item}
            </div>
          ))}
        </div>
      </div>

      {/* Start */}
      {startError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#DC2626', fontSize: 13, display: 'flex', gap: 8 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {startError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={BTN_PRIMARY} onClick={handleStart} disabled={!canSubmit || starting}>
          {starting
            ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Starting…</>
            : <>Start Assessment <ChevronRight size={16} /></>
          }
        </button>
      </div>
    </div>
  )
}
