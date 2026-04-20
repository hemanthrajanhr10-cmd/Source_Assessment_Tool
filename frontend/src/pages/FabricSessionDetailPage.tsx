import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Zap, Database, FileText, BarChart2, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, XCircle, AlertCircle, ExternalLink,
  Table2, Hash, Calculator, Link2, Eye, Bookmark, Layers,
  ArrowRight, Code2, AlertTriangle, Info,
} from 'lucide-react'
import { api } from '../api/client'
import type {
  FabricDataset, FabricReport, FabricWorkspace,
  FabricMeasure, MeasureComplexity, ReportVisual, ReportPage, VisualField,
} from '../types/api'
import StatCard from '../components/ui/StatCard'

// ── Complexity level colours ───────────────────────────────────────────────────

const COMPLEXITY_STYLE: Record<string, string> = {
  'None':         'bg-slate-50 text-slate-400 border-slate-200',
  'Simple':       'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Moderate':     'bg-amber-50 text-amber-700 border-amber-200',
  'Complex':      'bg-orange-50 text-orange-700 border-orange-200',
  'Very Complex': 'bg-red-50 text-red-700 border-red-200',
}

function ComplexityBadge({ c }: { c: MeasureComplexity }) {
  const cls = COMPLEXITY_STYLE[c.level] ?? COMPLEXITY_STYLE['None']
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <BarChart2 className="h-3 w-3" />
      {c.level}
      <span className="opacity-60">({c.score})</span>
    </span>
  )
}

function StorageBadge({ mode }: { mode: string }) {
  const cls =
    mode === 'DirectLake'   ? 'bg-purple-50 text-purple-700 border-purple-200' :
    mode === 'DirectQuery'  ? 'bg-blue-50   text-blue-700   border-blue-200'   :
    mode === 'Composite'    ? 'bg-orange-50 text-orange-700 border-orange-200' :
                              'bg-slate-50  text-slate-700  border-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {mode}
    </span>
  )
}

function FieldTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    measure:     'bg-violet-50 text-violet-700 border-violet-200',
    column:      'bg-sky-50 text-sky-700 border-sky-200',
    aggregation: 'bg-teal-50 text-teal-700 border-teal-200',
    hierarchy:   'bg-indigo-50 text-indigo-700 border-indigo-200',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${map[type] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
      {type}
    </span>
  )
}

// ── Measure detail panel ──────────────────────────────────────────────────────

function MeasureDetail({ m }: { m: FabricMeasure }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <Hash className="h-3.5 w-3.5 text-violet-500 shrink-0" />
        <span className="flex-1 text-xs font-mono font-semibold text-slate-800 truncate">
          {m.name}
        </span>
        {m.table && (
          <span className="text-xs text-slate-400 shrink-0 mr-2">{m.table}</span>
        )}
        {m.complexity && <ComplexityBadge c={m.complexity} />}
        {open ? <ChevronUp className="h-3 w-3 text-slate-400 ml-1 shrink-0" />
               : <ChevronDown className="h-3 w-3 text-slate-400 ml-1 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2.5">
          {/* Expression */}
          {m.expression && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                <Code2 className="h-3 w-3" /> DAX Expression
              </p>
              <pre className="text-xs font-mono bg-white border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap text-slate-700 max-h-32">
                {m.expression}
              </pre>
            </div>
          )}

          {/* Complexity breakdown */}
          {m.complexity && m.complexity.score > 0 && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              <span>Functions: <strong>{m.complexity.function_count}</strong></span>
              <span>Nesting depth: <strong>{m.complexity.nesting_depth}</strong></span>
              <span>Column refs: <strong>{m.complexity.dependency_count}</strong></span>
              {m.complexity.complex_functions.length > 0 && (
                <span className="text-orange-700">
                  Complex fns: {m.complexity.complex_functions.join(', ')}
                </span>
              )}
            </div>
          )}

          {/* Column dependencies */}
          {m.dependencies && m.dependencies.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Column Dependencies ({m.dependencies.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {m.dependencies.map((d, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-0.5 text-xs font-mono">
                    <span className="text-slate-500">{d.table}</span>
                    <ArrowRight className="h-2.5 w-2.5 text-slate-300" />
                    <span className="text-slate-800 font-semibold">{d.column}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Visual field row ──────────────────────────────────────────────────────────

function VisualFieldRow({ f }: { f: VisualField }) {
  const [open, setOpen] = useState(false)
  const hasDeps = f.field_type === 'measure' && f.dependencies && f.dependencies.length > 0
  const hasExpr = f.field_type === 'measure' && f.expression

  return (
    <div className="border border-slate-100 rounded overflow-hidden">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 bg-white text-left ${hasDeps ? 'cursor-pointer hover:bg-slate-50' : ''}`}
        onClick={() => hasDeps && setOpen(o => !o)}
      >
        <FieldTypeBadge type={f.field_type} />
        <span className="flex-1 text-xs font-mono text-slate-800 truncate">{f.name}</span>
        <span className="text-xs text-slate-400 shrink-0">{f.table}</span>
        {f.field_type === 'aggregation' && f.agg_function && (
          <span className="text-xs text-teal-600 shrink-0">{f.agg_function}</span>
        )}
        {f.complexity && f.complexity.level !== 'None' && (
          <ComplexityBadge c={f.complexity} />
        )}
        {hasDeps && (
          open ? <ChevronUp className="h-3 w-3 text-slate-300 shrink-0" />
               : <ChevronDown className="h-3 w-3 text-slate-300 shrink-0" />
        )}
      </div>
      {open && hasDeps && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 space-y-1.5">
          {hasExpr && (
            <pre className="text-xs font-mono bg-white border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap text-slate-600 max-h-24">
              {f.expression}
            </pre>
          )}
          <div className="flex flex-wrap gap-1.5">
            {f.dependencies!.map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-0.5 text-xs font-mono">
                <span className="text-slate-500">{d.table}</span>
                <ArrowRight className="h-2.5 w-2.5 text-slate-300" />
                <span className="text-slate-800 font-semibold">{d.column}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Visual card ────────────────────────────────────────────────────────────────

function VisualCard({ v }: { v: ReportVisual }) {
  const [open, setOpen] = useState(false)
  if (v.field_count === 0 && !v.title) return null

  const measureCount = v.fields.filter(f => f.field_type === 'measure').length
  const colCount     = v.fields.filter(f => f.field_type === 'column' || f.field_type === 'aggregation').length

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <Eye className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-700 truncate">
            {v.title || v.type}
          </p>
          <p className="text-xs text-slate-400">
            {v.type}
            {v.field_count > 0 && ` · ${v.field_count} field${v.field_count !== 1 ? 's' : ''}`}
            {measureCount > 0 && ` · ${measureCount} measure${measureCount !== 1 ? 's' : ''}`}
            {colCount > 0     && ` · ${colCount} col${colCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        {open ? <ChevronUp className="h-3 w-3 text-slate-300 shrink-0" />
               : <ChevronDown className="h-3 w-3 text-slate-300 shrink-0" />}
      </button>
      {open && v.fields.length > 0 && (
        <div className="border-t border-slate-100 p-2 space-y-1">
          {v.fields.map((f, i) => <VisualFieldRow key={i} f={f} />)}
        </div>
      )}
      {open && v.fields.length === 0 && (
        <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400 italic">
          No field bindings detected for this visual.
        </div>
      )}
    </div>
  )
}

// ── Page accordion ────────────────────────────────────────────────────────────

function PageAccordion({ page }: { page: ReportPage }) {
  const [open, setOpen] = useState(false)
  const totalFields = page.visuals.reduce((s, v) => s + v.field_count, 0)
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="flex-1 text-sm font-semibold text-slate-700">{page.name}</span>
        <span className="text-xs text-slate-400 shrink-0 mr-2">
          {page.visual_count} visual{page.visual_count !== 1 ? 's' : ''}
          {totalFields > 0 && ` · ${totalFields} fields`}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
               : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 p-3 space-y-2">
          {page.visuals.length > 0
            ? page.visuals.map((v, i) => <VisualCard key={i} v={v} />)
            : <p className="text-xs text-slate-400 italic px-1">No visual field data available for this page.</p>
          }
        </div>
      )}
    </div>
  )
}

// ── Report row ─────────────────────────────────────────────────────────────────

function ReportRow({ rpt }: { rpt: FabricReport }) {
  const [open, setOpen] = useState(false)
  const hasPages = rpt.pages && rpt.pages.length > 0

  return (
    <div className="border-b last:border-0 border-slate-100">
      <div
        className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${hasPages ? 'cursor-pointer' : ''}`}
        onClick={() => hasPages && setOpen(o => !o)}
      >
        <FileText className={`h-4 w-4 shrink-0 ${rpt.is_paginated ? 'text-orange-500' : 'text-blue-500'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{rpt.name}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400 flex-wrap">
            {rpt.is_paginated ? (
              <span className="text-orange-600 font-medium">Paginated (RDL)</span>
            ) : (
              <>
                <span>{rpt.page_count ?? '?'} page{rpt.page_count !== 1 ? 's' : ''}</span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />{rpt.visual_count} visuals
                </span>
                {rpt.bookmark_count > 0 && (
                  <span className="flex items-center gap-1">
                    <Bookmark className="h-3 w-3" />{rpt.bookmark_count} bookmarks
                  </span>
                )}
                {rpt.layout_parsed
                  ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Field analysis available</span>
                  : <span className="text-slate-300 flex items-center gap-1"><Info className="h-3 w-3" /> Counts only</span>
                }
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rpt.web_url && (
            <a href={rpt.web_url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-slate-400 hover:text-brand-600">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {hasPages && (
            open ? <ChevronUp className="h-4 w-4 text-slate-300" />
                 : <ChevronDown className="h-4 w-4 text-slate-300" />
          )}
        </div>
      </div>

      {open && hasPages && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-50 pt-3">
          {rpt.pages.map((page, i) => <PageAccordion key={i} page={page} />)}
        </div>
      )}
    </div>
  )
}

// ── Dataset accordion ─────────────────────────────────────────────────────────

function DatasetRow({ ds }: { ds: FabricDataset }) {
  const [open, setOpen] = useState(false)
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
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
            complexityPct >= 60 ? 'bg-red-50 text-red-700 border-red-200'
            : complexityPct >= 25 ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
            <BarChart2 className="h-3 w-3" />
            {complexityPct >= 60 ? 'High' : complexityPct >= 25 ? 'Medium' : 'Low'} ({complexityPct})
          </span>
          {!ds.info_supported && (
            <span className="text-xs text-slate-400 italic">No DAX access</span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" />
                : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-slate-100">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: <Table2 className="h-3.5 w-3.5" />,      label: 'Tables',       value: ds.table_count },
              { icon: <Hash className="h-3.5 w-3.5" />,         label: 'Measures',     value: ds.measure_count },
              { icon: <Calculator className="h-3.5 w-3.5" />,   label: 'Calc. Cols',   value: ds.calculated_column_count },
              { icon: <Database className="h-3.5 w-3.5" />,     label: 'Calc. Tables', value: ds.calculated_table_count },
              { icon: <Link2 className="h-3.5 w-3.5" />,        label: 'Relationships',value: ds.relationship_count },
              { icon: <BarChart2 className="h-3.5 w-3.5" />,    label: 'Complexity',   value: `${complexityPct}%` },
            ].map(({ icon, label, value }) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                  {icon}<span className="text-xs">{label}</span>
                </div>
                <p className="text-base font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Complexity bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Model Complexity Score</span>
              <span className="text-xs font-medium text-slate-700">{complexityPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-2 rounded-full transition-all ${
                complexityPct >= 60 ? 'bg-red-500' : complexityPct >= 25 ? 'bg-amber-400' : 'bg-emerald-400'
              }`} style={{ width: `${complexityPct}%` }} />
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
                      {['Name', 'Storage Mode', 'Hidden', 'Calculated'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ds.tables.map(t => (
                      <tr key={t.name} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono">{t.name}</td>
                        <td className="px-3 py-2"><StorageBadge mode={t.storage_mode} /></td>
                        <td className="px-3 py-2 text-slate-500">{t.is_hidden ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2">{t.is_calculated
                          ? <span className="text-amber-600 font-medium">Yes</span>
                          : <span className="text-slate-400">No</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Measures with complexity + dependencies */}
          {ds.measures.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Measures ({ds.measures.length}) — click to expand DAX + dependencies
              </p>
              <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                {ds.measures.map(m => <MeasureDetail key={m.name} m={m} />)}
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
                {ds.calculated_columns.map(c => (
                  <div key={c.name} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-slate-700">{c.name}</span>
                      {c.table && <span className="text-xs text-slate-400">in {c.table}</span>}
                    </div>
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
                {ds.calculated_tables.map(t => (
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

// ── Workspace accordion ───────────────────────────────────────────────────────

function WorkspaceCard({ ws }: { ws: FabricWorkspace }) {
  const [open, setOpen] = useState(true)
  const totalVisuals   = ws.reports.reduce((s, r) => s + (r.visual_count ?? 0), 0)
  const totalMeasures  = ws.datasets.reduce((s, d) => s + (d.measure_count ?? 0), 0)
  const paginatedCount = ws.reports.filter(r => r.is_paginated).length
  const interactiveRpts= ws.reports.filter(r => !r.is_paginated)

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
            {paginatedCount > 0 ? `· ${paginatedCount} paginated ` : ''}
            {totalVisuals  > 0 ? `· ${totalVisuals} visuals `  : ''}
            {totalMeasures > 0 ? `· ${totalMeasures} measures` : ''}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
               : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="p-5 space-y-6">
          {/* Semantic Models */}
          {ws.datasets.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Semantic Models ({ws.datasets.length})
              </p>
              <div className="space-y-2">
                {ws.datasets.map(ds => <DatasetRow key={ds.id} ds={ds} />)}
              </div>
            </div>
          )}

          {/* Interactive Reports */}
          {interactiveRpts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Reports ({interactiveRpts.length})
              </p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {interactiveRpts.map(r => <ReportRow key={r.id} rpt={r} />)}
              </div>
            </div>
          )}

          {/* Paginated Reports */}
          {paginatedCount > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Paginated Reports ({paginatedCount})
                <span className="ml-2 text-slate-400 normal-case font-normal">— RDL format, visual field analysis not available</span>
              </p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {ws.reports.filter(r => r.is_paginated).map(r => <ReportRow key={r.id} rpt={r} />)}
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
    queryFn: () => api.getFabricSession(sessionId!).then(r => r.data),
    refetchInterval: q => q.state.data?.status === 'running' ? 4000 : false,
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

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
          {[
            { label: 'Workspaces',     value: summary.workspace_count },
            { label: 'Semantic Models',value: summary.dataset_count },
            { label: 'Reports',        value: summary.report_count },
            { label: 'Paginated',      value: summary.paginated_report_count },
            { label: 'Total Visuals',  value: summary.total_visuals ?? 0 },
            { label: 'Measures',       value: summary.total_measures },
            { label: 'Calc. Tables',   value: summary.total_calculated_tables },
            { label: 'Calc. Columns',  value: summary.total_calculated_columns },
            { label: 'Relationships',  value: summary.total_relationships ?? 0 },
          ].map(({ label, value }) => (
            <StatCard key={label} label={label} value={value} />
          ))}
        </div>
      )}

      {/* Workspaces */}
      {results?.workspaces && results.workspaces.length > 0 && (
        <div className="space-y-4">
          {results.workspaces.map(ws => <WorkspaceCard key={ws.id} ws={ws} />)}
        </div>
      )}

      {session.status === 'running' && (
        <div className="card p-8 text-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-brand-400" />
          <p className="font-medium">{session.progress_message || 'Collecting Fabric workspace data…'}</p>
          <p className="text-sm mt-1">This page refreshes automatically every 4 seconds.</p>
        </div>
      )}
    </div>
  )
}
