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
  'KPI Card':    <TrendingUp size={20} style={{ color: '#0078D4' }} />,
  'Bar Chart':   <BarChart2 size={20} style={{ color: '#0078D4' }} />,
  'Table':       <Table2 size={20} style={{ color: '#0078D4' }} />,
  'Slicer':      <Filter size={20} style={{ color: '#0078D4' }} />,
  'Line Chart':  <Activity size={20} style={{ color: '#0078D4' }} />,
  'Donut Chart': <PieChart size={20} style={{ color: '#0078D4' }} />,
  'Matrix':      <LayoutGrid size={20} style={{ color: '#0078D4' }} />,
  'Card':        <CreditCard size={20} style={{ color: '#0078D4' }} />,
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
  const icon = VISUAL_ICONS[visual.type] ?? <Eye size={20} style={{ color: '#0078D4' }} />
  const statusCfg = STATUS_CONFIG[assessmentStatus]

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
      title="Click to assess"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="bg-white border border-slate-200 rounded-lg p-3 cursor-pointer transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:shadow-md hover:border-slate-300 hover:scale-[1.02] relative overflow-hidden"
      style={{
        gridColumn: colSpan === 2 ? 'span 2' : undefined,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
      aria-label={`Visual: ${visual.title}. Status: ${statusCfg.label}. Click to assess.`}
    >
      {/* Status badge — top right */}
      <span
        className="absolute top-2 right-2 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border font-medium"
        style={{
          color: statusCfg.color,
          borderColor: statusCfg.color + '44',
          background: statusCfg.color + '14',
          fontSize: '10px',
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: statusCfg.color }}
        />
        {statusCfg.label}
      </span>

      {/* Icon + title */}
      <div className="flex items-start gap-2 pr-20 mb-2">
        <div
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded"
          style={{ background: '#EFF6FF' }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p
            className="text-sm font-semibold truncate leading-tight"
            style={{ color: '#252423' }}
            title={visual.title}
          >
            {visual.title}
          </p>
          <p className="text-xs truncate mt-0.5" style={{ color: '#605E5C' }}>
            {visual.type}
          </p>
        </div>
      </div>

      {/* Mock value */}
      {visual.mockValue && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p
            className="text-base font-bold truncate"
            style={{ color: '#252423' }}
          >
            {visual.mockValue}
          </p>
          {visual.mockSubtitle && (
            <p className="text-xs truncate" style={{ color: '#605E5C' }}>
              {visual.mockSubtitle}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
