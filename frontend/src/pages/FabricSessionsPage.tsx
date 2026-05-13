import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, PlusCircle, CheckCircle2, XCircle, Loader2, Clock, StopCircle, BarChart3 } from 'lucide-react'
import { api } from '../api/client'
import type { FabricSessionRecord } from '../types/api'
import { formatDateTime } from '../utils/dateTime'
import Button from '../components/ui/Button'
import Loader3D from '../components/ui/Loader3D'

function FabricStatusBadge({ status }: { status: string }) {
  if (status === 'completed')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-earth-50 text-earth-700 ring-1 ring-earth-200">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </span>
    )
  if (status === 'failed')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 ring-1 ring-red-200">
        <XCircle className="h-3 w-3" /> Failed
      </span>
    )
  if (status === 'cancelled')
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 ring-1 ring-slate-200">
        <StopCircle className="h-3 w-3" /> Cancelled
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-200">
      <Loader2 className="h-3 w-3 animate-spin" /> Running
    </span>
  )
}

export default function FabricSessionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['fabric-sessions'],
    queryFn: () => api.listFabricSessions().then((r) => r.data),
    refetchInterval: 10_000,
  })

  const cancelMutation = useMutation({
    mutationFn: (sessionId: string) => api.cancelFabricSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fabric-sessions'] }),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display flex items-center gap-2.5">
            <BarChart3 className="h-6 w-6 text-earth-600" />
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
        <Loader3D message="Loading sessions" />
      ) : sessions.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 border border-slate-200 mx-auto mb-4">
            <Zap className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-slate-700 font-semibold">No Fabric assessments yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Click "New Fabric Assessment" to get started.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Label</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Created</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Completed</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sessions.map((s: FabricSessionRecord, idx: number) => (
                <tr
                  key={s.fabric_session_id}
                  onClick={() => navigate(`/fabric/sessions/${s.fabric_session_id}`)}
                  className={`cursor-pointer transition-colors hover:bg-earth-50/40 ${
                    idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-slate-800">
                      {s.label || <span className="text-slate-400 italic">Untitled</span>}
                    </span>
                    {s.progress_message && s.status === 'running' && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {(() => { try { const p = JSON.parse(s.progress_message); return p?.msg ?? s.progress_message } catch { return s.progress_message } })()}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5"><FabricStatusBadge status={s.status} /></td>
                  <td className="px-5 py-3.5 text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(s.created_at)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {s.completed_at ? formatDateTime(s.completed_at) : '—'}
                  </td>
                  <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                    {s.status === 'running' && (
                      <button
                        onClick={() => {
                          if (confirm('Stop this assessment?')) cancelMutation.mutate(s.fabric_session_id)
                        }}
                        disabled={cancelMutation.isPending}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        <StopCircle className="h-3 w-3" />
                        Stop
                      </button>
                    )}
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
