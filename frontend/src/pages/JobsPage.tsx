import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PlusCircle, RefreshCw, ExternalLink, ClipboardList } from 'lucide-react'
import { api } from '../api/client'
import { StatusBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { formatDateTime, elapsed } from '../utils/dateTime'

export default function JobsPage() {
  const navigate = useNavigate()

  const { data: jobs, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.listJobs().then((r) => r.data),
    refetchInterval: (query) => {
      const jobs = query.state.data ?? []
      const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'running')
      return hasActive ? 3000 : false
    },
  })

  const sorted = [...(jobs ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assessment Jobs</h1>
          <p className="mt-1 text-sm text-slate-500">
            {sorted.length > 0
              ? `${sorted.length} job${sorted.length !== 1 ? 's' : ''} total`
              : 'No jobs yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />}
            onClick={() => refetch()}
            aria-label="Refresh jobs"
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

      {/* States */}
      {isLoading && (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Spinner size="xl" className="text-brand-500" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="card p-8 text-center text-slate-500">
          <p className="font-medium text-red-600">Failed to load jobs.</p>
          <p className="mt-1 text-sm">Make sure the backend is running, then{' '}
            <button className="text-brand-600 hover:underline" onClick={() => refetch()}>retry</button>.
          </p>
        </div>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <ClipboardList className="h-7 w-7 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">No assessments yet</p>
            <p className="mt-1 text-sm text-slate-400">Run your first assessment to see results here.</p>
          </div>
          <Button
            leftIcon={<PlusCircle className="h-4 w-4" />}
            onClick={() => navigate('/')}
          >
            New Assessment
          </Button>
        </div>
      )}

      {/* Table */}
      {!isLoading && sorted.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Job', 'Status', 'Created', 'Duration', ''].map((h) => (
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
                {sorted.map((job) => (
                  <tr
                    key={job.job_id}
                    className="hover:bg-slate-50 transition-colors duration-75 cursor-pointer"
                    onClick={() => navigate(`/jobs/${job.job_id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-800 truncate max-w-xs">
                        {job.label ?? <span className="text-slate-400 font-normal italic">Unlabeled</span>}
                      </p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{job.job_id.slice(0, 8)}…</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={job.status} />
                      {job.progress_message && job.status === 'running' && (
                        <p className="text-xs text-slate-400 mt-1 max-w-[200px] truncate">{job.progress_message}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                      {formatDateTime(job.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap tabular-nums">
                      {elapsed(job.started_at, job.completed_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline"
                        onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.job_id}`) }}
                        aria-label={`View job ${job.job_id}`}
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
