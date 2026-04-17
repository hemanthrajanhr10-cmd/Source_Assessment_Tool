import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Zap, Database, FileText, BarChart2, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, XCircle, AlertCircle, ExternalLink,
  Table2, Hash, Calculator, Link2, Eye, Bookmark,
} from 'lucide-react'
import { api } from '../api/client'
import type { FabricDataset, FabricReport, FabricWorkspace } from '../types/api'
import StatCard from '../components/ui/StatCard'

// ── Complexity badge ──────────────────────────────────────────────────────────

function ComplexityBadge({ score }: { score: number }) {
  const level = score >= 60 ? 'High' : score >= 25 ? 'Medium' : 'Low'
  const cls   = score >= 60
    ? 'bg-red-50 text-red-700 border-red-200'
    : score >= 25
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <BarChart2 className="h-3 w-3" /> {level} ({score})
    </span>
  )
}

// ── Storage mode badge ────────────────────────────────────────────────────────

function StorageBadge({ mode }: { mode: string }) {
  const cls = mode === 'DirectLake'
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : mode === 'DirectQuery'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : mode === 'Composite'
        ? 'bg-orange-50 text-orange-700 border-orange-200'
        : 'bg-slate-50 text-slate-700 border-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {mode}
    </span>
  )
}

// ── Dataset accordion ─────────────────────────────────────────────────────────

function DatasetRow({ ds }: { ds: FabricDataset }) {
  const [open, setOpen] = useState(false)

  // Complexity rate as % of max possible score
  const complexityPct = Math.min(100, ds.complexity_score)

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <Database className="h-4 w-4 text-brand-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{ds.name}</p>
          <p className="text-xs text-slate-400">by {ds.configured_by || 'unknown'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StorageBadge mode={ds.storage_mode} />
          <ComplexityBadge score={ds.complexity_score} />
          {!ds.info_supported && (
            <span className="text-xs text-slate-400 italic">No DAX access</span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-slate-100">
          {/* Stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: <Table2 className="h-3.5 w-3.5" />,      label: 'Tables',           value: ds.table_count },
              { icon: <Hash className="h-3.5 w-3.5" />,         label: 'Measures',         value: ds.measure_count },
              { icon: <Calculator className="h-3.5 w-3.5" />,   label: 'Calc. Columns',    value: ds.calculated_column_count },
              { icon: <Database className="h-3.5 w-3.5" />,     label: 'Calc. Tables',     value: ds.calculated_table_count },
              { icon: <Link2 className="h-3.5 w-3.5" />,        label: 'Relationships',    value: ds.relationship_count },
              { icon: <BarChart2 className="h-3.5 w-3.5" />,    label: 'Complexity %',     value: `${complexityPct}%` },
            ].map(({ icon, label, value }) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                  {icon}<span className="text-xs">{label}</span>
                </div>
                <p className="text-lg font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Complexity bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Model Complexity</span>
              <span className="text-xs font-medium text-slate-700">{complexityPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  complexityPct >= 60 ? 'bg-red-500' : complexityPct >= 25 ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
                style={{ width: `${complexityPct}%` }}
              />
            </div>
          </div>

          {/* Tables */}
          {ds.tables.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Tables ({ds.tables.length})
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Name</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Storage Mode</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Hidden</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Calculated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ds.tables.map((t) => (
                      <tr key={t.name} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono">{t.name}</td>
                        <td className="px-3 py-2"><StorageBadge mode={t.storage_mode} /></td>
                        <td className="px-3 py-2 text-slate-500">{t.is_hidden ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {(t as { is_calculated?: boolean }).is_calculated ? (
                            <span className="text-amber-600 font-medium">Yes</span>
                          ) : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Measures */}
          {ds.measures.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Measures ({ds.measures.length})
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Name</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Folder</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Expression</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ds.measures.map((m) => (
                      <tr key={m.name} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{m.name}</td>
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                          {m.display_folder || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-500 truncate max-w-xs" title={m.expression}>
                          {m.expression}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Calculated Columns */}
          {ds.calculated_columns.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Calculated Columns ({ds.calculated_columns.length})
              </p>
              <div className="space-y-1">
                {ds.calculated_columns.map((c) => (
                  <div key={c.name} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                    <p className="text-xs font-mono font-semibold text-slate-700">{c.name}</p>
                    {c.expression && (
                      <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">{c.expression}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calculated Tables */}
          {ds.calculated_tables.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Calculated Tables ({ds.calculated_tables.length})
              </p>
              <div className="space-y-1">
                {ds.calculated_tables.map((t) => (
                  <div key={t.name} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                    <p className="text-xs font-mono font-semibold text-slate-700">{t.name}</p>
                    {t.expression && (
                      <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">{t.expression}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {ds.web_url && (
            <a href={ds.web_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Open in Power BI
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Reports list ──────────────────────────────────────────────────────────────

function ReportRow({ rpt }: { rpt: FabricReport }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-slate-100 hover:bg-slate-50">
      <FileText className={`h-4 w-4 shrink-0 ${rpt.is_paginated ? 'text-orange-500' : 'text-blue-500'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{rpt.name}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
          <span>{rpt.is_paginated ? 'Paginated' : `${rpt.page_count ?? '?'} page${rpt.page_count !== 1 ? 's' : ''}`}</span>
          {!rpt.is_paginated && (
            <>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {rpt.visual_count} visual{rpt.visual_count !== 1 ? 's' : ''}
              </span>
              {rpt.bookmark_count > 0 && (
                <span className="flex items-center gap-1">
                  <Bookmark className="h-3 w-3" />
                  {rpt.bookmark_count} bookmark{rpt.bookmark_count !== 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {rpt.web_url && (
        <a href={rpt.web_url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 text-slate-400 hover:text-brand-600">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}

// ── Workspace accordion ───────────────────────────────────────────────────────

function WorkspaceCard({ ws }: { ws: FabricWorkspace }) {
  const [open, setOpen] = useState(true)
  const totalVisuals = ws.reports.reduce((sum, r) => sum + (r.visual_count ?? 0), 0)
  return (
    <div className="card overflow-hidden border-2 border-slate-100">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-100 hover:bg-slate-100 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <Zap className="h-4 w-4 text-brand-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">{ws.name}</p>
          <p className="text-xs text-slate-400">
            {ws.dataset_count} model{ws.dataset_count !== 1 ? 's' : ''} ·{' '}
            {ws.report_count} report{ws.report_count !== 1 ? 's' : ''}{' '}
            {ws.paginated_report_count > 0 ? `· ${ws.paginated_report_count} paginated` : ''}{' '}
            {totalVisuals > 0 ? `· ${totalVisuals} visuals` : ''}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
               : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="p-5 space-y-5">
          {ws.datasets.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Semantic Models</p>
              <div className="space-y-2">
                {ws.datasets.map((ds) => <DatasetRow key={ds.id} ds={ds} />)}
              </div>
            </div>
          )}
          {ws.reports.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Reports</p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {ws.reports.map((r) => <ReportRow key={r.id} rpt={r} />)}
              </div>
            </div>
          )}
          {ws.datasets.length === 0 && ws.reports.length === 0 && (
            <p className="text-sm text-slate-400 italic">No accessible assets in this workspace.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FabricSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()

  const { data: session, isLoading } = useQuery({
    queryKey: ['fabric-session', sessionId],
    queryFn: () => api.getFabricSession(sessionId!).then((r) => r.data),
    refetchInterval: (q) =>
      q.state.data?.status === 'running' ? 4000 : false,
    enabled: !!sessionId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <AlertCircle className="h-5 w-5" /> Fabric session not found.
      </div>
    )
  }

  const results = session.results
  const summary = results?.summary

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <Zap className="h-6 w-6 text-brand-600" />
          {session.label || 'Fabric Assessment'}
        </h1>
        <div className="flex items-center gap-3 mt-1">
          {session.status === 'running' && (
            <span className="inline-flex items-center gap-1.5 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              {session.progress_message || 'Running…'}
            </span>
          )}
          {session.status === 'completed' && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Completed
              {session.completed_at && ` · ${new Date(session.completed_at).toLocaleString()}`}
            </span>
          )}
          {session.status === 'failed' && (
            <span className="inline-flex items-center gap-1.5 text-sm text-red-700">
              <XCircle className="h-4 w-4" /> Failed — {session.error}
            </span>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
          {[
            { label: 'Workspaces',       value: summary.workspace_count },
            { label: 'Semantic Models',  value: summary.dataset_count },
            { label: 'Reports',          value: summary.report_count },
            { label: 'Paginated',        value: summary.paginated_report_count },
            { label: 'Measures',         value: summary.total_measures },
            { label: 'Calc. Tables',     value: summary.total_calculated_tables },
            { label: 'Calc. Columns',    value: summary.total_calculated_columns },
            { label: 'Relationships',    value: summary.total_relationships ?? 0 },
            { label: 'Visuals',          value: summary.total_visuals ?? 0 },
          ].map(({ label, value }) => (
            <StatCard key={label} label={label} value={value} />
          ))}
        </div>
      )}

      {/* Workspaces */}
      {results?.workspaces && results.workspaces.length > 0 && (
        <div className="space-y-4">
          {results.workspaces.map((ws) => <WorkspaceCard key={ws.id} ws={ws} />)}
        </div>
      )}

      {session.status === 'running' && (
        <div className="card p-8 text-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-brand-400" />
          <p className="font-medium">{session.progress_message || 'Collecting Fabric workspace data…'}</p>
          <p className="text-sm mt-1">This page refreshes automatically.</p>
        </div>
      )}
    </div>
  )
}
