import { useState, useEffect, useCallback } from 'react'
import {
  X, TrendingUp, BarChart2, Table2, Filter,
  Activity, PieChart, LayoutGrid, CreditCard, Eye,
  ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react'
import type { VisualField } from '../../types/api'
import type { MockVisual, AssessmentStatus } from '../../data/mockReports'

export interface VisualChecklist {
  hasTitle: boolean
  hasFilters: boolean
  meetsRefreshSLA: boolean
  isAccessible: boolean
}

interface VisualDetailModalProps {
  visual: MockVisual | null
  assessmentStatus: AssessmentStatus
  onClose: () => void
  onSave: (status: AssessmentStatus, checklist: VisualChecklist, notes: string) => void
}

// ── Type icons ────────────────────────────────────────────────────────────────

const VISUAL_ICONS: Record<string, React.ReactNode> = {
  'KPI Card':    <TrendingUp size={20} style={{ color: '#0078D4' }} />,
  'Bar Chart':   <BarChart2 size={20} style={{ color: '#0078D4' }} />,
  'Table':       <Table2 size={20} style={{ color: '#0078D4' }} />,
  'Slicer':      <Filter size={20} style={{ color: '#0078D4' }} />,
  'Line Chart':  <Activity size={20} style={{ color: '#0078D4' }} />,
  'Donut Chart': <PieChart size={20} style={{ color: '#0078D4' }} />,
  'Matrix':      <LayoutGrid size={20} style={{ color: '#0078D4' }} />,
  'Card':        <CreditCard size={20} style={{ color: '#0078D4' }} />,
}

// ── Field type badge ──────────────────────────────────────────────────────────

const FIELD_TYPE_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  measure:     { bg: '#F3EFFF', color: '#8764B8', border: '#C8B8E8', label: 'Measure' },
  column:      { bg: '#EFF6FF', color: '#0078D4', border: '#B3D4F5', label: 'Column' },
  aggregation: { bg: '#E6F8F0', color: '#107C10', border: '#9FDCB7', label: 'Aggregation' },
  hierarchy:   { bg: '#FFF4E5', color: '#FF8C00', border: '#FFD199', label: 'Hierarchy' },
}

function FieldTypeBadge({ type }: { type: string }) {
  const s = FIELD_TYPE_STYLE[type] ?? { bg: '#F3F2F1', color: '#605E5C', border: '#E1DFDD', label: type }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border flex-shrink-0"
      style={{ background: s.bg, color: s.color, borderColor: s.border, fontSize: '10px' }}
    >
      {s.label}
    </span>
  )
}

// ── Complexity badge ──────────────────────────────────────────────────────────

const COMPLEXITY_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'None':         { bg: '#F3F2F1', color: '#8A8886', border: '#E1DFDD' },
  'Simple':       { bg: '#E6F8F0', color: '#107C10', border: '#9FDCB7' },
  'Moderate':     { bg: '#FFF4E5', color: '#FF8C00', border: '#FFD199' },
  'Complex':      { bg: '#FDE7E9', color: '#D13438', border: '#F1B9BB' },
  'Very Complex': { bg: '#FDE7E9', color: '#A4262C', border: '#F1B9BB' },
}

function ComplexityBadge({ level, score }: { level: string; score: number }) {
  if (level === 'None') return null
  const s = COMPLEXITY_STYLE[level] ?? COMPLEXITY_STYLE['None']
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border flex-shrink-0"
      style={{ background: s.bg, color: s.color, borderColor: s.border, fontSize: '10px' }}
    >
      {level}
      {score > 0 && <span style={{ opacity: 0.7 }}>({score})</span>}
    </span>
  )
}

// ── Single field row ──────────────────────────────────────────────────────────

function FieldRow({ field }: { field: VisualField }) {
  const [open, setOpen] = useState(false)
  const hasDeps = field.field_type === 'measure' && field.dependencies && field.dependencies.length > 0
  const hasExpr = !!field.expression

  return (
    <div className="border-b last:border-0" style={{ borderColor: '#F3F2F1' }}>
      {/* Main row */}
      <div
        className={`flex items-center gap-2 px-3 py-2 ${hasDeps || hasExpr ? 'cursor-pointer hover:bg-slate-50' : ''}`}
        onClick={() => (hasDeps || hasExpr) && setOpen(o => !o)}
      >
        <FieldTypeBadge type={field.field_type} />

        {/* Name */}
        <span
          className="flex-1 text-xs font-mono truncate min-w-0"
          style={{ color: '#252423' }}
          title={field.name}
        >
          {field.name}
        </span>

        {/* Table */}
        <span
          className="text-xs flex-shrink-0 font-mono"
          style={{ color: '#8A8886' }}
          title={`From table: ${field.table}`}
        >
          {field.table}
        </span>

        {/* Aggregation function */}
        {field.field_type === 'aggregation' && field.agg_function && (
          <span className="text-xs flex-shrink-0 font-medium" style={{ color: '#107C10' }}>
            {field.agg_function}
          </span>
        )}

        {/* Complexity */}
        {field.complexity && field.complexity.level !== 'None' && (
          <ComplexityBadge level={field.complexity.level} score={field.complexity.score} />
        )}

        {/* Expand chevron */}
        {(hasDeps || hasExpr) && (
          open
            ? <ChevronUp size={12} style={{ color: '#8A8886', flexShrink: 0 }} />
            : <ChevronDown size={12} style={{ color: '#8A8886', flexShrink: 0 }} />
        )}
      </div>

      {/* Expanded: expression + dependencies */}
      {open && (hasExpr || hasDeps) && (
        <div className="px-3 pb-3 space-y-2" style={{ background: '#FAFAFA' }}>
          {hasExpr && (
            <pre
              className="text-xs font-mono rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-28 border"
              style={{ background: '#F3F2F1', color: '#605E5C', borderColor: '#E1DFDD' }}
            >
              {field.expression}
            </pre>
          )}
          {hasDeps && field.dependencies && (
            <div className="flex flex-wrap gap-1.5">
              {field.dependencies.map((dep, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono"
                  style={{ background: '#fff', borderColor: '#E1DFDD', color: '#252423' }}
                >
                  <span style={{ color: '#8A8886' }}>{dep.table}</span>
                  <ArrowRight size={9} style={{ color: '#C8C6C4' }} />
                  <span style={{ fontWeight: 600 }}>{dep.column}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Fields panel ──────────────────────────────────────────────────────────────

function FieldsPanel({ fields }: { fields: VisualField[] }) {
  const measures   = fields.filter(f => f.field_type === 'measure')
  const columns    = fields.filter(f => f.field_type === 'column' || f.field_type === 'aggregation')
  const other      = fields.filter(f => f.field_type !== 'measure' && f.field_type !== 'column' && f.field_type !== 'aggregation')

  if (fields.length === 0) {
    return (
      <p className="text-xs italic py-4 text-center" style={{ color: '#8A8886' }}>
        No field bindings detected for this visual.
      </p>
    )
  }

  const Section = ({ title, items }: { title: string; items: VisualField[] }) =>
    items.length === 0 ? null : (
      <div>
        <p
          className="text-xs font-semibold uppercase tracking-wide px-3 py-1.5 border-b"
          style={{ color: '#605E5C', background: '#F3F2F1', borderColor: '#E1DFDD' }}
        >
          {title} ({items.length})
        </p>
        <div>
          {items.map((f, i) => <FieldRow key={i} field={f} />)}
        </div>
      </div>
    )

  return (
    <div className="rounded border overflow-hidden" style={{ borderColor: '#E1DFDD' }}>
      <Section title="Measures" items={measures} />
      <Section title="Columns & Aggregations" items={columns} />
      <Section title="Other" items={other} />
    </div>
  )
}

// ── Mock visual previews (left panel) ────────────────────────────────────────

function KpiPreview({ visual }: { visual: MockVisual }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div className="text-5xl font-bold" style={{ color: '#252423' }}>
        {visual.mockValue ?? '—'}
      </div>
      {visual.mockSubtitle && (
        <div className="flex items-center gap-1 text-sm" style={{ color: '#107C10' }}>
          <TrendingUp size={14} />
          {visual.mockSubtitle}
        </div>
      )}
      <div className="text-xs mt-1" style={{ color: '#8A8886' }}>{visual.title}</div>
    </div>
  )
}

function BarPreview() {
  const bars = [
    { label: 'Jan', pct: 70 }, { label: 'Feb', pct: 85 }, { label: 'Mar', pct: 55 },
    { label: 'Apr', pct: 90 }, { label: 'May', pct: 65 }, { label: 'Jun', pct: 78 },
  ]
  return (
    <div className="flex items-end gap-3 h-36 px-4">
      {bars.map(b => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t" style={{ height: `${b.pct}%`, background: '#0078D4', minHeight: 4 }} />
          <span className="text-xs" style={{ color: '#605E5C' }}>{b.label}</span>
        </div>
      ))}
    </div>
  )
}

function LinePreview() {
  const pts = [30, 55, 40, 70, 60, 85, 75, 90]
  const w = 280; const h = 120
  const xStep = w / (pts.length - 1)
  const yScale = (v: number) => h - (v / 100) * h
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * xStep} ${yScale(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 140 }}>
      <path d={d} fill="none" stroke="#0078D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((v, i) => <circle key={i} cx={i * xStep} cy={yScale(v)} r="3.5" fill="#0078D4" />)}
    </svg>
  )
}

function TablePreview({ fields }: { fields?: VisualField[] }) {
  const cols = fields && fields.length > 0
    ? fields.slice(0, 3).map(f => f.name)
    : ['Account', 'Revenue', 'OTIF']
  const rows = [
    ['Account A', '£1.2M', '94%'], ['Account B', '£980K', '87%'],
    ['Account C', '£750K', '91%'],
  ]
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr style={{ background: '#F3F2F1' }}>
          {cols.map(h => (
            <th key={h} className="text-left px-3 py-2 text-xs font-semibold border-b" style={{ color: '#605E5C', borderColor: '#E1DFDD' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
            {cols.map((_, j) => (
              <td key={j} className="px-3 py-2 text-xs border-b" style={{ color: '#252423', borderColor: '#E1DFDD' }}>{row[j] ?? '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SlicerPreview() {
  const chips = ['All Accounts', 'Tier 1', 'Tier 2', 'Tier 3', 'Key Accounts']
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {chips.map((c, i) => (
        <span key={c} className="px-3 py-1 rounded-full text-xs border font-medium"
          style={{ background: i === 0 ? '#0078D4' : '#fff', color: i === 0 ? '#fff' : '#252423', borderColor: i === 0 ? '#0078D4' : '#E1DFDD' }}>
          {c}
        </span>
      ))}
    </div>
  )
}

function GenericPreview({ visual }: { visual: MockVisual }) {
  const icon = VISUAL_ICONS[visual.type] ?? <Eye size={40} style={{ color: '#8A8886' }} />
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div style={{ transform: 'scale(2)' }}>{icon}</div>
      <p className="text-sm mt-4" style={{ color: '#605E5C' }}>{visual.type}</p>
      {visual.mockValue && <p className="text-2xl font-bold" style={{ color: '#252423' }}>{visual.mockValue}</p>}
    </div>
  )
}

function VisualPreview({ visual }: { visual: MockVisual }) {
  switch (visual.type) {
    case 'KPI Card': case 'Card': return <KpiPreview visual={visual} />
    case 'Bar Chart':             return <BarPreview />
    case 'Line Chart':            return <LinePreview />
    case 'Table': case 'Matrix':  return <TablePreview fields={visual.fields} />
    case 'Slicer':                return <SlicerPreview />
    default:                      return <GenericPreview visual={visual} />
  }
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function VisualDetailModal({
  visual,
  assessmentStatus: _assessmentStatus,
  onClose,
  onSave,
}: VisualDetailModalProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visual) requestAnimationFrame(() => setVisible(true))
    else setVisible(false)
  }, [visual])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  if (!visual) return null

  const measureCount   = visual.fields?.filter(f => f.field_type === 'measure').length ?? 0
  const columnCount    = visual.fields?.filter(f => f.field_type === 'column' || f.field_type === 'aggregation').length ?? 0
  const complexFields  = visual.fields?.filter(f => f.complexity && f.complexity.level !== 'None') ?? []

  const handleSaveAndClose = () => {
    onSave('not-assessed', { hasTitle: false, hasFilters: false, meetsRefreshSLA: false, isAccessible: false }, '')
    handleClose()
  }

  const iconEl = VISUAL_ICONS[visual.type]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)', transition: 'background 200ms ease' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      role="dialog"
      aria-modal
      aria-label={`Visual details: ${visual.title}`}
    >
      <div
        className="bg-white rounded-xl shadow-2xl flex overflow-hidden"
        style={{
          maxWidth: 960,
          width: '100%',
          maxHeight: '92vh',
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'transform 200ms cubic-bezier(0.34,1.56,0.64,1), opacity 200ms ease',
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left: Visual preview (55%) ──────────────────────────────────── */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: '55%', background: '#F3F2F1', borderRight: '1px solid #E1DFDD' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
            style={{ background: '#fff', borderColor: '#E1DFDD' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 flex items-center justify-center rounded flex-shrink-0" style={{ background: '#EFF6FF' }}>
                {iconEl
                  ? (() => { const el = iconEl as React.ReactElement; return { ...el, props: { ...el.props, size: 16 } } })()
                  : <Eye size={16} style={{ color: '#0078D4' }} />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#252423' }}>{visual.title}</p>
                <p className="text-xs" style={{ color: '#8A8886' }}>{visual.type}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="Close"
            >
              <X size={16} style={{ color: '#605E5C' }} />
            </button>
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-auto flex flex-col items-stretch p-4">
            <div
              className="flex-1 bg-white rounded-lg shadow-sm border flex items-center justify-center p-5 min-h-44"
              style={{ borderColor: '#E1DFDD' }}
            >
              <VisualPreview visual={visual} />
            </div>

            {/* Stats strip */}
            <div className="flex items-center gap-4 mt-3 px-1">
              <span className="text-xs" style={{ color: '#8A8886' }}>
                {(visual.fields?.length ?? 0)} field{(visual.fields?.length ?? 0) !== 1 ? 's' : ''}
              </span>
              {measureCount > 0 && <span className="text-xs" style={{ color: '#8764B8' }}>{measureCount} measure{measureCount !== 1 ? 's' : ''}</span>}
              {columnCount > 0 && <span className="text-xs" style={{ color: '#0078D4' }}>{columnCount} column{columnCount !== 1 ? 's' : ''}</span>}
              {complexFields.length > 0 && (
                <span className="text-xs" style={{ color: '#D13438' }}>{complexFields.length} complex</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Field detail panel (45%) ─────────────────────────────── */}
        <div className="flex flex-col overflow-hidden" style={{ width: '45%' }}>
          {/* Panel header */}
          <div
            className="px-5 py-3 border-b flex-shrink-0"
            style={{ background: '#fff', borderColor: '#E1DFDD' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#252423' }}>Field Bindings</p>
            <p className="text-xs mt-0.5" style={{ color: '#8A8886' }}>
              Columns and measures used by this visual
            </p>
          </div>

          {/* Column headers */}
          {visual.fields && visual.fields.length > 0 && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 border-b text-xs font-semibold flex-shrink-0"
              style={{ borderColor: '#E1DFDD', background: '#F3F2F1', color: '#605E5C' }}
            >
              <span style={{ width: 72, flexShrink: 0 }}>Type</span>
              <span className="flex-1">Field Name</span>
              <span style={{ width: 90, textAlign: 'right', flexShrink: 0 }}>Table</span>
              <span style={{ width: 80, textAlign: 'right', flexShrink: 0 }}>Complexity</span>
            </div>
          )}

          {/* Scrollable field list */}
          <div className="flex-1 overflow-y-auto">
            {visual.fields && visual.fields.length > 0 ? (
              <FieldsPanel fields={visual.fields} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
                <Eye size={32} style={{ color: '#C8C6C4' }} />
                <p className="text-sm font-medium" style={{ color: '#605E5C' }}>No field data available</p>
                <p className="text-xs" style={{ color: '#8A8886' }}>
                  Field bindings are extracted only when the report layout is fully parsed.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-5 py-3 border-t flex items-center justify-between flex-shrink-0"
            style={{ borderColor: '#E1DFDD', background: '#FAFAFA' }}
          >
            <span className="text-xs" style={{ color: '#8A8886' }}>
              Visual ID: <span className="font-mono">{visual.id}</span>
            </span>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="py-1.5 px-4 rounded text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              style={{ background: '#0078D4' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
