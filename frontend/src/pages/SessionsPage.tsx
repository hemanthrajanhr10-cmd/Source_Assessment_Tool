import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PlusCircle, RefreshCw, ExternalLink, Layers, CheckCircle2, XCircle, Loader2, AlertTriangle, StopCircle } from 'lucide-react'
import { api } from '../api/client'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import type { SessionStatus } from '../types/api'
import { formatDateTime, elapsed } from '../utils/dateTime'

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" /> Completed
        </span>
      )
    case 'partial':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="h-3 w-3" /> Partial
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
          <XCircle className="h-3 w-3" /> Failed
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <Loader2 className="h-3 w-3 animate-spin" /> Running
        </span>
      )
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
          <StopCircle className="h-3 w-3" /> Cancelled
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
          Pending
        </span>
      )
  }
}

function ProgressBar({ completed, total, failed }: { completed: number; total: number; failed: number }) {
  if (total === 0) return null
  const completedPct = (completed / total) * 100
  const failedPct = (failed / total) * 100
  return (
    <div className="w-32 h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
      <div className="h-full bg-emerald-400 transition-all" style={{ width: `${completedPct}%` }} />
      <div className="h-full bg-red-400 transition-all" style={{ width: `${failedPct}%` }} />
    </div>
  )
}

export default function SessionsPage() {
  const navigate = useNavigate()

  const { data: sessions, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions().then((r) => r.data),
    refetchInterval: (query) => {
      const sessions = query.state.data ?? []
      const hasActive = sessions.some((s) => s.status === 'pending' || s.status === 'running')
      return hasActive ? 3000 : false
    },
  })

  const sorted = [...(sessions ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assessment Sessions</h1>
          <p className="mt-1 text-sm text-slate-500">
            {sorted.length > 0
              ? `${sorted.length} session${sorted.length !== 1 ? 's' : ''} total`
              : 'No sessions yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            leftIcon={<PlusCircle className="h-4 w-4" />}
            onClick={() => navigate('/')}
          >
            New Assessment
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Spinner size="xl" className="text-brand-500" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="card p-8 text-center text-slate-500">
          <p className="font-medium text-red-600">Failed to load sessions.</p>
          <p className="mt-1 text-sm">
            <button className="text-brand-600 hover:underline" onClick={() => refetch()}>Retry</button>
          </p>
        </div>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Layers className="h-7 w-7 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">No sessions yet</p>
            <p className="mt-1 text-sm text-slate-400">Create your first assessment to see results here.</p>
          </div>
          <Button leftIcon={<PlusCircle className="h-4 w-4" />} onClick={() => navigate('/')}>
            New Assessment
          </Button>
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Session', 'Status', 'Progress', 'Created', 'Elapsed', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sorted.map((session) => (
                  <tr
                    key={session.session_id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/sessions/${session.session_id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-800 truncate max-w-xs">
                        {session.label ?? (
                          <span className="text-slate-400 font-normal italic">Unlabeled</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        {session.session_id.slice(0, 8)}…
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <SessionStatusBadge status={session.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500">
                          {session.completed_jobs}/{session.total_jobs} done
                          {session.failed_jobs > 0 && (
                            <span className="text-red-500 ml-1">({session.failed_jobs} failed)</span>
                          )}
                        </p>
                        <ProgressBar
                          completed={session.completed_jobs}
                          total={session.total_jobs}
                          failed={session.failed_jobs}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                      {formatDateTime(session.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap tabular-nums">
                      {elapsed(session.created_at, session.completed_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline"
                        onClick={(e) => { e.stopPropagation(); navigate(`/sessions/${session.session_id}`) }}
                      >
                        View <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
