import { useState, useEffect, useCallback, useRef } from 'react'
import { X, TrendingUp, ChevronDown, ChevronUp, ArrowRight, Eye, Download } from 'lucide-react'
import type { VisualField } from '../../types/api'
import type { MockVisual, AssessmentStatus } from '../../data/mockReports'
import { getVisualIcon, normalizeVisualType } from './VisualCard'

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

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"

// ── Field type badge ──────────────────────────────────────────────────────────

const FIELD_TYPE_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  measure:     { bg: '#EBF5EE', color: '#6D28D9', border: '#DDD6FE', label: 'Measure' },
  column:      { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB', label: 'Column' },
  aggregation: { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', label: 'Aggregation' },
  hierarchy:   { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', label: 'Hierarchy' },
}

function FieldTypeBadge({ type }: { type: string }) {
  const s = FIELD_TYPE_STYLE[type] ?? { bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB', label: type }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full border font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color, borderColor: s.border, fontSize: '10px', lineHeight: '16px' }}
    >
      {s.label}
    </span>
  )
}

// ── Complexity badge ──────────────────────────────────────────────────────────

const COMPLEXITY_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'None':         { bg: '#F3F4F6', color: '#9CA3AF', border: '#E5E7EB' },
  'Simple':       { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' },
  'Moderate':     { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
  'Complex':      { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
  'Very Complex': { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
}

function ComplexityBadge({ level, score }: { level: string; score: number }) {
  if (level === 'None') return <span className="text-xs" style={{ color: '#D1D5DB' }}>—</span>
  const s = COMPLEXITY_STYLE[level] ?? COMPLEXITY_STYLE['None']
  return (
    <span
      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color, borderColor: s.border, fontSize: '10px', lineHeight: '16px' }}
    >
      {level}
      {score > 0 && <span style={{ opacity: 0.65 }}>({score})</span>}
    </span>
  )
}

// ── Single expandable field row ───────────────────────────────────────────────

function FieldRow({ field, isSelected }: { field: VisualField; isSelected?: boolean }) {
  const [open, setOpen] = useState(false)
  const canExpand = !!(field.expression || (field.dependencies && field.dependencies.length > 0))

  return (
    <>
      <tr
        className={canExpand ? 'cursor-pointer' : ''}
        onClick={() => canExpand && setOpen(o => !o)}
        style={{
          borderBottom: '1px solid #F3F4F6',
          background: isSelected ? '#F0F7F2' : undefined,
          outline: isSelected ? '1px solid #93C5FD' : undefined,
          borderRadius: isSelected ? 4 : undefined,
          transition: 'background 120ms',
        }}
        onMouseEnter={e => {
          if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = canExpand ? '#F0F7F2' : '#F9FAFB'
        }}
        onMouseLeave={e => {
          if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = ''
        }}
      >
        {/* Type */}
        <td className="px-3 py-2 align-middle" style={{ width: 100, whiteSpace: 'nowrap' }}>
          <FieldTypeBadge type={field.field_type} />
        </td>

        {/* Field name */}
        <td className="px-2 py-2 align-middle" style={{ maxWidth: 0 }}>
          <span className="text-xs font-mono block truncate" style={{ color: '#111827' }} title={field.name}>
            {field.name}
          </span>
          {field.field_type === 'aggregation' && field.agg_function && (
            <span className="text-xs font-medium block mt-0.5" style={{ color: '#B45309' }}>
              {field.agg_function}
            </span>
          )}
        </td>

        {/* Table */}
        <td className="px-2 py-2 align-middle" style={{ width: 140, maxWidth: 140 }}>
          <span className="text-xs font-mono block truncate" style={{ color: '#6B7280' }} title={field.table}>
            {field.table}
          </span>
        </td>

        {/* Complexity */}
        <td className="px-2 py-2 align-middle" style={{ width: 110, whiteSpace: 'nowrap' }}>
          {field.complexity
            ? <ComplexityBadge level={field.complexity.level} score={field.complexity.score} />
            : <span className="text-xs" style={{ color: '#D1D5DB' }}>—</span>
          }
        </td>

        {/* Expand toggle */}
        <td className="pr-3 py-2 align-middle" style={{ width: 20 }}>
          {canExpand && (
            open
              ? <ChevronUp size={12} style={{ color: '#9CA3AF' }} />
              : <ChevronDown size={12} style={{ color: '#9CA3AF' }} />
          )}
        </td>
      </tr>

      {/* Expanded content */}
      {open && canExpand && (
        <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}>
          <td colSpan={5} className="px-4 pb-3 pt-1">
            {field.expression && (
              <pre
                className="text-xs font-mono rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap border mb-2"
                style={{ background: '#F3F4F6', color: '#374151', borderColor: '#E5E7EB', maxHeight: 100 }}
              >
                {field.expression}
              </pre>
            )}
            {field.dependencies && field.dependencies.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {field.dependencies.map((dep, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono"
                    style={{ background: '#fff', borderColor: '#E5E7EB', color: '#111827' }}
                  >
                    <span style={{ color: '#9CA3AF' }}>{dep.table}</span>
                    <ArrowRight size={9} style={{ color: '#D1D5DB' }} />
                    <span style={{ fontWeight: 600 }}>{dep.column}</span>
                  </span>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Fields table ──────────────────────────────────────────────────────────────

function FieldsTable({ fields }: { fields: VisualField[] }) {
  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
        <Eye size={28} style={{ color: '#D1D5DB' }} />
        <p className="text-sm font-medium" style={{ color: '#6B7280' }}>No field bindings detected</p>
        <p className="text-xs" style={{ color: '#9CA3AF' }}>
          Field-level data is extracted only when the full report layout is parsed.
        </p>
      </div>
    )
  }

  const measures = fields.filter(f => f.field_type === 'measure')
  const colAgg   = fields.filter(f => f.field_type === 'column' || f.field_type === 'aggregation')
  const other    = fields.filter(f => !['measure', 'column', 'aggregation'].includes(f.field_type))

  const SectionDivider = ({ label, count }: { label: string; count: number }) => (
    <tr>
      <td
        colSpan={5}
        className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
        style={{ background: '#F3F4F6', color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}
      >
        {label} <span style={{ fontWeight: 400, color: '#9CA3AF' }}>({count})</span>
      </td>
    </tr>
  )

  return (
    <table className="w-full border-collapse" style={{ fontSize: 12, fontFamily: FONT }}>
      <thead className="sticky top-0 z-10">
        <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          <th className="px-3 py-2 text-left font-semibold" style={{ color: '#6B7280', width: 100, fontSize: 11 }}>Type</th>
          <th className="px-2 py-2 text-left font-semibold" style={{ color: '#6B7280', fontSize: 11 }}>Field Name</th>
          <th className="px-2 py-2 text-left font-semibold" style={{ color: '#6B7280', width: 140, fontSize: 11 }}>Table</th>
          <th className="px-2 py-2 text-left font-semibold" style={{ color: '#6B7280', width: 110, fontSize: 11 }}>Complexity</th>
          <th style={{ width: 28 }} />
        </tr>
      </thead>
      <tbody>
        {measures.length > 0 && (
          <>
            <SectionDivider label="Measures" count={measures.length} />
            {measures.map((f, i) => <FieldRow key={`m-${i}`} field={f} />)}
          </>
        )}
        {colAgg.length > 0 && (
          <>
            <SectionDivider label="Columns & Aggregations" count={colAgg.length} />
            {colAgg.map((f, i) => <FieldRow key={`c-${i}`} field={f} />)}
          </>
        )}
        {other.length > 0 && (
          <>
            <SectionDivider label="Other" count={other.length} />
            {other.map((f, i) => <FieldRow key={`o-${i}`} field={f} />)}
          </>
        )}
      </tbody>
    </table>
  )
}

// ── Left panel visual previews ────────────────────────────────────────────────

function KpiPreview({ visual }: { visual: MockVisual }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="text-4xl font-bold" style={{ color: '#111827' }}>
        {visual.mockValue ?? (visual.fields && visual.fields.length > 0 ? `${visual.fields.length} fields` : '—')}
      </div>
      <div className="flex items-center gap-1 text-sm" style={{ color: '#047857' }}>
        <TrendingUp size={14} />
        <span>{visual.mockSubtitle ?? 'Value'}</span>
      </div>
    </div>
  )
}

function BarPreview() {
  const bars = [
    { label: 'Jan', pct: 70 }, { label: 'Feb', pct: 85 }, { label: 'Mar', pct: 55 },
    { label: 'Apr', pct: 90 }, { label: 'May', pct: 65 }, { label: 'Jun', pct: 78 },
  ]
  return (
    <div className="flex items-end gap-2 w-full px-4" style={{ height: 120 }}>
      {bars.map(b => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t" style={{ height: `${b.pct}%`, background: '#4338CA' }} />
          <span className="text-xs" style={{ color: '#6B7280' }}>{b.label}</span>
        </div>
      ))}
    </div>
  )
}

function LinePreview() {
  const pts = [30, 55, 40, 70, 60, 85, 75, 90]
  const w = 260, h = 110
  const xStep = w / (pts.length - 1)
  const yScale = (v: number) => h - (v / 100) * h
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * xStep} ${yScale(v)}`).join(' ')
  const area = `M 0 ${h} ${pts.map((v, i) => `L ${i * xStep} ${yScale(v)}`).join(' ')} L ${w} ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 130 }}>
      <path d={area} fill="#ECFEFF" fillOpacity={0.6} />
      <path d={d} fill="none" stroke="#0E7490" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((v, i) => <circle key={i} cx={i * xStep} cy={yScale(v)} r="3" fill="#0E7490" />)}
    </svg>
  )
}

function TablePreview({ fields }: { fields?: VisualField[] }) {
  const cols = fields && fields.length > 0
    ? fields.slice(0, 3).map(f => f.name)
    : ['Column A', 'Column B', 'Column C']
  const mockRows = [['Value 1', '1,234', '94%'], ['Value 2', '980', '87%'], ['Value 3', '750', '91%']]
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr style={{ background: '#F3F4F6' }}>
          {cols.map(h => (
            <th key={h} className="px-2 py-1.5 text-left font-semibold border-b truncate max-w-24"
              style={{ color: '#6B7280', borderColor: '#E5E7EB' }} title={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {mockRows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
            {cols.map((_, j) => (
              <td key={j} className="px-2 py-1.5 border-b" style={{ color: '#111827', borderColor: '#F3F4F6' }}>
                {row[j] ?? '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SlicerPreview({ fields }: { fields?: VisualField[] }) {
  const chips = fields && fields.length > 0
    ? ['(All)', ...fields.slice(0, 4).map(f => f.name)]
    : ['(All)', 'Option A', 'Option B', 'Option C', 'Option D']
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {chips.map((c, i) => (
        <span key={c} className="px-3 py-1 rounded-full text-xs border font-medium"
          style={{
            background: i === 0 ? '#1D4ED8' : '#fff',
            color: i === 0 ? '#fff' : '#111827',
            borderColor: i === 0 ? '#1D4ED8' : '#E5E7EB',
          }}>
          {c.length > 18 ? c.slice(0, 17) + '…' : c}
        </span>
      ))}
    </div>
  )
}

function TextboxPreview({ visual }: { visual: MockVisual }) {
  const text = visual.text_content || visual.mockValue || ''
  if (!text) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <span style={{ fontSize: 32, color: '#D1D5DB' }}>T</span>
        <p className="text-xs" style={{ color: '#9CA3AF' }}>No text content extracted</p>
      </div>
    )
  }
  return (
    <div className="flex items-start justify-start p-4 overflow-auto h-full rounded-lg"
      style={{ background: '#F9FAFB' }}>
      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#111827' }}>{text}</p>
    </div>
  )
}

function ShapePreview({ visual }: { visual: MockVisual }) {
  const text = visual.text_content || ''
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
      <div style={{
        width: 120, height: 60,
        background: '#F3F4F6',
        border: '1.5px solid #D1D5DB',
        borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {text
          ? <span className="text-xs font-medium text-center px-2" style={{ color: '#111827' }}>{text}</span>
          : <span className="text-xs" style={{ color: '#9CA3AF' }}>Shape</span>
        }
      </div>
    </div>
  )
}

function GenericPreview({ visual }: { visual: MockVisual }) {
  const icon = getVisualIcon(visual.type, 40)
  const displayType = normalizeVisualType(visual.type)
  const fieldCount = visual.fields?.length ?? 0
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div style={{ transform: 'scale(1.4)', transformOrigin: 'center' }}>{icon}</div>
      <p className="text-sm font-semibold mt-3" style={{ color: '#111827' }}>{displayType}</p>
      {fieldCount > 0 && (
        <p className="text-base font-bold" style={{ color: '#6B7280' }}>
          {fieldCount} field{fieldCount !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

function VisualPreview({ visual }: { visual: MockVisual }) {
  const t = visual.type.toLowerCase()
  if (['card', 'kpivisual', 'kpi', 'kpi card'].includes(t)) return <KpiPreview visual={visual} />
  if (['barchart', 'columnchart', 'clusteredcolumnchart', 'stackedcolumnchart',
       'clusteredbarchart', 'stackedbarchart', 'bar chart', 'column chart'].includes(t))
    return <BarPreview />
  if (['linechart', 'areachart', 'stackedareachart', 'line chart'].includes(t)) return <LinePreview />
  if (['tableex', 'table', 'matrix', 'pivottable'].includes(t)) return <TablePreview fields={visual.fields} />
  if (t === 'slicer') return <SlicerPreview fields={visual.fields} />
  if (t === 'textbox') return <TextboxPreview visual={visual} />
  if (['shape', 'basicshape'].includes(t)) return <ShapePreview visual={visual} />
  return <GenericPreview visual={visual} />
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function VisualDetailModal({
  visual, onClose, onSave,
}: VisualDetailModalProps) {
  const [visible, setVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (visual) requestAnimationFrame(() => setVisible(true))
    else setVisible(false)
  }, [visual])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 220)
  }, [onClose])

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  // Focus trap
  useEffect(() => {
    if (!visible || !modalRef.current) return
    const el = modalRef.current
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', trap)
    first?.focus()
    return () => document.removeEventListener('keydown', trap)
  }, [visible])

  if (!visual) return null

  const displayType  = normalizeVisualType(visual.type)
  const iconEl       = getVisualIcon(visual.type, 16)
  const fields       = visual.fields ?? []
  const measureCount = fields.filter(f => f.field_type === 'measure').length
  const columnCount  = fields.filter(f => f.field_type === 'column' || f.field_type === 'aggregation').length
  const complexCount = fields.filter(f => f.complexity && f.complexity.level !== 'None').length

  const displayTitle = visual.title && visual.title.toLowerCase() !== visual.type.toLowerCase()
    ? visual.title
    : displayType

  const handleDismiss = () => {
    onSave('not-assessed', { hasTitle: false, hasFilters: false, meetsRefreshSLA: false, isAccessible: false }, '')
    handleClose()
  }

  // ── Mobile: full-screen bottom sheet ──────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col justify-end"
        style={{
          background: visible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
          backdropFilter: visible ? 'blur(2px)' : 'none',
          transition: 'background 220ms ease, backdrop-filter 220ms ease',
        }}
        onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        role="dialog"
        aria-modal
        aria-label={`Visual details: ${displayTitle}`}
      >
        <div
          ref={modalRef}
          className="bg-white flex flex-col overflow-hidden"
          style={{
            maxHeight: '92vh',
            borderRadius: '16px 16px 0 0',
            transform: visible ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 280ms cubic-bezier(0.4,0,0.2,1)',
            fontFamily: FONT,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E5E7EB' }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3 border-b flex-shrink-0"
            style={{ borderColor: '#E5E7EB' }}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ background: '#F0F7F2' }}>{iconEl}</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#111827' }}>{displayTitle}</p>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>{displayType}</p>
              </div>
            </div>
            <button type="button" onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0"
              aria-label="Close">
              <X size={16} style={{ color: '#6B7280' }} />
            </button>
          </div>

          {/* Preview */}
          <div className="px-4 py-4 border-b flex-shrink-0" style={{ borderColor: '#F3F4F6' }}>
            <div className="bg-white rounded-xl border flex items-center justify-center p-4"
              style={{ borderColor: '#E5E7EB', minHeight: 140 }}>
              <VisualPreview visual={visual} />
            </div>
          </div>

          {/* Fields */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-2 border-b flex items-center justify-between flex-shrink-0"
              style={{ borderColor: '#F3F4F6', background: '#F9FAFB' }}>
              <p className="text-xs font-semibold" style={{ color: '#374151' }}>Field Bindings</p>
              {fields.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full border font-semibold"
                  style={{ color: '#6B7280', borderColor: '#E5E7EB', background: '#fff' }}>
                  {fields.length} total
                </span>
              )}
            </div>
            <FieldsTable fields={fields} />
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t flex items-center justify-between flex-shrink-0"
            style={{ borderColor: '#E5E7EB', background: '#F9FAFB' }}>
            <span className="text-xs font-mono truncate" style={{ color: '#9CA3AF', maxWidth: '60%' }}>
              {visual.id}
            </span>
            <button type="button" onClick={handleDismiss}
              className="py-1.5 px-5 rounded-lg text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              style={{ background: '#1D4ED8' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Desktop / tablet: centered overlay modal ───────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: visible ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0)',
        backdropFilter: visible ? 'blur(4px)' : 'none',
        transition: 'background 220ms ease, backdrop-filter 220ms ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      role="dialog"
      aria-modal
      aria-label={`Visual details: ${displayTitle}`}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl flex overflow-hidden"
        style={{
          maxWidth: 1000,
          width: '100%',
          maxHeight: '90vh',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(8px)',
          opacity: visible ? 1 : 0,
          transition: 'transform 220ms cubic-bezier(0.34,1.4,0.64,1), opacity 220ms ease',
          fontFamily: FONT,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left: Visual preview ──────────────────────────────────────────── */}
        <div className="flex flex-col overflow-hidden"
          style={{ width: '42%', maxWidth: 340, background: '#F9FAFB', borderRight: '1px solid #E5E7EB' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b flex-shrink-0"
            style={{ background: '#fff', borderColor: '#E5E7EB' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ background: '#F0F7F2' }}>
                {iconEl}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate leading-tight" style={{ color: '#111827' }}>
                  {displayTitle}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{displayType}</p>
              </div>
            </div>
            <button type="button" onClick={handleClose}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
              aria-label="Close">
              <X size={16} style={{ color: '#6B7280' }} />
            </button>
          </div>

          {/* Preview canvas */}
          <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
            <div className="bg-white rounded-xl shadow-sm border flex items-center justify-center p-5"
              style={{ borderColor: '#E5E7EB', minHeight: 180 }}>
              <VisualPreview visual={visual} />
            </div>

            {/* Stats chips */}
            <div className="flex items-center gap-2 flex-wrap px-0.5">
              <span className="text-xs px-2.5 py-1 rounded-full border font-medium"
                style={{ color: '#1D4ED8', borderColor: '#BFDBFE', background: '#F0F7F2' }}>
                {displayType}
              </span>
              {fields.length > 0 && (
                <span className="text-xs" style={{ color: '#6B7280' }}>
                  {fields.length} field{fields.length !== 1 ? 's' : ''}
                </span>
              )}
              {measureCount > 0 && (
                <span className="text-xs" style={{ color: '#6D28D9' }}>
                  {measureCount} measure{measureCount !== 1 ? 's' : ''}
                </span>
              )}
              {columnCount > 0 && (
                <span className="text-xs" style={{ color: '#0F766E' }}>
                  {columnCount} column{columnCount !== 1 ? 's' : ''}
                </span>
              )}
              {complexCount > 0 && (
                <span className="text-xs" style={{ color: '#B91C1C' }}>
                  {complexCount} complex
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Field bindings ─────────────────────────────────────────── */}
        <div className="flex flex-col overflow-hidden flex-1">

          {/* Panel header */}
          <div className="px-4 py-3.5 border-b flex-shrink-0 flex items-center justify-between"
            style={{ background: '#fff', borderColor: '#E5E7EB' }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#111827' }}>Field Bindings</p>
              <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>
                Click a measure row to expand its DAX expression
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {fields.length > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full border font-semibold"
                  style={{ color: '#6B7280', borderColor: '#E5E7EB', background: '#F9FAFB' }}>
                  {fields.length} total
                </span>
              )}
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
                style={{ borderColor: '#E5E7EB', color: '#374151' }}
                aria-label="Export to Excel"
              >
                <Download size={11} />
                Export
              </button>
            </div>
          </div>

          {/* Scrollable field table */}
          <div className="flex-1 overflow-y-auto">
            <FieldsTable fields={fields} />
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t flex items-center justify-between flex-shrink-0"
            style={{ borderColor: '#E5E7EB', background: '#F9FAFB' }}>
            <span className="text-xs font-mono truncate" style={{ color: '#9CA3AF', maxWidth: '65%' }}
              title={visual.id}>
              ID: {visual.id}
            </span>
            <button type="button" onClick={handleDismiss}
              className="py-1.5 px-5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0"
              style={{ background: '#1D4ED8' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
