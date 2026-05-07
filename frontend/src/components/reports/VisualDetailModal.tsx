import { useState, useEffect, useCallback } from 'react'
import {
  X, TrendingUp, BarChart2, Table2, Filter,
  Activity, PieChart, LayoutGrid, CreditCard, Eye,
  CheckSquare, Square,
} from 'lucide-react'
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

const STATUS_OPTIONS: { value: AssessmentStatus; label: string; color: string }[] = [
  { value: 'pass',           label: 'Pass',         color: '#107C10' },
  { value: 'fail',           label: 'Fail',         color: '#D13438' },
  { value: 'warning',        label: 'Warning',      color: '#FF8C00' },
  { value: 'not-assessed',   label: 'Not Assessed', color: '#8A8886' },
]

const VISUAL_ICONS: Record<string, React.ReactNode> = {
  'KPI Card':    <TrendingUp size={48} style={{ color: '#0078D4' }} />,
  'Bar Chart':   <BarChart2 size={48} style={{ color: '#0078D4' }} />,
  'Table':       <Table2 size={48} style={{ color: '#0078D4' }} />,
  'Slicer':      <Filter size={48} style={{ color: '#0078D4' }} />,
  'Line Chart':  <Activity size={48} style={{ color: '#0078D4' }} />,
  'Donut Chart': <PieChart size={48} style={{ color: '#0078D4' }} />,
  'Matrix':      <LayoutGrid size={48} style={{ color: '#0078D4' }} />,
  'Card':        <CreditCard size={48} style={{ color: '#0078D4' }} />,
}

// ── Mock visual previews ──────────────────────────────────────────────────────

function KpiPreview({ visual }: { visual: MockVisual }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div
        className="text-5xl font-bold"
        style={{ color: '#252423', fontFamily: "'Segoe UI', system-ui, sans-serif" }}
      >
        {visual.mockValue ?? '—'}
      </div>
      {visual.mockSubtitle && (
        <div className="flex items-center gap-1 text-sm" style={{ color: '#107C10' }}>
          <TrendingUp size={14} />
          {visual.mockSubtitle}
        </div>
      )}
      <div className="text-xs mt-1" style={{ color: '#8A8886' }}>
        {visual.title}
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
    <div className="flex items-end gap-3 h-36 px-4">
      {bars.map(b => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t transition-all"
            style={{ height: `${b.pct}%`, background: '#0078D4', minHeight: 4 }}
          />
          <span className="text-xs" style={{ color: '#605E5C' }}>{b.label}</span>
        </div>
      ))}
    </div>
  )
}

function LinePreview() {
  const pts = [30, 55, 40, 70, 60, 85, 75, 90]
  const w = 280
  const h = 120
  const xStep = w / (pts.length - 1)
  const yScale = (v: number) => h - (v / 100) * h
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * xStep} ${yScale(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 140 }}>
      <path d={d} fill="none" stroke="#0078D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((v, i) => (
        <circle key={i} cx={i * xStep} cy={yScale(v)} r="3.5" fill="#0078D4" />
      ))}
    </svg>
  )
}

function TablePreview() {
  const rows = [
    ['Account A', '£1.2M', '94%'], ['Account B', '£980K', '87%'],
    ['Account C', '£750K', '91%'], ['Account D', '£620K', '78%'],
  ]
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr style={{ background: '#F3F2F1' }}>
          {['Account', 'Revenue', 'OTIF'].map(h => (
            <th key={h} className="text-left px-3 py-2 text-xs font-semibold border-b" style={{ color: '#605E5C', borderColor: '#E1DFDD' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
            {row.map((cell, j) => (
              <td key={j} className="px-3 py-2 text-xs border-b" style={{ color: '#252423', borderColor: '#E1DFDD' }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SlicerPreview() {
  const chips = ['All Accounts', 'Tier 1', 'Tier 2', 'Tier 3', 'Key Accounts', 'Inactive']
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {chips.map((c, i) => (
        <span
          key={c}
          className="px-3 py-1 rounded-full text-xs border font-medium"
          style={{
            background: i === 0 ? '#0078D4' : '#fff',
            color: i === 0 ? '#fff' : '#252423',
            borderColor: i === 0 ? '#0078D4' : '#E1DFDD',
          }}
        >
          {c}
        </span>
      ))}
    </div>
  )
}

function DonutPreview() {
  const segments = [
    { pct: 42, color: '#0078D4' }, { pct: 28, color: '#107C10' },
    { pct: 18, color: '#FF8C00' }, { pct: 12, color: '#D13438' },
  ]
  const r = 60
  const cx = 90
  const cy = 80
  let cumAngle = -Math.PI / 2
  const arcs = segments.map(s => {
    const angle = (s.pct / 100) * 2 * Math.PI
    const x1 = cx + r * Math.cos(cumAngle)
    const y1 = cy + r * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + r * Math.cos(cumAngle)
    const y2 = cy + r * Math.sin(cumAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    return { path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`, color: s.color, pct: s.pct }
  })
  return (
    <svg viewBox="0 0 180 160" className="w-40 mx-auto">
      <circle cx={cx} cy={cy} r={r} fill="#F3F2F1" />
      {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} opacity="0.85" />)}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#fff" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#252423">Dist.</text>
    </svg>
  )
}

function GenericPreview({ visual }: { visual: MockVisual }) {
  const icon = VISUAL_ICONS[visual.type] ?? <Eye size={48} style={{ color: '#8A8886' }} />
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      {icon}
      <p className="text-sm font-medium" style={{ color: '#605E5C' }}>{visual.type}</p>
      {visual.mockValue && (
        <p className="text-2xl font-bold" style={{ color: '#252423' }}>{visual.mockValue}</p>
      )}
    </div>
  )
}

function VisualPreview({ visual }: { visual: MockVisual }) {
  switch (visual.type) {
    case 'KPI Card':
    case 'Card':
      return <KpiPreview visual={visual} />
    case 'Bar Chart':
      return <BarPreview />
    case 'Line Chart':
      return <LinePreview />
    case 'Table':
    case 'Matrix':
      return <TablePreview />
    case 'Slicer':
      return <SlicerPreview />
    case 'Donut Chart':
      return <DonutPreview />
    default:
      return <GenericPreview visual={visual} />
  }
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function VisualDetailModal({
  visual,
  assessmentStatus,
  onClose,
  onSave,
}: VisualDetailModalProps) {
  const [status, setStatus] = useState<AssessmentStatus>(assessmentStatus)
  const [checklist, setChecklist] = useState<VisualChecklist>({
    hasTitle: false,
    hasFilters: false,
    meetsRefreshSLA: false,
    isAccessible: false,
  })
  const [notes, setNotes] = useState('')
  const [visible, setVisible] = useState(false)

  // Sync status when assessmentStatus prop changes (new visual opened)
  useEffect(() => {
    setStatus(assessmentStatus)
  }, [assessmentStatus, visual?.id])

  // Animate in
  useEffect(() => {
    if (visual) {
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [visual])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  if (!visual) return null

  const toggleCheck = (key: keyof VisualChecklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = () => {
    onSave(status, checklist, notes)
    handleClose()
  }

  const checklistItems: { key: keyof VisualChecklist; label: string }[] = [
    { key: 'hasTitle',        label: 'Visual has a clear, descriptive title' },
    { key: 'hasFilters',      label: 'Filters are documented and correct' },
    { key: 'meetsRefreshSLA', label: 'Meets data refresh SLA requirements' },
    { key: 'isAccessible',    label: 'Meets accessibility standards (contrast, labels)' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)', transition: 'background 200ms ease' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      role="dialog"
      aria-modal
      aria-label={`Assess visual: ${visual.title}`}
    >
      <div
        className="bg-white rounded-xl shadow-2xl flex overflow-hidden"
        style={{
          maxWidth: 900,
          width: '100%',
          maxHeight: '90vh',
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'transform 200ms cubic-bezier(0.34,1.56,0.64,1), opacity 200ms ease',
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left: Visual preview (60%) ──────────────────────────────────── */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: '60%', background: '#F3F2F1', borderRight: '1px solid #E1DFDD' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
            style={{ background: '#fff', borderColor: '#E1DFDD' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-7 h-7 flex items-center justify-center rounded flex-shrink-0"
                style={{ background: '#EFF6FF' }}
              >
                {(VISUAL_ICONS[visual.type] as React.ReactElement)
                  ? (() => {
                      const el = VISUAL_ICONS[visual.type] as React.ReactElement
                      return { ...el, props: { ...el.props, size: 16 } }
                    })()
                  : <Eye size={16} style={{ color: '#0078D4' }} />}
              </div>
              <span className="text-sm font-semibold truncate" style={{ color: '#252423' }}>
                {visual.title}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="Close modal"
            >
              <X size={16} style={{ color: '#605E5C' }} />
            </button>
          </div>

          {/* Preview canvas */}
          <div className="flex-1 overflow-auto flex flex-col items-stretch p-5">
            <div
              className="flex-1 bg-white rounded-lg shadow-sm border flex items-center justify-center p-6 min-h-48"
              style={{ borderColor: '#E1DFDD' }}
            >
              <VisualPreview visual={visual} />
            </div>

            {/* Context tags */}
            <div className="flex items-center gap-2 mt-4">
              <span
                className="text-xs px-2 py-0.5 rounded-full border font-medium"
                style={{ color: '#0078D4', borderColor: '#0078D444', background: '#0078D414' }}
              >
                {visual.type}
              </span>
              <span className="text-xs" style={{ color: '#8A8886' }}>
                ID: {visual.id}
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: Assessment panel (40%) ───────────────────────────────── */}
        <div className="flex flex-col overflow-hidden" style={{ width: '40%' }}>
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            {/* Visual info */}
            <div>
              <h2 className="text-base font-semibold" style={{ color: '#252423' }}>
                {visual.title}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: '#605E5C' }}>
                {visual.type}
              </p>
            </div>

            {/* Status selector */}
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#605E5C' }}>
                Assessment Status
              </p>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map(opt => {
                  const isActive = status === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className="flex items-center gap-2 px-3 py-2 rounded border text-xs font-medium transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      style={{
                        color: isActive ? opt.color : '#605E5C',
                        borderColor: isActive ? opt.color : '#E1DFDD',
                        background: isActive ? opt.color + '14' : '#fff',
                        fontWeight: isActive ? 600 : 400,
                      }}
                      aria-pressed={isActive}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: opt.color }}
                      />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Checklist */}
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#605E5C' }}>
                Quality Checklist
              </p>
              <div className="flex flex-col gap-2">
                {checklistItems.map(item => {
                  const checked = checklist[item.key]
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleCheck(item.key)}
                      className="flex items-start gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded group"
                      role="checkbox"
                      aria-checked={checked}
                    >
                      {checked
                        ? <CheckSquare size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#107C10' }} />
                        : <Square size={16} className="flex-shrink-0 mt-0.5 group-hover:text-blue-500" style={{ color: '#8A8886' }} />}
                      <span
                        className="text-xs"
                        style={{ color: checked ? '#252423' : '#605E5C', textDecoration: checked ? 'none' : 'none' }}
                      >
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="visual-notes"
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                style={{ color: '#605E5C' }}
              >
                Notes
              </label>
              <textarea
                id="visual-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                placeholder="Add assessment notes…"
                className="w-full text-xs border rounded px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                style={{
                  borderColor: '#E1DFDD',
                  color: '#252423',
                  background: '#FAFAFA',
                }}
              />
            </div>
          </div>

          {/* Footer save button */}
          <div
            className="px-5 py-4 border-t flex-shrink-0"
            style={{ borderColor: '#E1DFDD', background: '#FAFAFA' }}
          >
            <button
              type="button"
              onClick={handleSave}
              className="w-full py-2 px-4 rounded text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
              style={{ background: '#0078D4' }}
            >
              Save Assessment
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
