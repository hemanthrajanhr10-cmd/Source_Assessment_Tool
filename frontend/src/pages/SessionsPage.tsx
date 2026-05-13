import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  PlusCircle, RefreshCw, ExternalLink, Layers,
  CheckCircle2, XCircle, Loader2, AlertTriangle, StopCircle, Clock,
} from 'lucide-react'
import { api } from '../api/client'
import Button from '../components/ui/Button'
import Loader3D from '../components/ui/Loader3D'
import type { SessionStatus } from '../types/api'
import { formatDateTime, elapsed } from '../utils/dateTime'

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { icon: React.ReactNode; label: string; cls: string }> = {
    completed: { icon: <CheckCircle2 className="h-3 w-3" />, label: 'Completed', cls: 'bg-earth-50 text-earth-700 ring-1 ring-earth-200' },
    partial:   { icon: <AlertTriangle className="h-3 w-3" />, label: 'Partial',   cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'    },
    failed:    { icon: <XCircle className="h-3 w-3" />,       label: 'Failed',    cls: 'bg-red-50 text-red-700 ring-1 ring-red-200'           },
    running:   { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: 'Running', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'  },
    cancelled: { icon: <StopCircle className="h-3 w-3" />,    label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'    },
    pending:   { icon: <Clock className="h-3 w-3" />,         label: 'Pending',   cls: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'    },
  }
  const { icon, label, cls } = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {icon} {label}
    </span>
  )
}

function ProgressBar({ completed, total, failed }: { completed: number; total: number; failed: number }) {
  if (total === 0) return null
  return (
    <div className="w-28 h-1.5 rounded-full bg-slate-200 overflow-hidden flex">
      <div className="h-full bg-earth-500 transition-all" style={{ width: `${(completed / total) * 100}%` }} />
      <div className="h-full bg-red-400 transition-all"     style={{ width: `${(failed / total) * 100}%` }} />
    </div>
  )
}

export default function SessionsPage() {
  const navigate = useNavigate()

  const { data: sessions, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions().then((r) => r.data),
    refetchInterval: (query) => {
      const s = query.state.data ?? []
      return s.some((x) => x.status === 'pending' || x.status === 'running') ? 3000 : false
    },
  })

  const sorted = [...(sessions ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Assessment Sessions</h1>
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
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
            onClick={() => navigate('/')}
          >
            New Assessment
          </Button>
        </div>
      </div>

      {isLoading && <Loader3D message="Loading sessions" />}

      {isError && !isLoading && (
        <div className="card p-8 text-center">
          <p className="font-medium text-red-600">Failed to load sessions.</p>
          <p className="mt-1 text-sm text-slate-500">
            <button className="text-earth-700 hover:text-earth-800" onClick={() => refetch()}>Retry</button>
          </p>
        </div>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 border border-slate-200">
            <Layers className="h-7 w-7 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">No sessions yet</p>
            <p className="mt-1 text-sm text-slate-500">Create your first assessment to see results here.</p>
          </div>
          <Button leftIcon={<PlusCircle className="h-4 w-4" />} onClick={() => navigate('/')}>
            New Assessment
          </Button>
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Session', 'Status', 'Progress', 'Created', 'Elapsed', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {sorted.map((session, idx) => (
                  <tr
                    key={session.session_id}
                    className={`transition-colors cursor-pointer hover:bg-earth-50/40 ${
                      idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                    }`}
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
                      <div className="space-y-1.5">
                        <p className="text-xs text-slate-500">
                          {session.completed_jobs}/{session.total_jobs} done
                          {session.failed_jobs > 0 && (
                            <span className="text-red-600 ml-1">({session.failed_jobs} failed)</span>
                          )}
                        </p>
                        <ProgressBar
                          completed={session.completed_jobs}
                          total={session.total_jobs}
                          failed={session.failed_jobs}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap text-sm">
                      {formatDateTime(session.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap tabular-nums font-mono text-sm">
                      {elapsed(session.created_at, session.completed_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-earth-600 hover:text-earth-800 transition-colors"
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
