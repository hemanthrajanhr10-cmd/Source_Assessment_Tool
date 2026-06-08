import { useState, Component, type ReactNode, type ErrorInfo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Database, FileText, BarChart2, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, XCircle, AlertCircle, ExternalLink,
  Table2, Hash, Calculator, Link2, Eye,
  ArrowLeft, ArrowRight, Code2, StopCircle, Download, TrendingUp,
  Activity, GitMerge, BookOpen, Filter, Copy, Check, Network,
} from 'lucide-react'
import LineageTab from '../components/fabric/LineageTab'
import { api } from '../api/client'
import type {
  FabricDataset, FabricWorkspace,
  FabricMeasure, MeasureComplexity,
  FabricCalculatedColumn, FabricCalculatedTable, FabricRelationship,
  FabricTable, FabricTableColumn,
} from '../types/api'
import { formatDateTime } from '../utils/dateTime'
import Loader3D from '../components/ui/Loader3D'
import ReportsSegment from '../components/reports/ReportsSegment'
import AssessmentProgress from '../components/AssessmentProgress'

// ── Complexity helpers ────────────────────────────────────────────────────────

const COMPLEXITY_COLORS: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  'None':         { bg: 'bg-slate-100/50',     text: 'text-slate-500',    border: 'border-slate-200',    hex: '#71717a' },
  'Simple':       { bg: 'bg-earth-50', text: 'text-earth-700', border: 'border-earth-200', hex: '#10b981' },
  'Moderate':     { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200',   hex: '#f59e0b' },
  'Complex':      { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200',  hex: '#f97316' },
  'Very Complex': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200',     hex: '#ef4444' },
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
    mode === 'DirectLake'  ? 'bg-earth-50 text-earth-800 border-earth-200' :
    mode === 'DirectQuery' ? 'bg-blue-50 text-blue-700 border-blue-200' :
    mode === 'Composite'   ? 'bg-orange-50 text-orange-700 border-orange-200' :
                             'bg-slate-100/50   text-slate-500   border-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {mode}
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
      <span className="text-xs text-slate-400">No data</span>
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
        <path key={i} d={a.path} fill={a.color} stroke="#ffffff" strokeWidth="2" />
      ))}
      <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="middle"
        fontSize="14" fontWeight="800" fill="#0D1117">{total}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="600" fill="#64748b">total</text>
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
          <span className="text-xs text-slate-500 w-24 shrink-0 truncate">{d.label}</span>
          <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden" style={{ maxWidth: maxW }}>
            <div
              className="h-4 rounded-full transition-all"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-700 w-8 text-right">{d.value}</span>
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

type Tab = 'overview' | 'models' | 'reports' | 'complexity' | 'lineage'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',   label: 'Overview',            icon: <Activity className="h-4 w-4" /> },
  { id: 'models',     label: 'Semantic Models',     icon: <Database className="h-4 w-4" /> },
  { id: 'reports',    label: 'Reports & Visuals',   icon: <FileText className="h-4 w-4" /> },
  { id: 'complexity', label: 'Complexity Analysis', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'lineage',    label: 'Measure Lineage',     icon: <Network className="h-4 w-4" /> },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all shrink-0"
      style={{
        background: copied ? 'rgba(13,148,136,0.10)' : 'rgba(0,86,179,0.07)',
        color: copied ? '#0F766E' : '#0056B3',
        border: `1px solid ${copied ? 'rgba(13,148,136,0.25)' : 'rgba(0,86,179,0.18)'}`,
      }}
      title="Copy DAX expression"
    >
      {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function MeasureRow({ m }: { m: FabricMeasure }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden transition-all" style={{ border: '1px solid rgba(197,213,236,0.8)', boxShadow: open ? '0 2px 12px rgba(0,86,179,0.08)' : undefined }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors"
        style={{ background: open ? 'linear-gradient(135deg, rgba(0,86,179,0.05) 0%, rgba(0,132,212,0.02) 100%)' : 'rgba(248,250,253,0.8)' }}>
        <Hash className="h-3.5 w-3.5 text-brand-600 shrink-0" />
        <span className="flex-1 text-xs font-mono font-semibold text-slate-800 truncate">{m.name}</span>
        {m.table && <span className="text-xs text-slate-400 shrink-0 mr-1 bg-slate-100 px-1.5 py-0.5 rounded">{m.table}</span>}
        {m.complexity && <ComplexityBadge c={m.complexity} small />}
        {open ? <ChevronUp className="h-3 w-3 text-slate-400 ml-1 shrink-0" />
               : <ChevronDown className="h-3 w-3 text-slate-400 ml-1 shrink-0" />}
      </button>
      {open && (
        <div className="border-t p-3 space-y-2.5" style={{ borderColor: 'rgba(197,213,236,0.5)', background: 'rgba(248,250,253,0.6)' }}>
          {m.expression && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Code2 className="h-3 w-3" /> DAX Expression
                </p>
                <CopyButton text={m.expression} />
              </div>
              <pre className="text-xs font-mono rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap text-slate-700 max-h-32 border"
                style={{ background: 'rgba(0,86,179,0.03)', borderColor: 'rgba(0,86,179,0.10)' }}>
                {m.expression}
              </pre>
            </div>
          )}
          {m.complexity && m.complexity.score > 0 && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span>Functions: <strong className="text-slate-700">{m.complexity.function_count}</strong></span>
              <span>Nesting: <strong className="text-slate-700">{m.complexity.nesting_depth}</strong></span>
              <span>Col refs: <strong className="text-slate-700">{m.complexity.dependency_count}</strong></span>
              {m.complexity.complex_functions.length > 0 && (
                <span className="text-orange-400">Complex fns: {m.complexity.complex_functions.join(', ')}</span>
              )}
            </div>
          )}
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

function CalcItemRow({ item, type }: { item: FabricCalculatedColumn | FabricCalculatedTable; type: 'col' | 'table' }) {
  const [open, setOpen] = useState(false)
  const cx = item.complexity
  const hasExpr = !!item.expression
  return (
    <div className="rounded-xl overflow-hidden transition-all" style={{ border: '1px solid rgba(197,213,236,0.8)', boxShadow: open ? '0 2px 12px rgba(0,86,179,0.08)' : undefined }}>
      <button onClick={() => hasExpr && setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left ${hasExpr ? 'cursor-pointer' : ''} transition-colors`}
        style={{ background: open ? 'linear-gradient(135deg, rgba(217,119,6,0.05) 0%, rgba(251,191,36,0.02) 100%)' : 'rgba(248,250,253,0.8)' }}>
        {type === 'col'
          ? <Calculator className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          : <Table2 className="h-3.5 w-3.5 text-orange-600 shrink-0" />}
        <span className="flex-1 text-xs font-mono font-semibold text-slate-800 truncate">{item.name}</span>
        {'table' in item && item.table && (
          <span className="text-xs text-slate-400 shrink-0 mr-1 bg-slate-100 px-1.5 py-0.5 rounded">{(item as FabricCalculatedColumn).table}</span>
        )}
        {'data_type' in item && (item as FabricCalculatedColumn).data_type && (
          <span className="text-xs text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 mr-1">
            {(item as FabricCalculatedColumn).data_type}
          </span>
        )}
        {cx && cx.level !== 'None' && <ComplexityBadge c={cx} small />}
        {hasExpr && (
          open ? <ChevronUp className="h-3 w-3 text-slate-400 ml-1 shrink-0" />
               : <ChevronDown className="h-3 w-3 text-slate-400 ml-1 shrink-0" />
        )}
      </button>
      {open && hasExpr && (
        <div className="border-t p-3" style={{ borderColor: 'rgba(197,213,236,0.5)', background: 'rgba(248,250,253,0.6)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Code2 className="h-3 w-3" /> DAX Expression
            </p>
            <CopyButton text={item.expression!} />
          </div>
          <pre className="text-xs font-mono rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap text-slate-700 max-h-28 border"
            style={{ background: 'rgba(0,86,179,0.03)', borderColor: 'rgba(0,86,179,0.10)' }}>
            {item.expression}
          </pre>
          {cx && cx.score > 0 && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-2">
              <span>Functions: <strong className="text-slate-700">{cx.function_count}</strong></span>
              <span>Nesting: <strong className="text-slate-700">{cx.nesting_depth}</strong></span>
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
    <p className="text-xs text-slate-400 italic">No relationship data available.</p>
  )
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            {['From Table', 'From Column', '', 'To Table', 'To Column', 'Cardinality', 'Cross Filter', 'Active'].map(h => (
              <th key={h} className="text-left px-3 py-2 font-semibold text-slate-500 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rels.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-1.5 font-mono font-semibold text-slate-800">{r.from_table}</td>
              <td className="px-3 py-1.5 font-mono text-slate-500">{r.from_column}</td>
              <td className="px-3 py-1.5 text-slate-300"><ArrowRight className="h-3 w-3" /></td>
              <td className="px-3 py-1.5 font-mono font-semibold text-slate-800">{r.to_table}</td>
              <td className="px-3 py-1.5 font-mono text-slate-500">{r.to_column}</td>
              <td className="px-3 py-1.5">
                <span className="bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{r.cardinality}</span>
              </td>
              <td className="px-3 py-1.5 text-slate-500">{r.cross_filter}</td>
              <td className="px-3 py-1.5">
                {r.is_active
                  ? <span className="text-earth-400 font-medium">✓ Active</span>
                  : <span className="text-slate-400">Inactive</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Tables panel with expandable column drill-down ────────────────────────────

const DATA_TYPE_COLORS: Record<string, string> = {
  string:   'bg-sky-500/10    text-sky-400    border-sky-500/30',
  int64:    'bg-earth-500/10 text-earth-500 border-earth-500/30',
  double:   'bg-earth-500/10 text-earth-500 border-earth-500/30',
  decimal:  'bg-earth-500/10 text-earth-500 border-earth-500/30',
  boolean:  'bg-amber-50       text-amber-700  border-amber-200',
  datetime: 'bg-earth-500/10  text-earth-400  border-earth-500/30',
  binary:   'bg-slate-100/50   text-slate-500   border-slate-200',
}

function DataTypeBadge({ type }: { type: string }) {
  const normalised = (type || 'unknown').toLowerCase().replace(/\s+/g, '')
  const cls = DATA_TYPE_COLORS[normalised] ?? 'bg-slate-100/50 text-slate-500 border-slate-200'
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
    <div className={`border-b last:border-0 border-slate-100 ${col.is_hidden ? 'opacity-50' : ''}`}>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 text-xs ${hasExpr ? 'cursor-pointer hover:bg-slate-50' : ''}`}
        onClick={() => hasExpr && setOpen(o => !o)}
      >
        <span className="w-4 flex-shrink-0 text-slate-400">
          {hasExpr ? (open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
        </span>
        <span className="flex-1 font-mono text-slate-700 truncate">{col.name}</span>
        <DataTypeBadge type={col.data_type} />
        {col.is_calculated && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">Calc</span>
        )}
        {col.is_hidden && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium border bg-slate-100/50 text-slate-500 border-slate-200">Hidden</span>
        )}
        {col.complexity && col.complexity.level !== 'None' && (
          <ComplexityBadge c={col.complexity} small />
        )}
      </div>
      {open && col.expression && (
        <div className="ml-9 mr-3 mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1"><Code2 className="h-2.5 w-2.5" /> DAX</span>
            <CopyButton text={col.expression} />
          </div>
          <pre className="rounded-lg font-mono text-xs p-2 overflow-x-auto border text-slate-700"
            style={{ background: 'rgba(0,86,179,0.03)', borderColor: 'rgba(0,86,179,0.10)' }}>
            {col.expression}
          </pre>
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
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left bg-slate-100/60 hover:bg-slate-100 transition-colors"
      >
        <span className="text-slate-500">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
        <Table2 className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
        <span className="flex-1 font-mono text-sm font-medium text-slate-800">{table.name}</span>
        <StorageBadge mode={table.storage_mode} />
        {table.is_calculated && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">DAX Table</span>
        )}
        {table.is_hidden && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-slate-100/50 text-slate-500 border-slate-200">Hidden</span>
        )}
        {cols.length > 0 && (
          <span className="text-xs text-slate-500">{cols.length} col{cols.length !== 1 ? 's' : ''}</span>
        )}
        {calcCols.length > 0 && (
          <span className="text-xs text-amber-600">{calcCols.length} calc</span>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/40">
          {cols.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400 italic">No column data available (metadata not retrieved via TMDL/Scanner).</p>
          ) : (
            <>
              <div className="divide-y divide-slate-100 bg-white mx-3 my-3 rounded-md border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <span className="w-4 flex-shrink-0" />
                  <span className="flex-1">Column Name</span>
                  <span className="w-28 text-right">Data Type</span>
                  <span className="w-16 text-right">Flags</span>
                  <span className="w-24 text-right">Complexity</span>
                </div>
                {visibleCols.map(c => <ColumnRow key={c.name} col={c} />)}
                {hiddenCols.length > 0 && (
                  <>
                    <div className="px-3 py-1 bg-slate-50/40 text-xs text-slate-400 font-medium">
                      Hidden columns ({hiddenCols.length})
                    </div>
                    {hiddenCols.map(c => <ColumnRow key={c.name} col={c} />)}
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 px-4 pb-3 text-xs text-slate-500">
                <span>{visibleCols.length} visible</span>
                {hiddenCols.length > 0 && <span>{hiddenCols.length} hidden</span>}
                {calcCols.length > 0 && <span className="text-earth-600">{calcCols.length} calculated</span>}
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
        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter tables…"
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-earth-600/40"
        />
      </div>

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map(t => <TableRow key={t.name} table={t} />)}
        </div>
      )}

      {hidden.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-500 list-none flex items-center gap-1 select-none">
            <ChevronDown className="h-3.5 w-3.5 group-open:rotate-180 transition-transform" />
            {hidden.length} hidden table{hidden.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {hidden.map(t => <TableRow key={t.name} table={t} />)}
          </div>
        </details>
      )}

      {filtered.length === 0 && (
        <p className="text-xs text-slate-400 italic text-center py-4">No tables match "{filter}"</p>
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
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100/50 transition-all text-left"
        onClick={() => setOpen(!open)}>
        <Database className="h-4 w-4 text-earth-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{ds.name}</p>
          <p className="text-xs text-slate-500">by {ds.configured_by || 'unknown'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StorageBadge mode={ds.storage_mode} />
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
            complexityPct >= 60 ? 'bg-red-50 text-red-700 border-red-200'
            : complexityPct >= 25 ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-earth-50 text-earth-700 border-earth-200'
          }`}>
            <BarChart2 className="h-3 w-3" />
            {complexityPct >= 60 ? 'High' : complexityPct >= 25 ? 'Medium' : 'Low'} ({complexityPct})
          </span>
          {!ds.info_supported && <span className="text-xs text-slate-400 italic">No DAX access</span>}
          {open ? <ChevronUp className="h-4 w-4 text-slate-500" />
                : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {/* KPI row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-0 border-b border-slate-100">
            {[
              { icon: <Table2 className="h-3.5 w-3.5 text-slate-500" />,     label: 'Tables',      value: ds.table_count },
              { icon: <Hash className="h-3.5 w-3.5 text-earth-500" />,     label: 'Measures',    value: ds.measure_count },
              { icon: <Calculator className="h-3.5 w-3.5 text-amber-400" />, label: 'Calc Cols',  value: ds.calculated_column_count },
              { icon: <Database className="h-3.5 w-3.5 text-orange-400" />, label: 'Calc Tables', value: ds.calculated_table_count },
              { icon: <Link2 className="h-3.5 w-3.5 text-blue-400" />,      label: 'Rels',        value: ds.relationship_count },
              { icon: <BarChart2 className="h-3.5 w-3.5 text-red-400" />,   label: 'Complexity',  value: `${complexityPct}%` },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex flex-col items-center justify-center py-3 border-r last:border-r-0 border-slate-100">
                <div className="flex items-center gap-1 text-slate-500 mb-0.5">{icon}</div>
                <p className="text-base font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Complexity bar */}
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/40">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Model Complexity Score</span>
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
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-2.5 rounded-full transition-all ${
                complexityPct >= 60 ? 'bg-gradient-to-r from-orange-500 to-red-500'
                : complexityPct >= 25 ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                : 'bg-gradient-to-r from-earth-400 to-earth-300'
              }`} style={{ width: `${complexityPct}%` }} />
            </div>
          </div>

          {/* Sub-tab nav */}
          <div className="flex px-4" style={{ borderBottom: '1px solid rgba(197,213,236,0.6)', background: 'rgba(248,250,253,0.6)' }}>
            {SUB_TABS.map(t => (
              <button key={t.id}
                onClick={() => setSubTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors"
                style={{
                  borderBottomColor: subTab === t.id ? '#0056B3' : 'transparent',
                  color: subTab === t.id ? '#003D82' : '#64748B',
                }}>
                {t.label}
                <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                  style={{
                    background: subTab === t.id ? 'rgba(0,86,179,0.10)' : 'rgba(148,163,184,0.12)',
                    color: subTab === t.id ? '#003D82' : '#64748B',
                  }}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* Sub-tab content */}
          <div className="p-4">
            {subTab === 'tables' && (
              ds.tables.length > 0
                ? <TablesPanel tables={ds.tables} />
                : <p className="text-xs text-slate-400 italic">No table data available.</p>
            )}

            {subTab === 'measures' && (
              ds.measures.length > 0
                ? <div className="space-y-1 max-h-[32rem] overflow-y-auto pr-1">
                    {[...ds.measures].sort((a, b) =>
                      (b.complexity?.score ?? 0) - (a.complexity?.score ?? 0)
                    ).map(m => <MeasureRow key={m.name} m={m} />)}
                  </div>
                : <p className="text-xs text-slate-400 italic">No measures found.</p>
            )}

            {subTab === 'calc_cols' && (
              (ds.calculated_columns || []).length > 0
                ? <div className="space-y-1 max-h-[32rem] overflow-y-auto pr-1">
                    {[...(ds.calculated_columns || [])].sort((a, b) =>
                      (b.complexity?.score ?? 0) - (a.complexity?.score ?? 0)
                    ).map(c => <CalcItemRow key={`${c.table}-${c.name}`} item={c} type="col" />)}
                  </div>
                : <p className="text-xs text-slate-400 italic">No calculated columns found.</p>
            )}

            {subTab === 'calc_tables' && (
              (ds.calculated_tables || []).length > 0
                ? <div className="space-y-1 max-h-[32rem] overflow-y-auto pr-1">
                    {[...(ds.calculated_tables || [])].sort((a, b) =>
                      (b.complexity?.score ?? 0) - (a.complexity?.score ?? 0)
                    ).map(t => <CalcItemRow key={t.name} item={t} type="table" />)}
                  </div>
                : <p className="text-xs text-slate-400 italic">No calculated tables found.</p>
            )}

            {subTab === 'relationships' && (
              <RelationshipsTable rels={ds.relationships || []} />
            )}
          </div>

          {ds.web_url && (
            <div className="px-4 pb-3">
              <a href={ds.web_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-earth-700 hover:text-earth-800 hover:underline transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Open in Power BI
              </a>
            </div>
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
    color: label === 'DirectLake' ? '#0891B2' : label === 'DirectQuery' ? '#3b82f6' : label === 'Composite' ? '#f97316' : '#52525b',
  }))

  const KPI_ITEMS = [
    { label: 'Workspaces',      value: summary.workspace_count,          iconBg: 'linear-gradient(135deg,#0056B3,#0084D4)',  glow: 'rgba(0,86,179,0.20)',   icon: <Zap className="h-4 w-4 text-white" />,        numColor: '#003D82' },
    { label: 'Semantic Models', value: summary.dataset_count,            iconBg: 'linear-gradient(135deg,#0891B2,#22D3EE)',  glow: 'rgba(8,145,178,0.20)',  icon: <Database className="h-4 w-4 text-white" />,   numColor: '#0E7490' },
    { label: 'Reports',         value: summary.report_count,             iconBg: 'linear-gradient(135deg,#0D9488,#2DD4BF)',  glow: 'rgba(13,148,136,0.20)', icon: <FileText className="h-4 w-4 text-white" />,   numColor: '#0F766E' },
    { label: 'Paginated',       value: summary.paginated_report_count,   iconBg: 'linear-gradient(135deg,#D97706,#FBBF24)',  glow: 'rgba(217,119,6,0.20)',  icon: <BookOpen className="h-4 w-4 text-white" />,   numColor: '#92400E' },
    { label: 'Total Visuals',   value: summary.total_visuals ?? 0,       iconBg: 'linear-gradient(135deg,#38A8F5,#7EC8FF)',  glow: 'rgba(56,168,245,0.20)', icon: <Eye className="h-4 w-4 text-white" />,        numColor: '#0056B3' },
    { label: 'Measures',        value: summary.total_measures,           iconBg: 'linear-gradient(135deg,#0056B3,#38A8F5)',  glow: 'rgba(0,86,179,0.20)',   icon: <Hash className="h-4 w-4 text-white" />,       numColor: '#003D82' },
    { label: 'Calc. Tables',    value: summary.total_calculated_tables,  iconBg: 'linear-gradient(135deg,#F59E0B,#FCD34D)',  glow: 'rgba(245,158,11,0.20)', icon: <Table2 className="h-4 w-4 text-white" />,     numColor: '#92400E' },
    { label: 'Calc. Columns',   value: summary.total_calculated_columns, iconBg: 'linear-gradient(135deg,#F97316,#FB923C)',  glow: 'rgba(249,115,22,0.20)', icon: <Calculator className="h-4 w-4 text-white" />, numColor: '#9A3412' },
    { label: 'Relationships',   value: summary.total_relationships ?? 0, iconBg: 'linear-gradient(135deg,#8B5CF6,#A78BFA)',  glow: 'rgba(139,92,246,0.20)', icon: <GitMerge className="h-4 w-4 text-white" />,   numColor: '#5B21B6' },
  ]

  return (
    <div className="space-y-6">

      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden px-6 py-5"
        style={{
          background: 'linear-gradient(135deg, #0056B3 0%, #0084D4 50%, #0891B2 100%)',
          boxShadow: '0 8px 32px rgba(0,86,179,0.28), 0 2px 8px rgba(0,0,0,0.08)',
        }}>
        {/* Decorative orbs */}
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10 -translate-y-12 translate-x-12"
          style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-16 w-32 h-32 rounded-full opacity-10 translate-y-8"
          style={{ background: 'radial-gradient(circle, #38A8F5 0%, transparent 70%)' }} />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-0.5">Assessment Overview</p>
            <h2 className="text-white text-xl font-bold leading-tight">
              {summary.workspace_count} Workspace{summary.workspace_count !== 1 ? 's' : ''} Assessed
            </h2>
            <p className="text-white/60 text-xs mt-1">
              {summary.dataset_count} models · {summary.report_count} reports · {summary.total_measures} measures
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-white/60 text-[10px] uppercase tracking-wider">Total Visuals</p>
              <p className="text-white text-2xl font-black">{summary.total_visuals ?? 0}</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="text-right">
              <p className="text-white/60 text-[10px] uppercase tracking-wider">DAX Items</p>
              <p className="text-white text-2xl font-black">
                {(summary.total_measures ?? 0) + (summary.total_calculated_tables ?? 0) + (summary.total_calculated_columns ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
        {KPI_ITEMS.map(({ label, value, iconBg, glow, icon, numColor }) => (
          <div key={label}
            className="rounded-xl p-3 flex flex-col items-center text-center group cursor-default transition-all duration-200"
            style={{
              background: '#ffffff',
              border: '1px solid rgba(197,213,236,0.8)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget
              el.style.transform = 'translateY(-2px)'
              el.style.boxShadow = `0 8px 24px ${glow}, 0 2px 8px rgba(0,0,0,0.06)`
              el.style.borderColor = glow
            }}
            onMouseLeave={e => {
              const el = e.currentTarget
              el.style.transform = ''
              el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'
              el.style.borderColor = 'rgba(197,213,236,0.8)'
            }}
          >
            <div className="mb-1.5 flex items-center justify-center h-8 w-8 rounded-xl"
              style={{ background: iconBg, boxShadow: `0 2px 8px ${glow}` }}>
              {icon}
            </div>
            <p className="text-lg font-black" style={{ color: numColor }}>{value}</p>
            <p className="text-[10px] text-slate-400 leading-tight mt-0.5 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Charts row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl border p-5" style={{ borderColor: 'rgba(197,213,236,0.8)', boxShadow: '0 2px 8px rgba(0,86,179,0.04)' }}>
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span className="flex items-center justify-center h-6 w-6 rounded-lg"
              style={{ background: 'linear-gradient(135deg,#0056B3,#0084D4)' }}>
              <TrendingUp className="h-3.5 w-3.5 text-white" />
            </span>
            DAX Complexity Distribution
          </h3>
          <div className="flex items-center gap-6">
            <DonutChart data={complexityChartData} size={130} />
            <div className="flex-1 space-y-2">
              {complexityChartData.map(d => (
                <div key={d.label} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-slate-500 flex-1">{d.label}</span>
                  <span className="text-xs font-bold text-slate-800">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border p-5" style={{ borderColor: 'rgba(197,213,236,0.8)', boxShadow: '0 2px 8px rgba(0,86,179,0.04)' }}>
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span className="flex items-center justify-center h-6 w-6 rounded-lg"
              style={{ background: 'linear-gradient(135deg,#0891B2,#22D3EE)' }}>
              <Database className="h-3.5 w-3.5 text-white" />
            </span>
            Storage Mode — Semantic Models
          </h3>
          {storageChartData.length > 0
            ? <HBarChart data={storageChartData} />
            : <p className="text-xs text-slate-400 italic">No model data yet.</p>}
        </div>
      </div>

      {/* ── Workspace table ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(197,213,236,0.8)', boxShadow: '0 2px 8px rgba(0,86,179,0.04)' }}>
        <div className="px-5 py-3.5 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, rgba(0,86,179,0.06) 0%, rgba(0,132,212,0.03) 100%)', borderBottom: '1px solid rgba(197,213,236,0.6)' }}>
          <span className="flex items-center justify-center h-6 w-6 rounded-lg"
            style={{ background: 'linear-gradient(135deg,#0056B3,#0084D4)', boxShadow: '0 2px 6px rgba(0,86,179,0.25)' }}>
            <Zap className="h-3.5 w-3.5 text-white" />
          </span>
          <h3 className="text-sm font-bold text-slate-800">Workspaces</h3>
          <span className="ml-auto text-xs text-slate-400">{workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'rgba(239,246,255,0.7)', borderBottom: '1px solid rgba(197,213,236,0.6)' }}>
                {['Workspace', 'Type', 'Models', 'Reports', 'Paginated', 'Visuals', 'Measures'].map((h, hi) => (
                  <th key={h} className={`px-4 py-2.5 font-semibold text-slate-500 ${hi === 0 ? 'text-left' : 'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workspaces.map((ws) => (
                <tr key={ws.id}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid rgba(197,213,236,0.4)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(0,86,179,0.03)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                >
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{ws.name}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">{ws.type}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-bold" style={{ color: '#0891B2' }}>{ws.dataset_count}</td>
                  <td className="px-4 py-2.5 text-center font-bold" style={{ color: '#0D9488' }}>{ws.report_count}</td>
                  <td className="px-4 py-2.5 text-center font-bold text-amber-600">{ws.paginated_report_count}</td>
                  <td className="px-4 py-2.5 text-center font-bold" style={{ color: '#0056B3' }}>{ws.reports.reduce((s, r) => s + (r.visual_count ?? 0), 0)}</td>
                  <td className="px-4 py-2.5 text-center font-bold" style={{ color: '#5B21B6' }}>{ws.datasets.reduce((s, d) => s + d.measure_count, 0)}</td>
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
      'Measure':     'bg-earth-500/10 text-earth-500 border-earth-500/30',
      'Calc Column': 'bg-amber-50       text-amber-700  border-amber-200',
      'Calc Table':  'bg-orange-500/10 text-orange-400 border-orange-500/30',
    }
    return <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-medium ${map[t] ?? 'bg-slate-100/50 text-slate-500 border-slate-200'}`}>{t}</span>
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
                filter === level ? `${clr.bg} ${clr.border}` : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}>
              <p className={`text-xl font-bold ${clr.text}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{level}</p>
            </button>
          )
        })}
      </div>

      {/* Filter & search bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex-1 min-w-48">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <input
            className="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder-zinc-600"
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
                  ? 'bg-earth-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
              }`}>{l}</button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{filtered.length} items</span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No items match the current filter.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-50">
            {filtered.map((item, idx) => {
              const clr   = COMPLEXITY_COLORS[item.level] ?? COMPLEXITY_COLORS['None']
              const isExp = expandedIdx === idx
              const maxScore = filtered[0].score || 1
              const barPct = (item.score / maxScore) * 100

              return (
                <div key={idx}>
                  <button onClick={() => setExpandedIdx(isExp ? null : idx)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                    <span className="text-xs font-bold text-slate-400 w-6 shrink-0">#{idx + 1}</span>
                    <div className="w-24 shrink-0">{typeBadge(item.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                      <p className="text-xs text-slate-500 truncate">{item.workspace} / {item.model}{item.table && item.table !== item.name ? ` · ${item.table}` : ''}</p>
                    </div>
                    <div className="w-24 hidden sm:block">
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-1.5 rounded-full transition-all"
                          style={{ width: `${barPct}%`, backgroundColor: clr.hex }} />
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${clr.bg} ${clr.text} ${clr.border} shrink-0`}>
                      {item.level} <span className="opacity-60">({item.score})</span>
                    </span>
                    {isExp ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                           : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                  </button>
                  {isExp && item.expression && (
                    <div className="px-4 pb-3 border-t border-slate-100 bg-slate-50/60">
                      <p className="text-xs font-semibold text-slate-500 mb-1 mt-2 flex items-center gap-1">
                        <Code2 className="h-3 w-3" /> DAX Expression
                      </p>
                      <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap text-slate-700 max-h-40">
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


// ── Error Boundary ─────────────────────────────────────────────────────────────

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('FabricSessionDetailPage render error', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-slate-700 font-medium">Something went wrong rendering this page.</p>
          <p className="text-xs text-slate-500 max-w-sm">{(this.state.error as Error).message}</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-earth-50 text-earth-700 border border-earth-200 hover:bg-earth-100 transition-colors"
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

function FabricSessionDetailPageInner() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate      = useNavigate()
  const location      = useLocation()
  const fromConsolidated = (location.state as { fromConsolidated?: boolean } | null)?.fromConsolidated === true
  const unifiedSessionId = (location.state as { unifiedSessionId?: string } | null)?.unifiedSessionId
  const queryClient   = useQueryClient()
  const [activeTab, setActiveTab]   = useState<Tab>('overview')
  const [exporting,  setExporting]  = useState(false)
  const [exportingWord, setExportingWord] = useState(false)
  const [wsPage, setWsPage]         = useState(5)

  const { data: session, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['fabric-session', sessionId],
    queryFn:  () => api.getFabricSession(sessionId!).then(r => r.data),
    refetchInterval: q => q.state.data?.status === 'running' ? 5000 : false,
    staleTime: q => q.state.data?.status === 'completed' ? 5 * 60 * 1000 : 0,
    retry: 3,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10000),
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

  const handleWordExport = async () => {
    if (!sessionId) return
    setExportingWord(true)
    try {
      await api.downloadFabricWord(sessionId, session?.label)
    } catch (e) {
      console.error('Word export failed', e)
    } finally {
      setExportingWord(false)
    }
  }

  if (isLoading) return <Loader3D message="Loading session" size="lg" />

  if (isError) return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <AlertCircle className="h-10 w-10 text-red-400" />
      <p className="text-slate-700 font-semibold">Failed to load session</p>
      <p className="text-xs text-slate-500 max-w-sm">
        {(queryError as Error)?.message ?? 'Network error. The server may be busy with a large assessment.'}
      </p>
      <button
        onClick={() => refetch()}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-earth-50 text-earth-700 border border-earth-200 hover:bg-earth-100 transition-colors"
      >
        Retry
      </button>
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
      {/* ── Back to consolidated report (when accessed from unified session) ── */}
      {fromConsolidated && unifiedSessionId && (
        <button
          onClick={() => navigate(`/unified/sessions/${unifiedSessionId}`)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Full Report
        </button>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display flex items-center gap-2.5">
            <Zap className="h-6 w-6 text-earth-600" />
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors">
                  <StopCircle className="h-4 w-4" />
                  {cancelMutation.isPending ? 'Stopping…' : 'Stop'}
                </button>
              </>
            )}
            {session.status === 'completed' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-earth-700">
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
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <StopCircle className="h-4 w-4" /> Cancelled
              </span>
            )}
          </div>
        </div>

        {isCompleted && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-earth-50 hover:bg-earth-100 text-earth-700 border border-earth-200 disabled:opacity-50 transition-colors">
              {exporting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting…</>
                : <><Download className="h-4 w-4" /> Export Excel</>}
            </button>
            <button
              onClick={handleWordExport}
              disabled={exportingWord}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 disabled:opacity-50 transition-colors">
              {exportingWord
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                : <><Download className="h-4 w-4" /> Export Word</>}
            </button>
          </div>
        )}
      </div>

      {/* ── Live progress dashboard ──────────────────────────────────────────── */}
      {session.status === 'running' && (
        <div style={{ padding: '24px 0' }}>
          <AssessmentProgress
            sessionId={session.fabric_session_id}
            sessionLabel={session.label}
            onComplete={() => refetch()}
          />
        </div>
      )}

      {/* ── Results dashboard ────────────────────────────────────────────────── */}
      {results && workspaces.length > 0 && (
        <>
          {/* Tab bar — animated underline pill */}
          <div className="flex items-center gap-0.5 overflow-x-auto pb-0"
            style={{ borderBottom: '1px solid rgba(197,213,236,0.7)', position: 'relative' }}>
            {TABS.map(tab => (
              <button key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap"
                style={{
                  position: 'relative',
                  color: activeTab === tab.id ? '#003D82' : '#64748B',
                  background: activeTab === tab.id ? 'rgba(0,86,179,0.05)' : 'transparent',
                  border: 'none', cursor: 'pointer', outline: 'none',
                  transition: 'color 150ms cubic-bezier(0.4,0,0.2,1), background 150ms cubic-bezier(0.4,0,0.2,1)',
                }}
                onMouseEnter={e => {
                  if (activeTab !== tab.id) {
                    (e.currentTarget as HTMLButtonElement).style.color = '#0056B3'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,86,179,0.04)'
                  }
                }}
                onMouseLeave={e => {
                  if (activeTab !== tab.id) {
                    (e.currentTarget as HTMLButtonElement).style.color = '#64748B'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }
                }}
              >
                {tab.icon}
                {tab.label}
                {/* Animated bottom indicator */}
                {activeTab === tab.id && (
                  <motion.span
                    layoutId="tab-underline"
                    style={{
                      position: 'absolute', bottom: -1, left: 0, right: 0, height: 2,
                      background: 'linear-gradient(90deg, #0056B3, #0084D4)',
                      borderRadius: '2px 2px 0 0',
                    }}
                    transition={{ type: 'spring', duration: 0.38, bounce: 0.2 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab panels — AnimatePresence fade+slide */}
          <div style={{ position: 'relative' }}>
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && summary && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
                  transition={{ type: 'spring', duration: 0.38, bounce: 0 }}
                >
                  <OverviewTab workspaces={workspaces} summary={summary} />
                </motion.div>
              )}

              {activeTab === 'models' && (
                <motion.div
                  key="models"
                  initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
                  transition={{ type: 'spring', duration: 0.38, bounce: 0 }}
                  className="space-y-4"
                >
                  {workspaces.slice(0, wsPage).map((ws, wi) => (
                    <motion.div
                      key={ws.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: wi * 0.05 }}
                      className="card overflow-hidden border-2 border-slate-200"
                    >
                      <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
                        <Zap className="h-4 w-4 text-earth-600" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900">{ws.name}</p>
                          <p className="text-xs text-slate-500">
                            {ws.dataset_count} model{ws.dataset_count !== 1 ? 's' : ''} ·{' '}
                            {ws.report_count} report{ws.report_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">{ws.type}</span>
                      </div>
                      {ws.datasets.length > 0 ? (
                        <div className="p-4 space-y-3">
                          {ws.datasets.map(ds => <DatasetSection key={ds.id} ds={ds} />)}
                        </div>
                      ) : (
                        <p className="p-4 text-xs text-slate-400 italic">No semantic models in this workspace.</p>
                      )}
                    </motion.div>
                  ))}
                  {wsPage < workspaces.length && (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setWsPage(p => p + 5)}
                      className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      Show more workspaces ({workspaces.length - wsPage} remaining)
                    </motion.button>
                  )}
                </motion.div>
              )}

              {activeTab === 'reports' && (
                <motion.div
                  key="reports"
                  initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
                  transition={{ type: 'spring', duration: 0.38, bounce: 0 }}
                >
                  <ReportsSegment workspaces={workspaces} />
                </motion.div>
              )}

              {activeTab === 'complexity' && (
                <motion.div
                  key="complexity"
                  initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
                  transition={{ type: 'spring', duration: 0.38, bounce: 0 }}
                >
                  <ComplexityTab workspaces={workspaces} />
                </motion.div>
              )}

              {activeTab === 'lineage' && (
                <motion.div
                  key="lineage"
                  initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
                  transition={{ type: 'spring', duration: 0.38, bounce: 0 }}
                >
                  <LineageTab workspaces={workspaces} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}

export default function FabricSessionDetailPage() {
  return (
    <PageErrorBoundary>
      <FabricSessionDetailPageInner />
    </PageErrorBoundary>
  )
}
