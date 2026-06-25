import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Loader2, Clock,
  ChevronRight, Plus, AlertCircle, RefreshCw,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { DatabricksSessionRecord } from '../types/api'
import { DatabricksIconLogo } from '../components/ui/SourceLogos'

const BRAND = '#FF3621'
const BRAND_DIM = 'rgba(255,54,33,0.10)'
const BRAND_BORDER = 'rgba(255,54,33,0.22)'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    completed: { icon: <CheckCircle2 className="h-3 w-3" />, cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Completed' },
    failed:    { icon: <XCircle className="h-3 w-3" />,      cls: 'bg-red-50 text-red-700 ring-1 ring-red-200',           label: 'Failed' },
    running:   { icon: <Loader2 className="h-3 w-3 animate-spin" />, cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', label: 'Running' },
    pending:   { icon: <Clock className="h-3 w-3" />,        cls: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',    label: 'Pending' },
  }
  const s = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  )
}

function CloudTag({ cloud }: { cloud?: string }) {
  if (!cloud) return null
  const colorMap: Record<string, string> = {
    azure: 'bg-blue-50 text-blue-700 border border-blue-200',
    aws:   'bg-orange-50 text-orange-700 border border-orange-200',
    gcp:   'bg-green-50 text-green-700 border border-green-200',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${colorMap[cloud.toLowerCase()] ?? 'bg-slate-100 text-slate-600'}`}>
      {cloud.toUpperCase()}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function workspaceShort(url?: string): string {
  if (!url) return '—'
  try {
    return new URL(url).hostname.replace('.azuredatabricks.net', '').replace('.cloud.databricks.com', '')
  } catch {
    return url
  }
}

export default function DatabricksSessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<DatabricksSessionRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.databricksListSessions()
      setSessions(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen p-6" style={{ background: '#FFF7F5', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #FC5C35)`, boxShadow: `0 4px 14px ${BRAND_DIM}` }}>
              <DatabricksIconLogo size={28} />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight">Databricks Assessments</h1>
              <p className="text-xs text-slate-400 mt-0.5">Workspace · Unity Catalog · Compute · Security · MLflow</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600
                         bg-white border border-slate-200 hover:border-orange-300 hover:text-orange-700 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
            <button
              onClick={() => navigate('/databricks/new')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #FC5C35)`, boxShadow: `0 2px 10px ${BRAND_DIM}` }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Assessment
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND }} />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #FC5C35)` }}>
              <DatabricksIconLogo size={36} />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">No assessments yet</h3>
            <p className="text-sm text-slate-400 mb-5 max-w-xs">
              Start a new Databricks assessment to analyse workspace inventory, Unity Catalog, compute, and security posture.
            </p>
            <button
              onClick={() => navigate('/databricks/new')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #FC5C35)` }}
            >
              <Plus className="h-4 w-4" />
              New Assessment
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <button
                key={s.job_id}
                onClick={() => navigate(`/databricks/sessions/${s.job_id}`)}
                className="w-full text-left bg-white rounded-2xl border border-slate-200/80 p-5
                           hover:border-orange-300 hover:shadow-md transition-all duration-150 group"
                style={{ boxShadow: '0 1px 3px rgba(255,54,33,0.04), 0 4px 12px rgba(255,54,33,0.06)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `linear-gradient(135deg, ${BRAND}, #FC5C35)` }}>
                      <DatabricksIconLogo size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {s.label || s.workspace_name || workspaceShort(s.workspace_url)}
                        </span>
                        <CloudTag cloud={s.cloud} />
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1 font-mono truncate max-w-sm">
                        {s.workspace_url || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {s.overall_score != null && (
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Score</p>
                        <p className="text-sm font-bold" style={{
                          color: s.overall_score >= 80 ? '#059669'
                            : s.overall_score >= 60 ? '#D97706' : '#DC2626',
                        }}>
                          {s.overall_score.toFixed(0)}%
                        </p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{formatDate(s.created_at)}</p>
                      <p className="text-[10px] text-slate-300">{relativeTime(s.created_at)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-orange-400 transition-colors" />
                  </div>
                </div>

                {/* Metrics row */}
                {(s.cluster_count != null || s.warehouse_count != null || s.catalog_count != null || s.job_count != null || s.total_checks != null) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 flex-wrap">
                    {s.cluster_count != null && (
                      <span className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-600">{s.cluster_count}</span> clusters
                      </span>
                    )}
                    {s.warehouse_count != null && (
                      <span className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-600">{s.warehouse_count}</span> warehouses
                      </span>
                    )}
                    {s.catalog_count != null && (
                      <span className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-600">{s.catalog_count}</span> catalogs
                      </span>
                    )}
                    {s.job_count != null && (
                      <span className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-600">{s.job_count}</span> jobs
                      </span>
                    )}
                    {s.total_checks != null && (
                      <span className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-600">{s.total_checks}</span> checks
                      </span>
                    )}
                    {s.critical_findings != null && s.critical_findings > 0 && (
                      <span className="text-xs font-semibold text-red-600">{s.critical_findings} critical</span>
                    )}
                    {s.high_findings != null && s.high_findings > 0 && (
                      <span className="text-xs font-semibold text-orange-600">{s.high_findings} high</span>
                    )}
                    {s.critical_findings === 0 && s.high_findings === 0 && s.status === 'completed' && (
                      <span className="text-xs text-emerald-600 font-medium">No critical findings</span>
                    )}
                  </div>
                )}

                {/* Error */}
                {s.status === 'failed' && s.error && (
                  <div className="mt-3 pt-3 border-t border-red-100">
                    <p className="text-xs text-red-500 truncate">{s.error}</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
