import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Loader2, Clock,
  ChevronRight, Plus, AlertCircle, RefreshCw,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { SapSessionRecord, SapVariant } from '../types/api'
import { SAP_VARIANTS } from '../types/api'
import Button from '../components/ui/Button'

function variantLabel(v: SapVariant): string {
  return SAP_VARIANTS.find((m) => m.value === v)?.label ?? v
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
      {s.icon}
      {s.text}
    </span>
  )
}

function ProtocolTag({ variant }: { variant: SapVariant }) {
  const meta = SAP_VARIANTS.find((m) => m.value === variant)
  if (!meta) return null
  const colors: Record<string, string> = {
    rfc:   'bg-tide-50 text-tide-700 border border-tide-200',
    jdbc:  'bg-amber-50 text-amber-700 border border-amber-200',
    rest:  'bg-grove-50 text-grove-700 border border-grove-200',
    odata: 'bg-ember-50 text-ember-700 border border-ember-200',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${colors[meta.protocol] ?? 'bg-slate-100 text-slate-600'}`}>
      {meta.protocol.toUpperCase()}
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

export default function SapSessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SapSessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.sapListSessions()
      setSessions(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">SAP Assessments</h1>
          <p className="mt-1 text-sm text-slate-500">All SAP system assessment runs across all variants.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Button
            size="sm"
            onClick={() => navigate('/sap/new')}
            rightIcon={<Plus className="h-3.5 w-3.5" />}
          >
            New Assessment
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-5">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          {error}
        </div>
      )}

      {loading && sessions.length === 0 ? (
        <div className="card flex items-center justify-center py-16 gap-3 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading assessments…</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center gap-4">
          <div
            className="h-12 w-12 rounded-2xl flex items-center justify-center overflow-hidden"
            style={{ background: '#F8FAFF', border: '1px solid #C5D5EC' }}
          >
            <img src="/logos/sap.svg" alt="SAP" style={{ height: 36, width: 36 }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">No SAP assessments yet</p>
            <p className="text-xs text-slate-400 mt-1">Run your first assessment to get started.</p>
          </div>
          <Button size="sm" onClick={() => navigate('/sap/new')} rightIcon={<Plus className="h-3.5 w-3.5" />}>
            New Assessment
          </Button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">System</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Label</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Started</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <tr
                  key={s.job_id}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                  onClick={() => navigate(`/sap/sessions/${s.job_id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProtocolTag variant={s.variant} />
                      <span className="font-medium text-slate-800">{variantLabel(s.variant)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                    {s.label || <span className="text-slate-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                    {s.error && (
                      <p className="text-xs text-red-500 mt-0.5 truncate max-w-[200px]" title={s.error}>{s.error}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono whitespace-nowrap" title={formatDate(s.created_at)}>
                    {relativeTime(s.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="h-4 w-4 text-slate-300 ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
