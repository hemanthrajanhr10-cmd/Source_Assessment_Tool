import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Database, FileText, BarChart2, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, XCircle, AlertCircle, ExternalLink,
  Table2, Hash, Calculator, Link2, Eye, Bookmark, Layers,
  ArrowRight, Code2, StopCircle, Download, TrendingUp,
  Activity, GitMerge, BookOpen, Filter,
} from 'lucide-react'
import { api } from '../api/client'
import type {
  FabricDataset, FabricReport, FabricWorkspace,
  FabricMeasure, MeasureComplexity, ReportVisual, ReportPage, VisualField,
  FabricCalculatedColumn, FabricCalculatedTable, FabricRelationship, FabricBookmark,
  FabricTable, FabricTableColumn,
} from '../types/api'
import { formatDateTime } from '../utils/dateTime'

// ── Complexity helpers ────────────────────────────────────────────────────────

const COMPLEXITY_COLORS: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  'None':         { bg: 'bg-zinc-800/50',     text: 'text-zinc-400',    border: 'border-zinc-700/50',    hex: '#71717a' },
  'Simple':       { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', border: 'border-emerald-500/30', hex: '#10b981' },
  'Moderate':     { bg: 'bg-amber-500/10',    text: 'text-amber-400',   border: 'border-amber-500/30',   hex: '#f59e0b' },
  'Complex':      { bg: 'bg-orange-500/10',   text: 'text-orange-400',  border: 'border-orange-500/30',  hex: '#f97316' },
  'Very Complex': { bg: 'bg-red-500/10',      text: 'text-red-400',     border: 'border-red-500/30',     hex: '#ef4444' },
}

function ComplexityBadge({ c, small }: { c: MeasureComplexity; small?: boolean }) {
  const clr = COMPLEXITY_COLORS[c.level] ?? COMPLEXITY_COLORS['None']
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border ${clr.bg} ${clr.text} ${clr.border} ${small ? 'text-xs' : 'text-xs'}`}>
      <BarChart2 className="h-3 w-3" />
      {c.level}
      {c.score > 0 && <span className="opacity-60">({c.score})</span>}
    </span>
  )
}

function StorageBadge({ mode }: { mode: string }) {
  const cls =
    mode === 'DirectLake'  ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
    mode === 'DirectQuery' ? 'bg-blue-500/10   text-blue-400   border-blue-500/30'   :
    mode === 'Composite'   ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                             'bg-zinc-800/50   text-zinc-400   border-zinc-700/50'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {mode}
    </span>
  )
}

function FieldTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    measure:     'bg-violet-500/10 text-violet-400 border-violet-500/30',
    column:      'bg-sky-500/10    text-sky-400    border-sky-500/30',
    aggregation: 'bg-teal-500/10   text-teal-400   border-teal-500/30',
    hierarchy:   'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${map[type] ?? 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50'}`}>
      {type}
    </span>
  )
}

// ── SVG Donut Chart ───────────────────────────────────────────────────────────

function DonutChart({ data, size = 130 }: {
  data: { label: string; value: number; color: string }[]
  size?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="text-xs text-zinc-600">No data</span>
    </div>
  )
  const r = size / 2 - 12
  const cx = size / 2, cy = size / 2
  const ir = r * 0.6
  let angle = -90

  const arcs = data.filter(d => d.value > 0).map(d => {
    const pct   = d.value / total
    const sweep = pct * 360
    const start = angle
    const end   = angle + sweep
    angle = end
    const toRad = (a: number) => (a * Math.PI) / 180
    const x1 = cx + r  * Math.cos(toRad(start)), y1 = cy + r  * Math.sin(toRad(start))
    const x2 = cx + r  * Math.cos(toRad(end)),   y2 = cy + r  * Math.sin(toRad(end))
    const ix1 = cx + ir * Math.cos(toRad(start)), iy1 = cy + ir * Math.sin(toRad(start))
    const ix2 = cx + ir * Math.cos(toRad(end)),   iy2 = cy + ir * Math.sin(toRad(end))
    const large = sweep > 180 ? 1 : 0
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`
    return { ...d, path }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((a, i) => (
        <path key={i} d={a.path} fill={a.color} stroke="#09090b" strokeWidth="1.5" />
      ))}
      <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle"
        fontSize="13" fontWeight="700" fill="#f4f4f5">{total}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fill="#71717a">total</text>
    </svg>
  )
}

// ── Horizontal bar chart ──────────────────────────────────────────────────────

function HBarChart({ data, maxW = 180 }: {
  data: { label: string; value: number; color: string }[]
  maxW?: number
}) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-24 shrink-0 truncate">{d.label}</span>
          <div className="flex-1 h-4 bg-zinc-800 rounded-full overflow-hidden" style={{ maxWidth: maxW }}>
            <div
              className="h-4 rounded-full transition-all"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color }}
            />
          </div>
          <span className="text-xs font-semibold text-zinc-300 w-8 text-right">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Complexity summary for a dataset ─────────────────────────────────────────

function getComplexityDistribution(ds: FabricDataset) {
  const dist: Record<string, number> = { 'None': 0, 'Simple': 0, 'Moderate': 0, 'Complex': 0, 'Very Complex': 0 }
  ;[...ds.measures.map(m => m.complexity?.level),
    ...(ds.calculated_columns || []).map(c => c.complexity?.level),
    ...(ds.calculated_tables  || []).map(t => t.complexity?.level),
  ].forEach(l => { if (l && l in dist) dist[l]++ })
  return dist
}

// ── Tab navigation ────────────────────────────────────────────────────────────

type Tab = 'overview' | 'models' | 'reports' | 'complexity'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',           icon: <Activity className="h-4 w-4" /> },
  { id: 'models',      label: 'Semantic Models',    icon: <Database className="h-4 w-4" /> },
  { id: 'reports',     label: 'Reports & Visuals',  icon: <FileText className="h-4 w-4" /> },
  { id: 'complexity',  label: 'Complexity Analysis', icon: <TrendingUp className="h-4 w-4" /> },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function MeasureRow({ m }: { m: FabricMeasure }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-zinc-800/50 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900/40 hover:bg-zinc-800/50 transition-colors text-left">
        <Hash className="h-3.5 w-3.5 text-violet-400 shrink-0" />
        <span className="flex-1 text-xs font-mono font-semibold text-zinc-200 truncate">{m.name}</span>
        {m.table && <span className="text-xs text-zinc-500 shrink-0 mr-1">{m.table}</span>}
        {m.complexity && <ComplexityBadge c={m.complexity} small />}
        {open ? <ChevronUp className="h-3 w-3 text-zinc-500 ml-1 shrink-0" />
               : <ChevronDown className="h-3 w-3 text-zinc-500 ml-1 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-zinc-800/40 bg-zinc-950/40 p-3 space-y-2.5">
          {m.expression && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                <Code2 className="h-3 w-3" /> DAX Expression
              </p>
              <pre className="text-xs font-mono bg-zinc-950 border border-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap text-zinc-300 max-h-32">
                {m.expression}
              </pre>
            </div>
          )}
          {m.complexity && m.complexity.score > 0 && (
            <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
              <span>Functions: <strong className="text-zinc-300">{m.complexity.function_count}</strong></span>
              <span>Nesting: <strong className="text-zinc-300">{m.complexity.nesting_depth}</strong></span>
              <span>Col refs: <strong className="text-zinc-300">{m.complexity.dependency_count}</strong></span>
              {m.complexity.complex_functions.length > 0 && (
                <span className="text-orange-400">Complex fns: {m.complexity.complex_functions.join(', ')}</span>
              )}
            </div>
          )}
          {m.dependencies && m.dependencies.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Column Dependencies ({m.dependencies.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {m.dependencies.map((d, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-xs font-mono">
                    <span className="text-zinc-500">{d.table}</span>
                    <ArrowRight className="h-2.5 w-2.5 text-zinc-700" />
                    <span className="text-zinc-200 font-semibold">{d.column}</span>
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

function CalcItemRow({ item, type }: { item: FabricCalculatedColumn | FabricCalculatedTable; type: 'col' | 'table' }) {
  const [open, setOpen] = useState(false)
  const cx = item.complexity
  const hasExpr = !!item.expression
  return (
    <div className="border border-zinc-800/50 rounded-lg overflow-hidden">
      <button onClick={() => hasExpr && setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 bg-zinc-900/40 text-left ${hasExpr ? 'hover:bg-zinc-800/50 cursor-pointer' : ''} transition-colors`}>
        {type === 'col'
          ? <Calculator className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          : <Table2 className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
        <span className="flex-1 text-xs font-mono font-semibold text-zinc-200 truncate">{item.name}</span>
        {'table' in item && item.table && (
          <span className="text-xs text-zinc-500 shrink-0 mr-1">{(item as FabricCalculatedColumn).table}</span>
        )}
        {'data_type' in item && (item as FabricCalculatedColumn).data_type && (
          <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5 mr-1">
            {(item as FabricCalculatedColumn).data_type}
          </span>
        )}
        {cx && cx.level !== 'None' && <ComplexityBadge c={cx} small />}
        {hasExpr && (
          open ? <ChevronUp className="h-3 w-3 text-zinc-500 ml-1 shrink-0" />
               : <ChevronDown className="h-3 w-3 text-zinc-500 ml-1 shrink-0" />
        )}
      </button>
      {open && hasExpr && (
        <div className="border-t border-zinc-800/40 bg-zinc-950/40 p-3">
          <p className="text-xs font-semibold text-zinc-500 mb-1 flex items-center gap-1">
            <Code2 className="h-3 w-3" /> DAX Expression
          </p>
          <pre className="text-xs font-mono bg-zinc-950 border border-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap text-zinc-300 max-h-28">
            {item.expression}
          </pre>
          {cx && cx.score > 0 && (
            <div className="flex flex-wrap gap-3 text-xs text-zinc-400 mt-2">
              <span>Functions: <strong className="text-zinc-300">{cx.function_count}</strong></span>
              <span>Nesting: <strong className="text-zinc-300">{cx.nesting_depth}</strong></span>
              {cx.complex_functions.length > 0 && (
                <span className="text-orange-400">Complex fns: {cx.complex_functions.join(', ')}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RelationshipsTable({ rels }: { rels: FabricRelationship[] }) {
  if (!rels || rels.length === 0) return (
    <p className="text-xs text-zinc-600 italic">No relationship data available.</p>
  )
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800/50">
      <table className="w-full text-xs">
        <thead className="bg-zinc-900/80">
          <tr>
            {['From Table', 'From Column', '', 'To Table', 'To Column', 'Cardinality', 'Cross Filter', 'Active'].map(h => (
              <th key={h} className="text-left px-3 py-2 font-semibold text-zinc-500 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/40">
          {rels.map((r, i) => (
            <tr key={i} className="hover:bg-zinc-800/30">
              <td className="px-3 py-1.5 font-mono font-semibold text-zinc-200">{r.from_table}</td>
              <td className="px-3 py-1.5 font-mono text-zinc-400">{r.from_column}</td>
              <td className="px-3 py-1.5 text-zinc-700"><ArrowRight className="h-3 w-3" /></td>
              <td className="px-3 py-1.5 font-mono font-semibold text-zinc-200">{r.to_table}</td>
              <td className="px-3 py-1.5 font-mono text-zinc-400">{r.to_column}</td>
              <td className="px-3 py-1.5">
                <span className="bg-zinc-800 text-zinc-400 rounded px-1.5 py-0.5">{r.cardinality}</span>
              </td>
              <td className="px-3 py-1.5 text-zinc-500">{r.cross_filter}</td>
              <td className="px-3 py-1.5">
                {r.is_active
                  ? <span className="text-emerald-400 font-medium">✓ Active</span>
                  : <span className="text-zinc-600">Inactive</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VisualFieldRow({ f }: { f: VisualField }) {
  const [open, setOpen] = useState(false)
  const hasDeps = f.field_type === 'measure' && f.dependencies && f.dependencies.length > 0
  return (
    <div className="border border-zinc-800/30 rounded overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-1.5 bg-zinc-900/30 text-left ${hasDeps ? 'cursor-pointer hover:bg-zinc-800/40' : ''}`}
        onClick={() => hasDeps && setOpen(o => !o)}>
        <FieldTypeBadge type={f.field_type} />
        <span className="flex-1 text-xs font-mono text-zinc-300 truncate">{f.name}</span>
        <span className="text-xs text-zinc-500 shrink-0">{f.table}</span>
        {f.field_type === 'aggregation' && f.agg_function && (
          <span className="text-xs text-teal-400 shrink-0">{f.agg_function}</span>
        )}
        {f.complexity && f.complexity.level !== 'None' && <ComplexityBadge c={f.complexity} small />}
        {hasDeps && (open
          ? <ChevronUp className="h-3 w-3 text-zinc-600 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-zinc-600 shrink-0" />)}
      </div>
      {open && hasDeps && (
        <div className="border-t border-zinc-800/30 bg-zinc-950/40 px-3 py-2 space-y-1.5">
          {f.expression && (
            <pre className="text-xs font-mono bg-zinc-950 border border-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap text-zinc-400 max-h-20">
              {f.expression}
            </pre>
          )}
          <div className="flex flex-wrap gap-1.5">
            {f.dependencies!.map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-xs font-mono">
                <span className="text-zinc-500">{d.table}</span>
                <ArrowRight className="h-2.5 w-2.5 text-zinc-700" />
                <span className="text-zinc-200 font-semibold">{d.column}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function VisualCard({ v }: { v: ReportVisual }) {
  const [open, setOpen] = useState(false)
  if (v.field_count === 0 && !v.title) return null
  const mCount = v.fields.filter(f => f.field_type === 'measure').length
  const cCount = v.fields.filter(f => f.field_type === 'column' || f.field_type === 'aggregation').length
  return (
    <div className="border border-zinc-800/50 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors text-left">
        <Eye className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-200 truncate">{v.title || v.type}</p>
          <p className="text-xs text-zinc-500">
            {v.type}{v.field_count > 0 && ` · ${v.field_count} fields`}
            {mCount > 0 && ` · ${mCount} measures`}
            {cCount > 0 && ` · ${cCount} cols`}
          </p>
        </div>
        {open ? <ChevronUp className="h-3 w-3 text-zinc-600 shrink-0" />
               : <ChevronDown className="h-3 w-3 text-zinc-600 shrink-0" />}
      </button>
      {open && v.fields.length > 0 && (
        <div className="border-t border-zinc-800/40 p-2 space-y-1">
          {v.fields.map((f, i) => <VisualFieldRow key={i} f={f} />)}
        </div>
      )}
      {open && v.fields.length === 0 && (
        <div className="border-t border-zinc-800/40 px-3 py-2 text-xs text-zinc-600 italic">
          No field bindings detected for this visual.
        </div>
      )}
    </div>
  )
}

function PageAccordion({ page }: { page: ReportPage }) {
  const [open, setOpen] = useState(false)
  const totalFields = page.visuals.reduce((s, v) => s + v.field_count, 0)
  return (
    <div className="border border-zinc-800/50 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-zinc-900/50 hover:bg-zinc-800/40 transition-colors text-left">
        <Layers className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        <span className="flex-1 text-sm font-semibold text-zinc-300">{page.name}</span>
        <span className="text-xs text-zinc-500 shrink-0 mr-2">
          {page.visual_count} visual{page.visual_count !== 1 ? 's' : ''}
          {totalFields > 0 && ` · ${totalFields} fields`}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
               : <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-zinc-800/40 p-3 space-y-2">
          {page.visuals.length > 0
            ? page.visuals.map((v, i) => <VisualCard key={i} v={v} />)
            : <p className="text-xs text-zinc-600 italic px-1">No visual field data for this page.</p>}
        </div>
      )}
    </div>
  )
}

// ── Tables panel with expandable column drill-down ────────────────────────────

const DATA_TYPE_COLORS: Record<string, string> = {
  string:   'bg-sky-500/10    text-sky-400    border-sky-500/30',
  int64:    'bg-violet-500/10 text-violet-400 border-violet-500/30',
  double:   'bg-violet-500/10 text-violet-400 border-violet-500/30',
  decimal:  'bg-violet-500/10 text-violet-400 border-violet-500/30',
  boolean:  'bg-amber-500/10  text-amber-400  border-amber-500/30',
  datetime: 'bg-teal-500/10   text-teal-400   border-teal-500/30',
  binary:   'bg-zinc-800/50   text-zinc-500   border-zinc-700/50',
}

function DataTypeBadge({ type }: { type: string }) {
  const normalised = (type || 'unknown').toLowerCase().replace(/\s+/g, '')
  const cls = DATA_TYPE_COLORS[normalised] ?? 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono border ${cls}`}>
      {type || 'unknown'}
    </span>
  )
}

function ColumnRow({ col }: { col: FabricTableColumn }) {
  const [open, setOpen] = useState(false)
  const hasExpr = !!col.expression
  return (
    <div className={`border-b last:border-0 border-zinc-800/40 ${col.is_hidden ? 'opacity-50' : ''}`}>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 text-xs ${hasExpr ? 'cursor-pointer hover:bg-zinc-800/30' : ''}`}
        onClick={() => hasExpr && setOpen(o => !o)}
      >
        <span className="w-4 flex-shrink-0 text-zinc-600">
          {hasExpr ? (open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
        </span>
        <span className="flex-1 font-mono text-zinc-300 truncate">{col.name}</span>
        <DataTypeBadge type={col.data_type} />
        {col.is_calculated && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/30">Calc</span>
        )}
        {col.is_hidden && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium border bg-zinc-800/50 text-zinc-500 border-zinc-700/50">Hidden</span>
        )}
        {col.complexity && col.complexity.level !== 'None' && (
          <ComplexityBadge c={col.complexity} small />
        )}
      </div>
      {open && col.expression && (
        <div className="ml-9 mr-3 mb-2 rounded bg-zinc-950 text-emerald-400 font-mono text-xs p-2 overflow-x-auto border border-zinc-800">
          {col.expression}
        </div>
      )}
    </div>
  )
}

function TableRow({ table }: { table: FabricTable }) {
  const [open, setOpen] = useState(false)
  const cols = table.columns ?? []
  const visibleCols = cols.filter(c => !c.is_hidden)
  const hiddenCols  = cols.filter(c => c.is_hidden)
  const calcCols    = cols.filter(c => c.is_calculated)

  return (
    <div className="border border-zinc-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left bg-zinc-900/50 hover:bg-zinc-800/40 transition-colors"
      >
        <span className="text-zinc-500">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
        <Table2 className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
        <span className="flex-1 font-mono text-sm font-medium text-zinc-200">{table.name}</span>
        <StorageBadge mode={table.storage_mode} />
        {table.is_calculated && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/30">DAX Table</span>
        )}
        {table.is_hidden && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-zinc-800/50 text-zinc-500 border-zinc-700/50">Hidden</span>
        )}
        {cols.length > 0 && (
          <span className="text-xs text-zinc-500">{cols.length} col{cols.length !== 1 ? 's' : ''}</span>
        )}
        {calcCols.length > 0 && (
          <span className="text-xs text-amber-500">{calcCols.length} calc</span>
        )}
      </button>

      {open && (
        <div className="border-t border-zinc-800/40 bg-zinc-950/30">
          {cols.length === 0 ? (
            <p className="px-4 py-3 text-xs text-zinc-600 italic">No column data available (metadata not retrieved via TMDL/Scanner).</p>
          ) : (
            <>
              <div className="divide-y divide-zinc-800/30 bg-zinc-900/30 mx-3 my-3 rounded-md border border-zinc-800/50 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 border-b border-zinc-800/50 text-xs font-semibold text-zinc-500">
                  <span className="w-4 flex-shrink-0" />
                  <span className="flex-1">Column Name</span>
                  <span className="w-28 text-right">Data Type</span>
                  <span className="w-16 text-right">Flags</span>
                  <span className="w-24 text-right">Complexity</span>
                </div>
                {visibleCols.map(c => <ColumnRow key={c.name} col={c} />)}
                {hiddenCols.length > 0 && (
                  <>
                    <div className="px-3 py-1 bg-zinc-900/40 text-xs text-zinc-600 font-medium">
                      Hidden columns ({hiddenCols.length})
                    </div>
                    {hiddenCols.map(c => <ColumnRow key={c.name} col={c} />)}
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 px-4 pb-3 text-xs text-zinc-500">
                <span>{visibleCols.length} visible</span>
                {hiddenCols.length > 0 && <span>{hiddenCols.length} hidden</span>}
                {calcCols.length > 0 && <span className="text-amber-500">{calcCols.length} calculated</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TablesPanel({ tables }: { tables: FabricTable[] }) {
  const [filter, setFilter] = useState('')
  const filtered = tables.filter(t =>
    !filter || t.name.toLowerCase().includes(filter.toLowerCase())
  )
  const visible   = filtered.filter(t => !t.is_hidden)
  const hidden    = filtered.filter(t => t.is_hidden)

  return (
    <div className="space-y-3">
      <div className="relative">
        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter tables…"
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-800 rounded-lg bg-zinc-900/60 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        />
      </div>

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map(t => <TableRow key={t.name} table={t} />)}
        </div>
      )}

      {hidden.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400 list-none flex items-center gap-1 select-none">
            <ChevronDown className="h-3.5 w-3.5 group-open:rotate-180 transition-transform" />
            {hidden.length} hidden table{hidden.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {hidden.map(t => <TableRow key={t.name} table={t} />)}
          </div>
        </details>
      )}

      {filtered.length === 0 && (
        <p className="text-xs text-zinc-600 italic text-center py-4">No tables match "{filter}"</p>
      )}
    </div>
  )
}

// ── Dataset section (for Models tab) ─────────────────────────────────────────

type ModelSubTab = 'tables' | 'measures' | 'calc_cols' | 'calc_tables' | 'relationships'

function DatasetSection({ ds }: { ds: FabricDataset }) {
  const [open, setOpen] = useState(false)
  const [subTab, setSubTab] = useState<ModelSubTab>('tables')
  const complexityPct = Math.min(100, ds.complexity_score)
  const dist = getComplexityDistribution(ds)

  const SUB_TABS: { id: ModelSubTab; label: string; count: number }[] = [
    { id: 'tables',        label: 'Tables',        count: ds.table_count },
    { id: 'measures',      label: 'Measures',      count: ds.measure_count },
    { id: 'calc_cols',     label: 'Calc. Columns', count: ds.calculated_column_count },
    { id: 'calc_tables',   label: 'Calc. Tables',  count: ds.calculated_table_count },
    { id: 'relationships', label: 'Relationships', count: ds.relationship_count },
  ]

  return (
    <div className="border border-zinc-800/50 rounded-xl overflow-hidden">
      <button className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-900/60 hover:bg-zinc-800/50 transition-all text-left"
        onClick={() => setOpen(!open)}>
        <Database className="h-4 w-4 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100 truncate">{ds.name}</p>
          <p className="text-xs text-zinc-500">by {ds.configured_by || 'unknown'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StorageBadge mode={ds.storage_mode} />
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
            complexityPct >= 60 ? 'bg-red-500/10 text-red-400 border-red-500/30'
            : complexityPct >= 25 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          }`}>
            <BarChart2 className="h-3 w-3" />
            {complexityPct >= 60 ? 'High' : complexityPct >= 25 ? 'Medium' : 'Low'} ({complexityPct})
          </span>
          {!ds.info_supported && <span className="text-xs text-zinc-600 italic">No DAX access</span>}
          {open ? <ChevronUp className="h-4 w-4 text-zinc-500" />
                : <ChevronDown className="h-4 w-4 text-zinc-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800/40">
          {/* KPI row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-0 border-b border-zinc-800/40">
            {[
              { icon: <Table2 className="h-3.5 w-3.5 text-zinc-500" />,     label: 'Tables',      value: ds.table_count },
              { icon: <Hash className="h-3.5 w-3.5 text-violet-400" />,     label: 'Measures',    value: ds.measure_count },
              { icon: <Calculator className="h-3.5 w-3.5 text-amber-400" />, label: 'Calc Cols',  value: ds.calculated_column_count },
              { icon: <Database className="h-3.5 w-3.5 text-orange-400" />, label: 'Calc Tables', value: ds.calculated_table_count },
              { icon: <Link2 className="h-3.5 w-3.5 text-blue-400" />,      label: 'Rels',        value: ds.relationship_count },
              { icon: <BarChart2 className="h-3.5 w-3.5 text-red-400" />,   label: 'Complexity',  value: `${complexityPct}%` },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex flex-col items-center justify-center py-3 border-r last:border-r-0 border-zinc-800/40">
                <div className="flex items-center gap-1 text-zinc-500 mb-0.5">{icon}</div>
                <p className="text-base font-bold text-zinc-100">{value}</p>
                <p className="text-xs text-zinc-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Complexity bar */}
          <div className="px-4 py-2 border-b border-zinc-800/40 bg-zinc-950/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-500">Model Complexity Score</span>
              <div className="flex items-center gap-3">
                {Object.entries(dist).filter(([, v]) => v > 0).map(([level, count]) => {
                  const clr = COMPLEXITY_COLORS[level]
                  return (
                    <span key={level} className={`text-xs font-medium ${clr.text}`}>
                      {level}: {count}
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className={`h-2.5 rounded-full transition-all ${
                complexityPct >= 60 ? 'bg-gradient-to-r from-orange-500 to-red-500'
                : complexityPct >= 25 ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500'
              }`} style={{ width: `${complexityPct}%` }} />
            </div>
          </div>

          {/* Sub-tab nav */}
          <div className="flex border-b border-zinc-800/60 bg-zinc-950/20 px-4">
            {SUB_TABS.map(t => (
              <button key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  subTab === t.id
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}>
                {t.label}
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  subTab === t.id ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-500'
                }`}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* Sub-tab content */}
          <div className="p-4">
            {subTab === 'tables' && (
              ds.tables.length > 0
                ? <TablesPanel tables={ds.tables} />
                : <p className="text-xs text-zinc-600 italic">No table data available.</p>
            )}

            {subTab === 'measures' && (
              ds.measures.length > 0
                ? <div className="space-y-1 max-h-[32rem] overflow-y-auto pr-1">
                    {[...ds.measures].sort((a, b) =>
                      (b.complexity?.score ?? 0) - (a.complexity?.score ?? 0)
                    ).map(m => <MeasureRow key={m.name} m={m} />)}
                  </div>
                : <p className="text-xs text-zinc-600 italic">No measures found.</p>
            )}

            {subTab === 'calc_cols' && (
              (ds.calculated_columns || []).length > 0
                ? <div className="space-y-1 max-h-[32rem] overflow-y-auto pr-1">
                    {[...(ds.calculated_columns || [])].sort((a, b) =>
                      (b.complexity?.score ?? 0) - (a.complexity?.score ?? 0)
                    ).map(c => <CalcItemRow key={`${c.table}-${c.name}`} item={c} type="col" />)}
                  </div>
                : <p className="text-xs text-zinc-600 italic">No calculated columns found.</p>
            )}

            {subTab === 'calc_tables' && (
              (ds.calculated_tables || []).length > 0
                ? <div className="space-y-1 max-h-[32rem] overflow-y-auto pr-1">
                    {[...(ds.calculated_tables || [])].sort((a, b) =>
                      (b.complexity?.score ?? 0) - (a.complexity?.score ?? 0)
                    ).map(t => <CalcItemRow key={t.name} item={t} type="table" />)}
                  </div>
                : <p className="text-xs text-zinc-600 italic">No calculated tables found.</p>
            )}

            {subTab === 'relationships' && (
              <RelationshipsTable rels={ds.relationships || []} />
            )}
          </div>

          {ds.web_url && (
            <div className="px-4 pb-3">
              <a href={ds.web_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 hover:underline transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Open in Power BI
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Report section (for Reports tab) ─────────────────────────────────────────

function ReportSection({ rpt }: { rpt: FabricReport }) {
  const [open, setOpen] = useState(false)
  const [showBm, setShowBm] = useState(false)

  return (
    <div className="border border-zinc-800/50 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-900/50 hover:bg-zinc-800/40 transition-colors text-left">
        <FileText className={`h-4 w-4 shrink-0 ${rpt.is_paginated ? 'text-orange-400' : 'text-blue-400'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{rpt.name}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500 flex-wrap">
            {rpt.is_paginated ? (
              <span className="text-orange-400 font-medium">Paginated (RDL)</span>
            ) : (
              <>
                <span>{rpt.page_count ?? '?'} pages</span>
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{rpt.visual_count} visuals</span>
                {rpt.bookmark_count > 0 && (
                  <span className="flex items-center gap-1">
                    <Bookmark className="h-3 w-3 text-indigo-400" />{rpt.bookmark_count} bookmarks
                  </span>
                )}
                {rpt.layout_parsed
                  ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Full field analysis</span>
                  : <span className="text-zinc-700">Counts only</span>}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rpt.web_url && (
            <a href={rpt.web_url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-zinc-500 hover:text-amber-400 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-zinc-600" />
                : <ChevronDown className="h-4 w-4 text-zinc-600" />}
        </div>
      </button>

      {open && !rpt.is_paginated && (
        <div className="border-t border-zinc-800/40 p-4 space-y-3">
          {rpt.bookmarks && rpt.bookmarks.length > 0 && (
            <div>
              <button onClick={() => setShowBm(o => !o)}
                className="flex items-center gap-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 mb-1 transition-colors">
                <Bookmark className="h-3.5 w-3.5" />
                Bookmarks ({rpt.bookmarks.length})
                {showBm ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showBm && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {rpt.bookmarks.map((bm: FabricBookmark) => (
                    <div key={bm.id} className="flex items-center gap-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20 px-3 py-2">
                      <Bookmark className="h-3 w-3 text-indigo-400 shrink-0" />
                      <span className="text-xs font-medium text-indigo-300 flex-1 truncate">{bm.name}</span>
                      {bm.target_page && (
                        <span className="flex items-center gap-1 text-xs text-indigo-500 shrink-0">
                          <ArrowRight className="h-2.5 w-2.5" />{bm.target_page}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {rpt.pages && rpt.pages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Pages ({rpt.pages.length})
              </p>
              {rpt.pages.map((page, i) => <PageAccordion key={i} page={page} />)}
            </div>
          )}

          {(!rpt.pages || rpt.pages.length === 0) && (
            <p className="text-xs text-zinc-600 italic">No page data available for this report.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ workspaces, summary }: { workspaces: FabricWorkspace[]; summary: any }) {
  const allDist: Record<string, number> = { 'None': 0, 'Simple': 0, 'Moderate': 0, 'Complex': 0, 'Very Complex': 0 }
  const storageDist: Record<string, number> = {}

  workspaces.forEach(ws => {
    ws.datasets.forEach(ds => {
      const d = getComplexityDistribution(ds)
      Object.keys(d).forEach(k => { allDist[k] = (allDist[k] || 0) + (d as any)[k] })
      const mode = ds.storage_mode || 'Import'
      storageDist[mode] = (storageDist[mode] || 0) + 1
    })
  })

  const complexityChartData = Object.entries(allDist)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({
      label, value, color: COMPLEXITY_COLORS[label]?.hex ?? '#71717a'
    }))

  const storageChartData = Object.entries(storageDist).map(([label, value]) => ({
    label, value,
    color: label === 'DirectLake' ? '#8b5cf6' : label === 'DirectQuery' ? '#3b82f6' : label === 'Composite' ? '#f97316' : '#52525b',
  }))

  const KPI_ITEMS = [
    { label: 'Workspaces',      value: summary.workspace_count,          color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: <Zap className="h-5 w-5 text-amber-400" /> },
    { label: 'Semantic Models', value: summary.dataset_count,            color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: <Database className="h-5 w-5 text-blue-400" /> },
    { label: 'Reports',         value: summary.report_count,             color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  icon: <FileText className="h-5 w-5 text-indigo-400" /> },
    { label: 'Paginated',       value: summary.paginated_report_count,   color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  icon: <BookOpen className="h-5 w-5 text-orange-400" /> },
    { label: 'Total Visuals',   value: summary.total_visuals ?? 0,       color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     icon: <Eye className="h-5 w-5 text-sky-400" /> },
    { label: 'Measures',        value: summary.total_measures,           color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  icon: <Hash className="h-5 w-5 text-violet-400" /> },
    { label: 'Calc. Tables',    value: summary.total_calculated_tables,  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: <Table2 className="h-5 w-5 text-amber-400" /> },
    { label: 'Calc. Columns',   value: summary.total_calculated_columns, color: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    icon: <Calculator className="h-5 w-5 text-teal-400" /> },
    { label: 'Relationships',   value: summary.total_relationships ?? 0, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: <GitMerge className="h-5 w-5 text-emerald-400" /> },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-9 gap-3">
        {KPI_ITEMS.map(({ label, value, color, bg, border, icon }) => (
          <div key={label} className={`rounded-xl ${bg} border ${border} p-3 flex flex-col items-center text-center`}>
            <div className="mb-1">{icon}</div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-zinc-500 leading-tight mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            DAX Complexity Distribution
          </h3>
          <div className="flex items-center gap-6">
            <DonutChart data={complexityChartData} size={130} />
            <div className="flex-1 space-y-1.5">
              {complexityChartData.map(d => (
                <div key={d.label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-zinc-500 flex-1">{d.label}</span>
                  <span className="text-xs font-bold text-zinc-200">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-400" />
            Storage Mode — Semantic Models
          </h3>
          {storageChartData.length > 0
            ? <HBarChart data={storageChartData} />
            : <p className="text-xs text-zinc-600 italic">No model data yet.</p>}
        </div>
      </div>

      {/* Workspace quick-view table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/60 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-300">Workspaces</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800/60">
              <tr>
                {['Workspace', 'Type', 'Models', 'Reports', 'Paginated', 'Visuals', 'Measures'].map(h => (
                  <th key={h} className="text-left px-4 py-2 font-semibold text-zinc-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {workspaces.map(ws => (
                <tr key={ws.id} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-2 font-medium text-zinc-200">{ws.name}</td>
                  <td className="px-4 py-2 text-zinc-500">{ws.type}</td>
                  <td className="px-4 py-2 font-semibold text-blue-400">{ws.dataset_count}</td>
                  <td className="px-4 py-2 font-semibold text-indigo-400">{ws.report_count}</td>
                  <td className="px-4 py-2 font-semibold text-orange-400">{ws.paginated_report_count}</td>
                  <td className="px-4 py-2 text-sky-400">{ws.reports.reduce((s, r) => s + (r.visual_count ?? 0), 0)}</td>
                  <td className="px-4 py-2 text-violet-400">{ws.datasets.reduce((s, d) => s + d.measure_count, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Complexity Analysis Tab ───────────────────────────────────────────────────

type ComplexityItem = {
  workspace: string; model: string; type: 'Measure' | 'Calc Column' | 'Calc Table'
  name: string; table: string; level: string; score: number; expression: string
}

function ComplexityTab({ workspaces }: { workspaces: FabricWorkspace[] }) {
  const [filter, setFilter] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const all: ComplexityItem[] = []
  workspaces.forEach(ws => {
    ws.datasets.forEach(ds => {
      ds.measures.forEach(m => {
        if (m.complexity?.score > 0)
          all.push({ workspace: ws.name, model: ds.name, type: 'Measure', name: m.name, table: m.table, level: m.complexity.level, score: m.complexity.score, expression: m.expression })
      });
      (ds.calculated_columns || []).forEach(c => {
        if (c.complexity && c.complexity.score > 0)
          all.push({ workspace: ws.name, model: ds.name, type: 'Calc Column', name: c.name, table: c.table, level: c.complexity.level, score: c.complexity.score, expression: c.expression })
      });
      (ds.calculated_tables || []).forEach(t => {
        if (t.complexity && t.complexity.score > 0)
          all.push({ workspace: ws.name, model: ds.name, type: 'Calc Table', name: t.name, table: t.name, level: t.complexity.level, score: t.complexity.score, expression: t.expression })
      })
    })
  })
  all.sort((a, b) => b.score - a.score)

  const levels = ['All', 'Very Complex', 'Complex', 'Moderate', 'Simple']
  const filtered = all.filter(item =>
    (filter === 'All' || item.level === filter) &&
    (!search || item.name.toLowerCase().includes(search.toLowerCase()) || item.model.toLowerCase().includes(search.toLowerCase()))
  )

  const typeBadge = (t: string) => {
    const map: Record<string, string> = {
      'Measure':     'bg-violet-500/10 text-violet-400 border-violet-500/30',
      'Calc Column': 'bg-amber-500/10  text-amber-400  border-amber-500/30',
      'Calc Table':  'bg-orange-500/10 text-orange-400 border-orange-500/30',
    }
    return <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-medium ${map[t] ?? 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50'}`}>{t}</span>
  }

  return (
    <div className="space-y-4">
      {/* Summary cards per level */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {['Very Complex', 'Complex', 'Moderate', 'Simple'].map(level => {
          const count = all.filter(x => x.level === level).length
          const clr   = COMPLEXITY_COLORS[level]
          return (
            <button key={level}
              onClick={() => setFilter(f => f === level ? 'All' : level)}
              className={`rounded-xl p-3 border-2 text-left transition-all ${
                filter === level ? `${clr.bg} ${clr.border}` : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
              }`}>
              <p className={`text-xl font-bold ${clr.text}`}>{count}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{level}</p>
            </button>
          )
        })}
      </div>

      {/* Filter & search bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-1.5 flex-1 min-w-48">
          <Filter className="h-3.5 w-3.5 text-zinc-500" />
          <input
            className="flex-1 text-sm outline-none bg-transparent text-zinc-300 placeholder-zinc-600"
            placeholder="Search by name or model…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {levels.map(l => (
            <button key={l}
              onClick={() => setFilter(l)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                filter === l
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}>{l}</button>
          ))}
        </div>
        <span className="text-xs text-zinc-600">{filtered.length} items</span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-zinc-600">
          <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No items match the current filter.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-zinc-800/40">
            {filtered.map((item, idx) => {
              const clr   = COMPLEXITY_COLORS[item.level] ?? COMPLEXITY_COLORS['None']
              const isExp = expandedIdx === idx
              const maxScore = filtered[0].score || 1
              const barPct = (item.score / maxScore) * 100

              return (
                <div key={idx}>
                  <button onClick={() => setExpandedIdx(isExp ? null : idx)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors text-left">
                    <span className="text-xs font-bold text-zinc-600 w-6 shrink-0">#{idx + 1}</span>
                    <div className="w-24 shrink-0">{typeBadge(item.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-100 truncate">{item.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{item.workspace} / {item.model}{item.table && item.table !== item.name ? ` · ${item.table}` : ''}</p>
                    </div>
                    <div className="w-24 hidden sm:block">
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-1.5 rounded-full transition-all"
                          style={{ width: `${barPct}%`, backgroundColor: clr.hex }} />
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${clr.bg} ${clr.text} ${clr.border} shrink-0`}>
                      {item.level} <span className="opacity-60">({item.score})</span>
                    </span>
                    {isExp ? <ChevronUp className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                           : <ChevronDown className="h-3.5 w-3.5 text-zinc-600 shrink-0" />}
                  </button>
                  {isExp && item.expression && (
                    <div className="px-4 pb-3 border-t border-zinc-800/30 bg-zinc-950/30">
                      <p className="text-xs font-semibold text-zinc-500 mb-1 mt-2 flex items-center gap-1">
                        <Code2 className="h-3 w-3" /> DAX Expression
                      </p>
                      <pre className="text-xs font-mono bg-zinc-950 border border-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap text-zinc-300 max-h-40">
                        {item.expression}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Progress message parser ───────────────────────────────────────────────────

interface ProgressData {
  msg: string
  md: number
  mt: number
  rd: number
  rt: number
}

function parseProgress(raw: string | null | undefined): ProgressData | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (typeof p === 'object' && 'msg' in p) return p as ProgressData
  } catch { /* plain text */ }
  return null
}

function ProgressBar({ done, total, label, color }: {
  done: number; total: number; label: string; color: string
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-400 flex items-center gap-1.5">
          {done === total && total > 0
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            : <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
          {label}
        </span>
        <span className="font-semibold text-zinc-300">{done} / {total || '…'}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function RunningProgress({ progressMessage }: { progressMessage?: string | null }) {
  const parsed = parseProgress(progressMessage)
  const displayMsg = parsed ? parsed.msg : (progressMessage || 'Collecting Fabric workspace data…')
  const hasCounters = parsed && (parsed.mt > 0 || parsed.rt > 0)

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500 shrink-0" />
        <div>
          <p className="font-medium text-zinc-200 text-sm">{displayMsg}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Refreshes automatically every 4 seconds</p>
        </div>
      </div>

      {hasCounters && (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Assessment Progress</p>
          {parsed!.mt > 0 && (
            <ProgressBar
              done={parsed!.md}
              total={parsed!.mt}
              label="Semantic Models"
              color="#6366f1"
            />
          )}
          {parsed!.rt > 0 && (
            <ProgressBar
              done={parsed!.rd}
              total={parsed!.rt}
              label="Reports"
              color="#3b82f6"
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FabricSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const queryClient   = useQueryClient()
  const [activeTab, setActiveTab]   = useState<Tab>('overview')
  const [exporting,  setExporting]  = useState(false)

  const { data: session, isLoading } = useQuery({
    queryKey: ['fabric-session', sessionId],
    queryFn:  () => api.getFabricSession(sessionId!).then(r => r.data),
    refetchInterval: q => q.state.data?.status === 'running' ? 4000 : false,
    enabled: !!sessionId,
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelFabricSession(sessionId!),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['fabric-session', sessionId] })
      queryClient.invalidateQueries({ queryKey: ['fabric-sessions'] })
    },
  })

  const handleExport = async () => {
    if (!sessionId) return
    setExporting(true)
    try {
      await api.downloadFabricExcel(sessionId, session?.label)
    } catch (e) {
      console.error('Excel export failed', e)
    } finally {
      setExporting(false)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-zinc-500">
      <Loader2 className="h-6 w-6 animate-spin mr-2 text-amber-500" /> Loading…
    </div>
  )

  if (!session) return (
    <div className="flex items-center gap-2 text-red-400">
      <AlertCircle className="h-5 w-5" /> Fabric session not found.
    </div>
  )

  const results    = session.results
  const summary    = results?.summary
  const workspaces: FabricWorkspace[] = results?.workspaces ?? []
  const isCompleted = session.status === 'completed'

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50 font-display flex items-center gap-2.5">
            <Zap className="h-6 w-6 text-amber-400" />
            {session.label || 'Fabric Assessment'}
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {session.status === 'running' && (
              <>
                <span className="inline-flex items-center gap-1.5 text-sm text-blue-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {(() => { const p = parseProgress(session.progress_message); return p ? p.msg : (session.progress_message || 'Running…') })()}
                </span>
                <button
                  onClick={() => { if (confirm('Stop this assessment?')) cancelMutation.mutate() }}
                  disabled={cancelMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors">
                  <StopCircle className="h-4 w-4" />
                  {cancelMutation.isPending ? 'Stopping…' : 'Stop'}
                </button>
              </>
            )}
            {session.status === 'completed' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Completed
                {session.completed_at && ` · ${formatDateTime(session.completed_at)}`}
              </span>
            )}
            {session.status === 'failed' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-red-400">
                <XCircle className="h-4 w-4" /> Failed — {session.error}
              </span>
            )}
            {session.status === 'cancelled' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-zinc-500">
                <StopCircle className="h-4 w-4" /> Cancelled
              </span>
            )}
          </div>
        </div>

        {isCompleted && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 disabled:opacity-50 transition-colors">
            {exporting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting…</>
              : <><Download className="h-4 w-4" /> Export Excel</>}
          </button>
        )}
      </div>

      {/* ── Running placeholder ──────────────────────────────────────────────── */}
      {session.status === 'running' && (
        <RunningProgress progressMessage={session.progress_message} />
      )}

      {/* ── Results dashboard ────────────────────────────────────────────────── */}
      {results && workspaces.length > 0 && (
        <>
          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-zinc-800/60 overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                    : 'border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/30'
                }`}>
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab panels */}
          <div>
            {activeTab === 'overview' && summary && (
              <OverviewTab workspaces={workspaces} summary={summary} />
            )}

            {activeTab === 'models' && (
              <div className="space-y-4">
                {workspaces.map(ws => (
                  <div key={ws.id} className="card overflow-hidden border-2 border-zinc-800/60">
                    <div className="flex items-center gap-3 px-5 py-3 bg-zinc-900/60 border-b border-zinc-800/60">
                      <Zap className="h-4 w-4 text-amber-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-100">{ws.name}</p>
                        <p className="text-xs text-zinc-500">
                          {ws.dataset_count} model{ws.dataset_count !== 1 ? 's' : ''} ·{' '}
                          {ws.report_count} report{ws.report_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <span className="text-xs text-zinc-600">{ws.type}</span>
                    </div>
                    {ws.datasets.length > 0 ? (
                      <div className="p-4 space-y-3">
                        {ws.datasets.map(ds => <DatasetSection key={ds.id} ds={ds} />)}
                      </div>
                    ) : (
                      <p className="p-4 text-xs text-zinc-600 italic">No semantic models in this workspace.</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="space-y-4">
                {workspaces.map(ws => (
                  <div key={ws.id} className="card overflow-hidden border-2 border-zinc-800/60">
                    <div className="flex items-center gap-3 px-5 py-3 bg-zinc-900/60 border-b border-zinc-800/60">
                      <FileText className="h-4 w-4 text-blue-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-100">{ws.name}</p>
                        <p className="text-xs text-zinc-500">
                          {ws.report_count} interactive · {ws.paginated_report_count} paginated
                        </p>
                      </div>
                    </div>
                    {ws.reports.length > 0 ? (
                      <div className="p-4 space-y-3">
                        {ws.reports.map(r => <ReportSection key={r.id} rpt={r} />)}
                      </div>
                    ) : (
                      <p className="p-4 text-xs text-zinc-600 italic">No reports in this workspace.</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'complexity' && (
              <ComplexityTab workspaces={workspaces} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
