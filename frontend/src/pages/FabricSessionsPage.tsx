import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Zap, PlusCircle, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react'
import { api } from '../api/client'
import type { FabricSessionRecord } from '../types/api'
import Button from '../components/ui/Button'

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </span>
    )
  if (status === 'failed')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        <XCircle className="h-3 w-3" /> Failed
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
      <Loader2 className="h-3 w-3 animate-spin" /> Running
    </span>
  )
}

export default function FabricSessionsPage() {
  const navigate = useNavigate()
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['fabric-sessions'],
    queryFn: () => api.listFabricSessions().then((r) => r.data),
    refetchInterval: 10_000,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Zap className="h-6 w-6 text-brand-600" />
            Fabric Assessments
          </h1>
          <p className="mt-1 text-sm text-slate-500">Power BI / Fabric workspace assessment history</p>
        </div>
        <Button
          leftIcon={<PlusCircle className="h-4 w-4" />}
          onClick={() => navigate('/fabric/new')}
        >
          New Fabric Assessment
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
        </div>
      ) : sessions.length === 0 ? (
        <div className="card p-12 text-center">
          <Zap className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No Fabric assessments yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Click "New Fabric Assessment" to get started.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 font-semibold text-slate-600">Label</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">Created</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s: FabricSessionRecord) => (
                <tr
                  key={s.fabric_session_id}
                  onClick={() => navigate(`/fabric/sessions/${s.fabric_session_id}`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-800">
                      {s.label || <span className="text-slate-400 italic">Untitled</span>}
                    </span>
                    {s.progress_message && s.status === 'running' && (
                      <p className="text-xs text-slate-400 mt-0.5">{s.progress_message}</p>
                    )}
                  </td>
                  <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-5 py-3 text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {s.completed_at ? new Date(s.completed_at).toLocaleString() : '—'}
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
