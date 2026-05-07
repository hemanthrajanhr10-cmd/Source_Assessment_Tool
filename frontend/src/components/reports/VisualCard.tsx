import {
  TrendingUp, BarChart2, Table2, Filter, Activity,
  PieChart, LayoutGrid, CreditCard, Eye,
} from 'lucide-react'
import type { MockVisual, AssessmentStatus } from '../../data/mockReports'

interface VisualCardProps {
  visual: MockVisual
  assessmentStatus: AssessmentStatus
  onUpdateStatus: (status: AssessmentStatus) => void
  onClick: () => void
  colSpan?: number
}

const VISUAL_ICONS: Record<string, React.ReactNode> = {
  'KPI Card':    <TrendingUp size={18} style={{ color: '#0078D4' }} />,
  'Bar Chart':   <BarChart2 size={18} style={{ color: '#0078D4' }} />,
  'Table':       <Table2 size={18} style={{ color: '#0078D4' }} />,
  'Slicer':      <Filter size={18} style={{ color: '#0078D4' }} />,
  'Line Chart':  <Activity size={18} style={{ color: '#0078D4' }} />,
  'Donut Chart': <PieChart size={18} style={{ color: '#0078D4' }} />,
  'Matrix':      <LayoutGrid size={18} style={{ color: '#0078D4' }} />,
  'Card':        <CreditCard size={18} style={{ color: '#0078D4' }} />,
}

const STATUS_CONFIG: Record<AssessmentStatus, { color: string; label: string }> = {
  pass:           { color: '#107C10', label: 'Pass' },
  fail:           { color: '#D13438', label: 'Fail' },
  warning:        { color: '#FF8C00', label: 'Warning' },
  'in-progress':  { color: '#0078D4', label: 'In Progress' },
  'not-assessed': { color: '#8A8886', label: 'Not Assessed' },
}

export default function VisualCard({
  visual,
  assessmentStatus,
  onClick,
  colSpan = 1,
}: VisualCardProps) {
  const icon = VISUAL_ICONS[visual.type] ?? <Eye size={18} style={{ color: '#8A8886' }} />
  const statusCfg = STATUS_CONFIG[assessmentStatus]
  const fieldCount = visual.fields?.length ?? 0
  const measureCount = visual.fields?.filter(f => f.field_type === 'measure').length ?? 0

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title="Click to view field details"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="bg-white border border-slate-200 rounded-lg cursor-pointer transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:shadow-md hover:border-slate-300 hover:scale-[1.02] overflow-hidden"
      style={{
        gridColumn: colSpan === 2 ? 'span 2' : undefined,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
      aria-label={`${visual.title} (${visual.type}). Click to view details.`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2 p-3 pb-2">
        {/* Type icon */}
        <div
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded mt-0.5"
          style={{ background: '#EFF6FF' }}
        >
          {icon}
        </div>

        {/* Name + type */}
        <div className="flex-1 min-w-0 pr-1">
          <p
            className="text-sm font-semibold leading-tight"
            style={{ color: '#252423' }}
            title={visual.title}
          >
            {visual.title}
          </p>
          <span
            className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded border font-medium"
            style={{ color: '#0078D4', borderColor: '#0078D444', background: '#0078D414', fontSize: '10px' }}
          >
            {visual.type}
          </span>
        </div>

        {/* Status badge */}
        <span
          className="flex-shrink-0 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border font-medium"
          style={{
            color: statusCfg.color,
            borderColor: statusCfg.color + '44',
            background: statusCfg.color + '14',
            fontSize: '10px',
          }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: statusCfg.color }} />
          {statusCfg.label}
        </span>
      </div>

      {/* Field summary footer */}
      {fieldCount > 0 && (
        <div
          className="px-3 py-1.5 flex items-center gap-3 border-t text-xs"
          style={{ borderColor: '#F3F2F1', background: '#FAFAFA', color: '#605E5C' }}
        >
          <span>{fieldCount} field{fieldCount !== 1 ? 's' : ''}</span>
          {measureCount > 0 && (
            <span style={{ color: '#8764B8' }}>{measureCount} measure{measureCount !== 1 ? 's' : ''}</span>
          )}
          <span className="ml-auto text-xs" style={{ color: '#0078D4' }}>View details →</span>
        </div>
      )}
    </div>
  )
}
