import {
  TrendingUp, BarChart2, Table2, Filter, Activity,
  PieChart, LayoutGrid, Eye, Type, Image as ImageIcon,
  ScatterChart, TrendingDown,
} from 'lucide-react'
import type { MockVisual, AssessmentStatus } from '../../data/mockReports'

interface VisualCardProps {
  visual: MockVisual
  assessmentStatus: AssessmentStatus
  onUpdateStatus: (status: AssessmentStatus) => void
  onClick: () => void
  colSpan?: number
}

// ── Normalize raw Power BI type (camelCase) to display label ──────────────────

export function normalizeVisualType(raw: string): string {
  const map: Record<string, string> = {
    slicer: 'Slicer',
    textbox: 'Text Box',
    card: 'Card',
    kpivisual: 'KPI',
    linechart: 'Line Chart',
    areachart: 'Area Chart',
    stackedareachart: 'Stacked Area',
    barchart: 'Bar Chart',
    clusteredbarchart: 'Clustered Bar',
    stackedbarchart: 'Stacked Bar',
    columnchart: 'Column Chart',
    clusteredcolumnchart: 'Clustered Column',
    stackedcolumnchart: 'Stacked Column',
    hundredpercentstackedcolumnchart: '100% Stacked Column',
    hundredpercentstackedbarchart: '100% Stacked Bar',
    lineclusteredcolumnchart: 'Line & Column',
    tableex: 'Table',
    matrix: 'Matrix',
    pivottable: 'Pivot Table',
    donutchart: 'Donut Chart',
    piechart: 'Pie Chart',
    gauge: 'Gauge',
    image: 'Image',
    shape: 'Shape',
    map: 'Map',
    filledmap: 'Filled Map',
    azuremap: 'Azure Map',
    treemap: 'Treemap',
    waterfallchart: 'Waterfall',
    funnelchart: 'Funnel',
    scatterchart: 'Scatter',
    ribbonchart: 'Ribbon',
    decompositiontree: 'Decomp. Tree',
    qnavisual: 'Q&A',
    smartnarrative: 'Smart Narrative',
    // Keep already-friendly names
    'bar chart': 'Bar Chart',
    'line chart': 'Line Chart',
    'kpi card': 'KPI Card',
    'donut chart': 'Donut Chart',
    'pie chart': 'Pie Chart',
  }
  return map[raw.toLowerCase()] ?? raw
}

// ── Icon lookup by raw PBI type ───────────────────────────────────────────────

export function getVisualIcon(raw: string, size = 18): React.ReactNode {
  const t = raw.toLowerCase()
  const blue = '#0078D4'
  const gray = '#605E5C'

  if (t === 'slicer') return <Filter size={size} style={{ color: blue }} />
  if (['linechart', 'areachart', 'stackedareachart', 'line chart'].includes(t))
    return <Activity size={size} style={{ color: blue }} />
  if (['barchart', 'clusteredbarchart', 'stackedbarchart', 'columnchart',
       'clusteredcolumnchart', 'stackedcolumnchart', 'hundredpercentstackedcolumnchart',
       'hundredpercentstackedbarchart', 'bar chart', 'column chart'].includes(t))
    return <BarChart2 size={size} style={{ color: blue }} />
  if (['lineclusteredcolumnchart'].includes(t))
    return <TrendingUp size={size} style={{ color: blue }} />
  if (['card', 'kpivisual', 'kpi card', 'kpi'].includes(t))
    return <TrendingUp size={size} style={{ color: blue }} />
  if (['tableex', 'table'].includes(t))
    return <Table2 size={size} style={{ color: blue }} />
  if (['matrix', 'pivottable'].includes(t))
    return <LayoutGrid size={size} style={{ color: blue }} />
  if (['donutchart', 'piechart', 'donut chart', 'pie chart'].includes(t))
    return <PieChart size={size} style={{ color: blue }} />
  if (['scatterchart'].includes(t))
    return <ScatterChart size={size} style={{ color: blue }} />
  if (['waterfallchart', 'funnelchart'].includes(t))
    return <TrendingDown size={size} style={{ color: blue }} />
  if (['treemap', 'ribbonchart'].includes(t))
    return <LayoutGrid size={size} style={{ color: blue }} />
  if (['textbox'].includes(t))
    return <Type size={size} style={{ color: gray }} />
  if (['image'].includes(t))
    return <ImageIcon size={size} style={{ color: gray }} />

  return <Eye size={size} style={{ color: '#8A8886' }} />
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AssessmentStatus, { color: string; label: string }> = {
  pass:           { color: '#107C10', label: 'Pass' },
  fail:           { color: '#D13438', label: 'Fail' },
  warning:        { color: '#FF8C00', label: 'Warning' },
  'in-progress':  { color: '#0078D4', label: 'In Progress' },
  'not-assessed': { color: '#8A8886', label: 'Not Assessed' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VisualCard({
  visual,
  assessmentStatus,
  onClick,
  colSpan = 1,
}: VisualCardProps) {
  const icon = getVisualIcon(visual.type, 17)
  const displayType = normalizeVisualType(visual.type)
  const statusCfg = STATUS_CONFIG[assessmentStatus]
  const fieldCount = visual.fields?.length ?? 0
  const measureCount = visual.fields?.filter(f => f.field_type === 'measure').length ?? 0

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
  }

  // If title is blank or same as the raw type, show the normalized display type as the name
  const displayTitle = visual.title && visual.title.toLowerCase() !== visual.type.toLowerCase()
    ? visual.title
    : displayType

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="bg-white border rounded-lg cursor-pointer transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:shadow-md hover:scale-[1.02] overflow-hidden"
      style={{
        gridColumn: colSpan === 2 ? 'span 2' : undefined,
        borderColor: '#E1DFDD',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
      aria-label={`${displayTitle} (${displayType}). Click to view details.`}
    >
      {/* Main content */}
      <div className="flex items-start gap-2.5 p-3">
        {/* Icon */}
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded mt-0.5"
          style={{ background: '#EFF6FF' }}>
          {icon}
        </div>

        {/* Title + type badge */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug truncate" style={{ color: '#252423' }}
            title={displayTitle}>
            {displayTitle}
          </p>
          <span
            className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded border font-medium leading-none"
            style={{ color: '#0078D4', borderColor: '#B3D4F5', background: '#EFF6FF', fontSize: '10px' }}
          >
            {displayType}
          </span>
        </div>

        {/* Status badge */}
        <span
          className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full border font-medium"
          style={{
            color: statusCfg.color,
            borderColor: statusCfg.color + '55',
            background: statusCfg.color + '14',
            fontSize: '10px',
            lineHeight: '16px',
          }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: statusCfg.color }} />
          {statusCfg.label}
        </span>
      </div>

      {/* Footer strip */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 border-t text-xs"
        style={{ borderColor: '#F3F2F1', background: '#FAFAFA', color: '#8A8886' }}
      >
        {fieldCount > 0
          ? <>
              <span>{fieldCount} field{fieldCount !== 1 ? 's' : ''}</span>
              {measureCount > 0 && (
                <span style={{ color: '#8764B8' }}>{measureCount} measure{measureCount !== 1 ? 's' : ''}</span>
              )}
            </>
          : <span>No field data</span>
        }
        <span className="ml-auto" style={{ color: '#0078D4' }}>View details →</span>
      </div>
    </div>
  )
}
