import {
  TrendingUp, BarChart2, Table2, Filter, Activity,
  PieChart, LayoutGrid, Eye, Type, Image as ImageIcon,
  ScatterChart, TrendingDown, Hash,
} from 'lucide-react'
import type { MockVisual } from '../../data/mockReports'

interface VisualCardProps {
  visual: MockVisual
  onClick: () => void
  colSpan?: number
}

// ── Normalize raw Power BI type ───────────────────────────────────────────────

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
    'bar chart': 'Bar Chart',
    'line chart': 'Line Chart',
    'kpi card': 'KPI Card',
    'donut chart': 'Donut Chart',
    'pie chart': 'Pie Chart',
  }
  return map[raw.toLowerCase()] ?? raw
}

// Ocean-themed icon lookup ──────────────────────────────────────────────────────

export function getVisualIcon(raw: string, size = 18): React.ReactNode {
  const t = raw.toLowerCase()
  const ocean  = '#6CBDB5'
  const tide   = '#4DA8A0'
  const grove  = '#0D9488'
  const amber  = '#D97706'
  const slate  = '#94A3B8'

  if (t === 'slicer') return <Filter size={size} style={{ color: amber }} />
  if (['linechart', 'areachart', 'stackedareachart', 'line chart'].includes(t))
    return <Activity size={size} style={{ color: tide }} />
  if (['barchart', 'clusteredbarchart', 'stackedbarchart', 'columnchart',
       'clusteredcolumnchart', 'stackedcolumnchart', 'hundredpercentstackedcolumnchart',
       'hundredpercentstackedbarchart', 'bar chart', 'column chart'].includes(t))
    return <BarChart2 size={size} style={{ color: ocean }} />
  if (['lineclusteredcolumnchart'].includes(t))
    return <TrendingUp size={size} style={{ color: tide }} />
  if (['card', 'kpivisual', 'kpi card', 'kpi'].includes(t))
    return <TrendingUp size={size} style={{ color: grove }} />
  if (['tableex', 'table'].includes(t))
    return <Table2 size={size} style={{ color: tide }} />
  if (['matrix', 'pivottable'].includes(t))
    return <LayoutGrid size={size} style={{ color: grove }} />
  if (['donutchart', 'piechart', 'donut chart', 'pie chart'].includes(t))
    return <PieChart size={size} style={{ color: ocean }} />
  if (['scatterchart'].includes(t))
    return <ScatterChart size={size} style={{ color: tide }} />
  if (['waterfallchart', 'funnelchart'].includes(t))
    return <TrendingDown size={size} style={{ color: amber }} />
  if (['treemap', 'ribbonchart'].includes(t))
    return <LayoutGrid size={size} style={{ color: grove }} />
  if (['textbox'].includes(t))
    return <Type size={size} style={{ color: slate }} />
  if (['image'].includes(t))
    return <ImageIcon size={size} style={{ color: slate }} />

  return <Eye size={size} style={{ color: '#94A3B8' }} />
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VisualCard({ visual, onClick, colSpan = 1 }: VisualCardProps) {
  const icon = getVisualIcon(visual.type, 17)
  const displayType = normalizeVisualType(visual.type)
  const fieldCount = visual.fields?.length ?? 0
  const measureCount = visual.fields?.filter(f => f.field_type === 'measure').length ?? 0
  const isTextLike = ['textbox', 'shape', 'basicShape'].includes(visual.type.toLowerCase())

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
  }

  const displayTitle = visual.title && visual.title.toLowerCase() !== visual.type.toLowerCase()
    ? visual.title
    : displayType

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="rounded-xl cursor-pointer transition-all duration-200 focus:outline-none focus-visible:ring-2 overflow-hidden"
      style={{
        gridColumn: colSpan === 2 ? 'span 2' : undefined,
        background: '#ffffff',
        border: '1px solid rgba(197,213,236,0.8)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        '--tw-ring-color': 'rgba(108,189,181,0.40)',
      } as React.CSSProperties}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(-2px) scale(1.01)'
        el.style.boxShadow = '0 8px 24px rgba(108,189,181,0.18), 0 2px 6px rgba(0,0,0,0.04)'
        el.style.borderColor = 'rgba(108,189,181,0.38)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = ''
        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
        el.style.borderColor = 'rgba(197,213,236,0.8)'
      }}
      aria-label={`${displayTitle} (${displayType}). Click to view details.`}
    >
      {/* Main content */}
      <div className="flex items-start gap-2.5 p-3">
        {/* Icon */}
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg mt-0.5"
          style={{ background: 'linear-gradient(135deg, rgba(108,189,181,0.12) 0%, rgba(147,204,198,0.06) 100%)', border: '1px solid rgba(108,189,181,0.20)' }}>
          {icon}
        </div>

        {/* Title + type badge */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug truncate text-slate-900" title={displayTitle}>
            {displayTitle}
          </p>
          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium leading-none"
            style={{ color: '#0F766E', borderColor: 'rgba(108,189,181,0.28)', background: 'rgba(108,189,181,0.08)' }}>
            {displayType}
          </span>
        </div>
      </div>

      {/* Text content for textbox / shape visuals */}
      {isTextLike && visual.text_content && (
        <div className="px-3 pb-2">
          <p className="text-xs italic line-clamp-2 text-slate-400">
            "{visual.text_content}"
          </p>
        </div>
      )}

      {/* Footer strip */}
      <div className="flex items-center gap-3 px-3 py-2 border-t text-xs"
        style={{ borderColor: 'rgba(197,213,236,0.5)', background: 'rgba(240,250,249,0.5)', color: '#64748B' }}>
        {isTextLike
          ? <span>{visual.text_content ? 'Text content' : 'Shape / text'}</span>
          : fieldCount > 0
            ? <>
                <span>{fieldCount} field{fieldCount !== 1 ? 's' : ''}</span>
                {measureCount > 0 && (
                  <span className="flex items-center gap-0.5" style={{ color: '#0F766E' }}>
                    <Hash size={9} />
                    {measureCount} measure{measureCount !== 1 ? 's' : ''}
                  </span>
                )}
              </>
            : <span>No field data</span>
        }
        <span className="ml-auto text-[10px] font-semibold" style={{ color: '#0F766E' }}>View →</span>
      </div>
    </div>
  )
}
