import { useState } from 'react'
import {
  TrendingUp, BarChart2, Table2, Filter, Activity,
  PieChart, LayoutGrid, Type, Image as ImageIcon,
  ScatterChart, TrendingDown, Eye,
} from 'lucide-react'
import type { MockPage, MockVisual } from '../../data/mockReports'

// ── Type label map ─────────────────────────────────────────────────────────────

const TYPE_LABEL_MAP: Record<string, string> = {
  clusteredcolumnchart: 'Column Chart',
  stackedcolumnchart: 'Stacked Column',
  hundredpercentstackedcolumnchart: '100% Column',
  barchart: 'Bar Chart',
  clusteredbarchart: 'Bar Chart',
  stackedbarchart: 'Stacked Bar',
  hundredpercentstackedbarchart: '100% Bar',
  columnchart: 'Column Chart',
  linechart: 'Line Chart',
  areachart: 'Area Chart',
  stackedareachart: 'Stacked Area',
  donutchart: 'Donut Chart',
  piechart: 'Pie Chart',
  kpivisual: 'KPI',
  kpi: 'KPI',
  card: 'Card',
  pivottable: 'Pivot Table',
  tableex: 'Table',
  matrix: 'Matrix',
  basicshape: 'Shape',
  shape: 'Shape',
  scatterchart: 'Scatter',
  waterfallchart: 'Waterfall',
  funnelchart: 'Funnel',
  ribbonchart: 'Ribbon',
  treemap: 'Treemap',
  lineclusteredcolumnchart: 'Combo Chart',
  slicer: 'Slicer',
  textbox: 'Text Box',
  image: 'Image',
}

function displayLabel(type: string): string {
  const key = type.toLowerCase().replace(/\s+/g, '')
  return TYPE_LABEL_MAP[key] ?? (type.charAt(0).toUpperCase() + type.slice(1))
}

function typeChipStyle(type: string): { bg: string; color: string } {
  const t = type.toLowerCase().replace(/\s+/g, '')
  if (t === 'slicer')
    return { bg: '#EFF6FF', color: '#1D4ED8' }
  if (['columnchart', 'clusteredcolumnchart', 'stackedcolumnchart',
       'hundredpercentstackedcolumnchart', 'barchart', 'clusteredbarchart',
       'stackedbarchart', 'hundredpercentstackedbarchart', 'lineclusteredcolumnchart'].includes(t))
    return { bg: '#EEF2FF', color: '#4338CA' }
  if (['pivottable', 'matrix'].includes(t))
    return { bg: '#F5F3FF', color: '#6D28D9' }
  if (['tableex', 'table'].includes(t))
    return { bg: '#F0FDFA', color: '#0F766E' }
  if (['card', 'kpivisual', 'kpi'].includes(t))
    return { bg: '#ECFDF5', color: '#047857' }
  if (['linechart', 'areachart', 'stackedareachart'].includes(t))
    return { bg: '#ECFEFF', color: '#0E7490' }
  if (['donutchart', 'piechart'].includes(t))
    return { bg: '#FFF1F2', color: '#BE123C' }
  return { bg: '#F9FAFB', color: '#374151' }
}

// ── Visual type icon ───────────────────────────────────────────────────────────

function VisualTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const t = type.toLowerCase().replace(/\s+/g, '')
  if (t === 'slicer') return <Filter size={size} style={{ color: '#1D4ED8' }} />
  if (['linechart', 'areachart', 'stackedareachart'].includes(t))
    return <Activity size={size} style={{ color: '#0E7490' }} />
  if (['barchart', 'clusteredbarchart', 'stackedbarchart', 'columnchart',
       'clusteredcolumnchart', 'stackedcolumnchart', 'hundredpercentstackedcolumnchart',
       'hundredpercentstackedbarchart', 'lineclusteredcolumnchart'].includes(t))
    return <BarChart2 size={size} style={{ color: '#4338CA' }} />
  if (['card', 'kpivisual', 'kpi'].includes(t))
    return <TrendingUp size={size} style={{ color: '#047857' }} />
  if (['tableex', 'table'].includes(t))
    return <Table2 size={size} style={{ color: '#0F766E' }} />
  if (['matrix', 'pivottable'].includes(t))
    return <LayoutGrid size={size} style={{ color: '#6D28D9' }} />
  if (['donutchart', 'piechart'].includes(t))
    return <PieChart size={size} style={{ color: '#BE123C' }} />
  if (t === 'scatterchart')
    return <ScatterChart size={size} style={{ color: '#0078D4' }} />
  if (['waterfallchart', 'funnelchart', 'ribbonchart', 'treemap'].includes(t))
    return <TrendingDown size={size} style={{ color: '#0078D4' }} />
  if (t === 'textbox')
    return <Type size={size} style={{ color: '#6B7280' }} />
  if (t === 'image')
    return <ImageIcon size={size} style={{ color: '#6B7280' }} />
  if (['shape', 'basicshape'].includes(t))
    return <div style={{ width: size, height: size, border: '1.5px solid #9CA3AF', borderRadius: 2 }} />
  return <Eye size={size} style={{ color: '#9CA3AF' }} />
}

// ── Mini Preview (120px tall area inside card) ─────────────────────────────────

const PREVIEW_H = 120

function MiniPreview({ visual }: { visual: MockVisual }) {
  const t = visual.type.toLowerCase().replace(/\s+/g, '')

  if (['textbox', 'shape', 'basicshape'].includes(t)) {
    const text = visual.text_content || visual.mockValue || ''
    return (
      <div className="flex items-start justify-start w-full h-full p-3 overflow-hidden">
        {text
          ? <span className="text-xs leading-relaxed" style={{ color: '#374151', wordBreak: 'break-word' }}>
              {text.slice(0, 140)}
            </span>
          : <div className="flex flex-col items-center justify-center w-full h-full gap-1">
              <VisualTypeIcon type={visual.type} size={24} />
              <span className="text-xs" style={{ color: '#9CA3AF' }}>{displayLabel(visual.type)}</span>
            </div>
        }
      </div>
    )
  }

  if (['card', 'kpivisual', 'kpi'].includes(t)) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full">
        <span style={{ fontSize: 30, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>
          {visual.mockValue ?? '—'}
        </span>
        {visual.mockSubtitle && (
          <span className="text-xs mt-1.5 font-medium" style={{ color: '#047857' }}>
            {visual.mockSubtitle}
          </span>
        )}
      </div>
    )
  }

  if (t === 'slicer') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 p-3 w-full content-center h-full">
        {['(All)', 'A', 'B', 'C'].map((c, i) => (
          <span key={c} style={{
            padding: '2px 10px', fontSize: 11, borderRadius: 999, fontWeight: 500,
            border: '1px solid', borderColor: i === 0 ? '#1D4ED8' : '#D1D5DB',
            background: i === 0 ? '#1D4ED8' : '#fff',
            color: i === 0 ? '#fff' : '#374151',
          }}>{c}</span>
        ))}
      </div>
    )
  }

  if (['barchart', 'clusteredbarchart', 'stackedbarchart', 'columnchart',
       'clusteredcolumnchart', 'stackedcolumnchart', 'hundredpercentstackedcolumnchart',
       'hundredpercentstackedbarchart', 'lineclusteredcolumnchart'].includes(t)) {
    const bars = [0.6, 0.85, 0.45, 0.9, 0.7]
    return (
      <div className="flex items-end justify-center gap-1 w-full px-5"
        style={{ height: PREVIEW_H - 16, paddingBottom: 10 }}>
        {bars.map((p, i) => (
          <div key={i} style={{
            flex: 1, height: `${p * 100}%`,
            background: `hsl(${240 + i * 8}, 60%, ${50 + i * 2}%)`,
            borderRadius: '2px 2px 0 0',
          }} />
        ))}
      </div>
    )
  }

  if (['linechart', 'areachart', 'stackedareachart'].includes(t)) {
    const pts = [0.7, 0.45, 0.6, 0.3, 0.5, 0.2, 0.4, 0.35]
    const W = 180, H = PREVIEW_H - 28
    const xStep = W / (pts.length - 1)
    const polyline = pts.map((p, i) => `${i * xStep},${p * H}`).join(' ')
    const areaPath = `M 0 ${pts[0] * H} ${pts.map((p, i) => `L ${i * xStep} ${p * H}`).join(' ')} L ${W} ${H} L 0 ${H} Z`
    return (
      <div className="flex items-center justify-center w-full" style={{ height: PREVIEW_H - 16, padding: '8px 16px' }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <path d={areaPath} fill="#ECFEFF" fillOpacity={0.6} />
          <polyline points={polyline} fill="none" stroke="#0E7490" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  if (['donutchart', 'piechart'].includes(t)) {
    const sz = Math.min(100, PREVIEW_H - 20)
    const r = sz / 2 - 4
    const cx = sz / 2, cy = sz / 2
    const segs = [{ pct: 0.45, color: '#BE123C' }, { pct: 0.3, color: '#7C3AED' }, { pct: 0.25, color: '#0E7490' }]
    let angle = -Math.PI / 2
    const arcs = segs.map(s => {
      const a1 = angle, a2 = angle + s.pct * 2 * Math.PI
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
      angle = a2
      return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${s.pct > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`, color: s.color }
    })
    return (
      <div className="flex items-center justify-center w-full h-full">
        <svg width={sz} height={sz}>
          {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} opacity={0.85} />)}
          {t === 'donutchart' && <circle cx={cx} cy={cy} r={r * 0.48} fill="#F9FAFB" />}
        </svg>
      </div>
    )
  }

  if (['tableex', 'table', 'matrix', 'pivottable'].includes(t)) {
    return (
      <div className="w-full h-full flex flex-col gap-px px-3 py-3">
        <div style={{ height: 16, background: '#E5E7EB', borderRadius: 2 }} />
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 13,
            background: i % 2 === 0 ? '#fff' : '#F9FAFB',
            borderRadius: 2,
            border: '1px solid #F3F4F6',
          }} />
        ))}
      </div>
    )
  }

  // Generic fallback — centered icon + label on gray-50
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-2" style={{ background: '#F9FAFB' }}>
      <VisualTypeIcon type={visual.type} size={28} />
      <span className="text-xs font-medium" style={{ color: '#6B7280' }}>{displayLabel(visual.type)}</span>
    </div>
  )
}

// ── Visual Thumbnail Card ──────────────────────────────────────────────────────

function VisualThumbnailCard({ visual, onClick }: { visual: MockVisual; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const label = displayLabel(visual.type)
  const chip = typeChipStyle(visual.type)
  const displayTitle = (visual.title && visual.title.toLowerCase() !== visual.type.toLowerCase())
    ? visual.title
    : label

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${displayTitle} — click to inspect field bindings`}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${hovered ? '#93C5FD' : '#E5E7EB'}`,
        borderRadius: 8,
        boxShadow: hovered
          ? '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)'
          : '0 1px 4px rgba(0,0,0,0.08)',
        transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header: icon + type chip + field count */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '9px 12px 8px',
        borderBottom: '1px solid #F3F4F6',
        flexShrink: 0,
      }}>
        <VisualTypeIcon type={visual.type} size={13} />
        <span style={{
          padding: '2px 8px', borderRadius: 999,
          fontSize: 10, fontWeight: 600,
          background: chip.bg, color: chip.color,
          lineHeight: '16px', whiteSpace: 'nowrap',
          letterSpacing: '0.01em',
        }}>
          {label}
        </span>
        {visual.fields && visual.fields.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
            {visual.fields.length}f
          </span>
        )}
      </div>

      {/* Preview area */}
      <div style={{
        background: '#F9FAFB',
        height: PREVIEW_H,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <MiniPreview visual={visual} />
      </div>

      {/* Footer: visual name */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid #F3F4F6',
        flexShrink: 0,
      }}>
        <p style={{
          fontSize: 12, fontWeight: 600, color: '#1F2937',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          margin: 0,
        }} title={displayTitle}>
          {displayTitle}
        </p>
      </div>
    </div>
  )
}

// ── Main Grid Component ────────────────────────────────────────────────────────

interface VisualGridProps {
  page: MockPage
  onClickVisual: (visualId: string) => void
}

export default function VisualGrid({ page, onClickVisual }: VisualGridProps) {
  if (page.visuals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-8"
        style={{ color: '#9CA3AF', minHeight: 300 }}>
        <Eye size={40} style={{ opacity: 0.25 }} />
        <p className="text-sm font-medium" style={{ color: '#6B7280' }}>No visuals on this page</p>
        <p className="text-xs" style={{ color: '#9CA3AF' }}>This page contains no visual elements.</p>
      </div>
    )
  }

  return (
    <div
      className="overflow-y-auto"
      style={{ background: '#F3F4F6', padding: 20, minHeight: '100%' }}
      aria-label={`Report page: ${page.name}`}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 16,
        alignItems: 'stretch',
      }}>
        {page.visuals.map(visual => (
          <VisualThumbnailCard
            key={visual.id}
            visual={visual}
            onClick={() => onClickVisual(visual.id)}
          />
        ))}
      </div>
    </div>
  )
}
