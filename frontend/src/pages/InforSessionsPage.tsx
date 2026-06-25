import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Loader2, Clock,
  ChevronRight, Plus, AlertCircle, RefreshCw,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { InforSessionRecord, InforEngine } from '../types/api'
import { INFOR_ENGINES } from '../types/api'
import { InforLogo } from '../components/ui/SourceLogos'

function engineLabel(e: InforEngine | undefined): string {
  return INFOR_ENGINES.find(m => m.value === e)?.label ?? (e?.toUpperCase() ?? '—')
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string; text: string }> = {
    completed: { icon: <CheckCircle2 className="h-3 w-3" />, cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', text: 'Completed' },
    failed:    { icon: <XCircle className="h-3 w-3" />,     cls: 'bg-red-50 text-red-700 ring-1 ring-red-200',           text: 'Failed' },
    running:   { icon: <Loader2 className="h-3 w-3 animate-spin" />, cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', text: 'Running' },
    pending:   { icon: <Clock className="h-3 w-3" />,       cls: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',    text: 'Pending' },
    cancelled: { icon: <XCircle className="h-3 w-3" />,     cls: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',    text: 'Cancelled' },
  }
  const s = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.icon}{s.text}
    </span>
  )
}

function EngineTag({ engine }: { engine?: InforEngine }) {
  if (!engine) return null
  const colorMap: Record<InforEngine, string> = {
    m3:  'bg-blue-50 text-blue-700 border border-blue-200',
    ln:  'bg-indigo-50 text-indigo-700 border border-indigo-200',
    csi: 'bg-sky-50 text-sky-700 border border-sky-200',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${colorMap[engine] ?? 'bg-slate-100 text-slate-600'}`}>
      {engine.toUpperCase()}
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

export default function InforSessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<InforSessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.inforListSessions()
      setSessions(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen p-6" style={{ background: '#F0FAF9', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl"
              style={{ background: 'linear-gradient(135deg, #1E4D8C, #0083BE)', boxShadow: '0 4px 14px rgba(30,77,140,0.28)' }}>
              <InforLogo size={28} />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight">Infor CloudSuite Assessments</h1>
              <p className="text-xs text-slate-400 mt-0.5">M3 · LN · CSI/SyteLine — all engines</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600
                         bg-white border border-slate-200 hover:border-teal-300 hover:text-teal-700 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
            <button
              onClick={() => navigate('/infor/new')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #1E4D8C, #0083BE)', boxShadow: '0 2px 10px rgba(30,77,140,0.28)' }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Assessment
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#0083BE' }} />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, #1E4D8C, #0083BE)' }}>
              <InforLogo size={36} />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">No assessments yet</h3>
            <p className="text-sm text-slate-400 mb-5 max-w-xs">
              Start a new Infor CloudSuite assessment to analyse M3, LN, or CSI environments.
            </p>
            <button
              onClick={() => navigate('/infor/new')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #1E4D8C, #0083BE)' }}
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
                onClick={() => navigate(`/infor/sessions/${s.job_id}`)}
                className="w-full text-left bg-white rounded-2xl border border-slate-200/80 p-5
                           hover:border-teal-300 hover:shadow-md transition-all duration-150 group"
                style={{ boxShadow: '0 1px 3px rgba(77,168,160,0.04), 0 4px 12px rgba(77,168,160,0.06)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'linear-gradient(135deg, #1E4D8C, #0083BE)' }}>
                      <InforLogo size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {s.label || engineLabel(s.engine)}
                        </span>
                        <EngineTag engine={s.engine} />
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Tenant: <span className="font-mono">{s.tenant_id || '—'}</span>
                        {s.engine && <> · {engineLabel(s.engine)}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Score badge */}
                    {s.results?.overall_score != null && (
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Score</p>
                        <p className="text-sm font-bold" style={{
                          color: s.results.overall_score >= 80 ? '#059669'
                            : s.results.overall_score >= 60 ? '#D97706' : '#DC2626'
                        }}>
                          {s.results.overall_score.toFixed(0)}%
                        </p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{formatDate(s.created_at)}</p>
                      <p className="text-[10px] text-slate-300">{relativeTime(s.created_at)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-teal-400 transition-colors" />
                  </div>
                </div>

                {/* Findings summary */}
                {s.results && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 flex-wrap">
                    {s.results.total_checks > 0 && (
                      <span className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-600">{s.results.total_checks}</span> checks
                      </span>
                    )}
                    {s.results.critical_findings > 0 && (
                      <span className="text-xs font-semibold text-red-600">
                        {s.results.critical_findings} critical
                      </span>
                    )}
                    {s.results.high_findings > 0 && (
                      <span className="text-xs font-semibold text-orange-600">
                        {s.results.high_findings} high
                      </span>
                    )}
                    {s.results.warnings > 0 && (
                      <span className="text-xs text-amber-600">
                        {s.results.warnings} warnings
                      </span>
                    )}
                    {s.results.critical_findings === 0 && s.results.high_findings === 0 && s.results.warnings === 0 && (
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
