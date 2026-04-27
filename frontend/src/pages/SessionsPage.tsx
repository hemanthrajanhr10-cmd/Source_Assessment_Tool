import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  PlusCircle, RefreshCw, ExternalLink, Layers,
  CheckCircle2, XCircle, Loader2, AlertTriangle, StopCircle, Clock,
} from 'lucide-react'
import { api } from '../api/client'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import type { SessionStatus } from '../types/api'
import { formatDateTime, elapsed } from '../utils/dateTime'

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { icon: React.ReactNode; label: string; cls: string }> = {
    completed: { icon: <CheckCircle2 className="h-3 w-3" />, label: 'Completed', cls: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20' },
    partial:   { icon: <AlertTriangle className="h-3 w-3" />, label: 'Partial',   cls: 'bg-amber-500/10  text-amber-400  ring-1 ring-amber-500/20'  },
    failed:    { icon: <XCircle className="h-3 w-3" />,       label: 'Failed',    cls: 'bg-red-500/10    text-red-400    ring-1 ring-red-500/20'    },
    running:   { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: 'Running', cls: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20' },
    cancelled: { icon: <StopCircle className="h-3 w-3" />,    label: 'Cancelled', cls: 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700/50' },
    pending:   { icon: <Clock className="h-3 w-3" />,         label: 'Pending',   cls: 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700/50' },
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
    <div className="w-28 h-1.5 rounded-full bg-zinc-800 overflow-hidden flex">
      <div className="h-full bg-emerald-500/70 transition-all" style={{ width: `${(completed / total) * 100}%` }} />
      <div className="h-full bg-red-500/70 transition-all"     style={{ width: `${(failed / total) * 100}%` }} />
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50 font-display">Assessment Sessions</h1>
          <p className="mt-1 text-sm text-zinc-500">
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

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-zinc-600">
          <Spinner size="xl" className="text-amber-500" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="card p-8 text-center">
          <p className="font-medium text-red-400">Failed to load sessions.</p>
          <p className="mt-1 text-sm text-zinc-500">
            <button className="text-amber-400 hover:text-amber-300" onClick={() => refetch()}>Retry</button>
          </p>
        </div>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800/80 border border-zinc-700/50">
            <Layers className="h-7 w-7 text-zinc-600" />
          </div>
          <div>
            <p className="font-semibold text-zinc-300">No sessions yet</p>
            <p className="mt-1 text-sm text-zinc-600">Create your first assessment to see results here.</p>
          </div>
          <Button leftIcon={<PlusCircle className="h-4 w-4" />} onClick={() => navigate('/')}>
            New Assessment
          </Button>
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full divide-y divide-zinc-800/50 text-sm">
              <thead className="bg-zinc-900/80">
                <tr>
                  {['Session', 'Status', 'Progress', 'Created', 'Elapsed', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-widest whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {sorted.map((session) => (
                  <tr
                    key={session.session_id}
                    className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/sessions/${session.session_id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-zinc-200 truncate max-w-xs">
                        {session.label ?? (
                          <span className="text-zinc-600 font-normal italic">Unlabeled</span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-600 font-mono mt-0.5">
                        {session.session_id.slice(0, 8)}…
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <SessionStatusBadge status={session.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-1.5">
                        <p className="text-xs text-zinc-500">
                          {session.completed_jobs}/{session.total_jobs} done
                          {session.failed_jobs > 0 && (
                            <span className="text-red-400/80 ml-1">({session.failed_jobs} failed)</span>
                          )}
                        </p>
                        <ProgressBar
                          completed={session.completed_jobs}
                          total={session.total_jobs}
                          failed={session.failed_jobs}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-500 whitespace-nowrap text-sm">
                      {formatDateTime(session.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-500 whitespace-nowrap tabular-nums text-sm">
                      {elapsed(session.created_at, session.completed_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-500/70 hover:text-amber-400 transition-colors"
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
