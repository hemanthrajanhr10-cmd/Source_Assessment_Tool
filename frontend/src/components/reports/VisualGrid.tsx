import { useRef, useState, useLayoutEffect } from 'react'
import {
  TrendingUp, BarChart2, Table2, Filter, Activity,
  PieChart, LayoutGrid, Type, Image as ImageIcon,
  ScatterChart, TrendingDown, Eye,
} from 'lucide-react'
import type { MockPage, MockVisual } from '../../data/mockReports'

const PBI_DEFAULT_W = 1280
const PBI_DEFAULT_H = 720
const VISUAL_GAP_PX = 8
const INSET_MIN_W = 60
const INSET_MIN_H = 36

interface RawRect { x: number; y: number; width: number; height: number }

function applyVisualGutter(raw: RawRect): RawRect {
  const g = VISUAL_GAP_PX
  const newW = Math.max(INSET_MIN_W, raw.width  - g * 2)
  const newH = Math.max(INSET_MIN_H, raw.height - g * 2)
  const dx = (raw.width  - newW) / 2
  const dy = (raw.height - newH) / 2
  return { x: raw.x + dx, y: raw.y + dy, width: newW, height: newH }
}

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
  'kpi card': 'KPI',
  card: 'Card',
  pivottable: 'Pivot Table',
  tableex: 'Table',
  table: 'Table',
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
  gauge: 'Gauge',
}

function displayLabel(type: string): string {
  const key = type.toLowerCase().replace(/\s+/g, '')
  if (TYPE_LABEL_MAP[key]) return TYPE_LABEL_MAP[key]
  const keySpaced = type.toLowerCase()
  return TYPE_LABEL_MAP[keySpaced] ?? (type.charAt(0).toUpperCase() + type.slice(1))
}

function typeChipStyle(type: string): { bg: string; color: string; border: string } {
  const t = type.toLowerCase().replace(/\s+/g, '')
  if (t === 'slicer')
    return { bg: 'oklch(0.95 0.030 185)', color: 'oklch(0.38 0.090 185)', border: 'oklch(0.87 0.040 185)' }
  if (['columnchart','clusteredcolumnchart','stackedcolumnchart','hundredpercentstackedcolumnchart',
       'barchart','clusteredbarchart','stackedbarchart','hundredpercentstackedbarchart','lineclusteredcolumnchart'].includes(t))
    return { bg: 'oklch(0.95 0.025 210)', color: 'oklch(0.35 0.080 210)', border: 'oklch(0.87 0.035 210)' }
  if (['pivottable','matrix'].includes(t))
    return { bg: 'oklch(0.95 0.025 155)', color: 'oklch(0.35 0.080 155)', border: 'oklch(0.87 0.035 155)' }
  if (['tableex','table'].includes(t))
    return { bg: 'oklch(0.95 0.020 200)', color: 'oklch(0.33 0.065 200)', border: 'oklch(0.87 0.030 200)' }
  if (['card','kpivisual','kpi','kpicard'].includes(t))
    return { bg: 'oklch(0.95 0.025 155)', color: 'oklch(0.36 0.090 155)', border: 'oklch(0.87 0.035 155)' }
  if (['linechart','areachart','stackedareachart'].includes(t))
    return { bg: 'oklch(0.95 0.022 200)', color: 'oklch(0.34 0.075 200)', border: 'oklch(0.87 0.030 200)' }
  if (['donutchart','piechart'].includes(t))
    return { bg: 'oklch(0.95 0.030 185)', color: 'oklch(0.38 0.090 185)', border: 'oklch(0.87 0.040 185)' }
  if (t === 'gauge')
    return { bg: 'oklch(0.96 0.018 300)', color: 'oklch(0.38 0.090 300)', border: 'oklch(0.88 0.028 300)' }
  if (t === 'image')
    return { bg: 'oklch(0.96 0.005 240)', color: 'oklch(0.45 0.018 240)', border: 'oklch(0.90 0.008 240)' }
  return { bg: 'oklch(0.96 0.005 240)', color: 'oklch(0.40 0.015 240)', border: 'oklch(0.90 0.008 240)' }
}

function VisualTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const t = type.toLowerCase().replace(/\s+/g, '')
  if (t === 'slicer') return <Filter size={size} style={{ color: 'oklch(0.38 0.090 185)' }} />
  if (['linechart','areachart','stackedareachart'].includes(t))
    return <Activity size={size} style={{ color: 'oklch(0.34 0.075 200)' }} />
  if (['barchart','clusteredbarchart','stackedbarchart','columnchart',
       'clusteredcolumnchart','stackedcolumnchart','hundredpercentstackedcolumnchart',
       'hundredpercentstackedbarchart','lineclusteredcolumnchart'].includes(t))
    return <BarChart2 size={size} style={{ color: 'oklch(0.35 0.080 210)' }} />
  if (['card','kpivisual','kpi','kpicard'].includes(t))
    return <TrendingUp size={size} style={{ color: 'oklch(0.36 0.090 155)' }} />
  if (['tableex','table'].includes(t))
    return <Table2 size={size} style={{ color: 'oklch(0.33 0.065 200)' }} />
  if (['matrix','pivottable'].includes(t))
    return <LayoutGrid size={size} style={{ color: 'oklch(0.35 0.080 155)' }} />
  if (['donutchart','piechart'].includes(t))
    return <PieChart size={size} style={{ color: 'oklch(0.38 0.090 185)' }} />
  if (t === 'gauge')
    return <Activity size={size} style={{ color: 'oklch(0.38 0.090 300)' }} />
  if (t === 'scatterchart')
    return <ScatterChart size={size} style={{ color: 'oklch(0.34 0.075 200)' }} />
  if (['waterfallchart','funnelchart','ribbonchart','treemap'].includes(t))
    return <TrendingDown size={size} style={{ color: 'oklch(0.34 0.075 200)' }} />
  if (t === 'textbox')
    return <Type size={size} style={{ color: 'oklch(0.50 0.012 240)' }} />
  if (t === 'image')
    return <ImageIcon size={size} style={{ color: 'oklch(0.50 0.012 240)' }} />
  if (['shape','basicshape'].includes(t))
    return <div style={{ width: size, height: size, border: '1.5px solid oklch(0.65 0.010 240)', borderRadius: 2 }} />
  return <Eye size={size} style={{ color: 'oklch(0.60 0.010 240)' }} />
}

// ── Mini preview renderers ────────────────────────────────────────────────────

function MiniPreview({ visual, scale }: { visual: MockVisual; scale: number }) {
  const t = visual.type.toLowerCase().replace(/\s+/g, '')

  if (['textbox','shape','basicshape'].includes(t)) {
    const text = visual.text_content || visual.mockValue || ''
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', width: '100%', height: '100%', overflow: 'hidden', padding: Math.max(4, 8 * scale) }}>
        {text
          ? <span style={{ fontSize: Math.max(8, 11 * scale), color: 'oklch(0.30 0.010 240)', wordBreak: 'break-word', lineHeight: 1.5 }}>
              {text.slice(0, 140)}
            </span>
          : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', gap: 4 }}>
              <VisualTypeIcon type={visual.type} size={Math.max(12, 20 * scale)} />
              <span style={{ fontSize: Math.max(7, 10 * scale), color: 'oklch(0.65 0.010 240)' }}>
                {displayLabel(visual.type)}
              </span>
            </div>
        }
      </div>
    )
  }

  if (['card','kpivisual','kpi','kpicard'].includes(t)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <span style={{ fontSize: Math.max(12, 22 * scale), fontWeight: 700, color: 'oklch(0.18 0.012 240)', lineHeight: 1.1 }}>
          {visual.mockValue ?? '—'}
        </span>
        {visual.mockSubtitle && (
          <span style={{ fontSize: Math.max(7, 9 * scale), marginTop: 3, fontWeight: 500, color: 'oklch(0.36 0.090 155)' }}>
            {visual.mockSubtitle}
          </span>
        )}
      </div>
    )
  }

  if (t === 'gauge') {
    const pct = 0.72
    const r = 40, cx = 56, cy = 52
    const startAngle = Math.PI
    const endAngle = startAngle + pct * Math.PI
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle)
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <svg width="100%" height="100%" viewBox="0 0 112 68" preserveAspectRatio="xMidYMid meet">
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none" stroke="oklch(0.91 0.008 240)" strokeWidth="8" strokeLinecap="round" />
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
            fill="none" stroke="oklch(0.50 0.18 300)" strokeWidth="8" strokeLinecap="round" />
          <text x={cx} y={cy - 4} textAnchor="middle"
            style={{ fontSize: 12, fontWeight: 700, fill: 'oklch(0.18 0.012 240)', fontFamily: 'system-ui' }}>
            {visual.mockValue ?? '72%'}
          </text>
        </svg>
      </div>
    )
  }

  if (t === 'slicer') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, width: '100%', height: '100%', padding: Math.max(4, 8 * scale), alignContent: 'center' }}>
        {['(All)', 'A', 'B', 'C'].map((c, i) => (
          <span key={c} style={{
            padding: `${Math.max(1, 2 * scale)}px ${Math.max(4, 8 * scale)}px`,
            fontSize: Math.max(7, 10 * scale), borderRadius: 999, fontWeight: 500,
            border: '1px solid',
            borderColor: i === 0 ? 'oklch(0.70 0.080 185)' : 'oklch(0.82 0.012 240)',
            background: i === 0 ? 'oklch(0.44 0.072 185)' : '#fff',
            color: i === 0 ? '#fff' : 'oklch(0.38 0.012 240)',
          }}>{c}</span>
        ))}
      </div>
    )
  }

  if (['barchart','clusteredbarchart','stackedbarchart','columnchart',
       'clusteredcolumnchart','stackedcolumnchart','hundredpercentstackedcolumnchart',
       'hundredpercentstackedbarchart','lineclusteredcolumnchart'].includes(t)) {
    const bars = [0.6, 0.85, 0.45, 0.9, 0.7]
    const colors = ['oklch(0.52 0.080 185)','oklch(0.60 0.075 200)','oklch(0.45 0.090 170)','oklch(0.56 0.085 210)','oklch(0.50 0.072 185)']
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, width: '100%', height: '100%',
        padding: `${Math.max(4, 8 * scale)}px ${Math.max(8, 16 * scale)}px ${Math.max(6, 10 * scale)}px` }}>
        {bars.map((p, i) => (
          <div key={i} style={{
            flex: 1, height: `${p * 100}%`,
            background: colors[i],
            borderRadius: '3px 3px 0 0',
            opacity: 0.85,
          }} />
        ))}
      </div>
    )
  }

  if (['linechart','areachart','stackedareachart'].includes(t)) {
    const pts = [0.7, 0.45, 0.6, 0.3, 0.5, 0.2, 0.4, 0.35]
    const W = 180, H = 60
    const xStep = W / (pts.length - 1)
    const polyline = pts.map((p, i) => `${i * xStep},${p * H}`).join(' ')
    const areaPath = `M 0 ${pts[0] * H} ${pts.map((p, i) => `L ${i * xStep} ${p * H}`).join(' ')} L ${W} ${H} L 0 ${H} Z`
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: Math.max(4, 8 * scale) }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <path d={areaPath} fill="oklch(0.44 0.072 185)" fillOpacity={0.12} />
          <polyline points={polyline} fill="none" stroke="oklch(0.44 0.072 185)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  if (['donutchart','piechart'].includes(t)) {
    const sz = 80, r = sz / 2 - 4, cx = sz / 2, cy = sz / 2
    const segs = [
      { pct: 0.45, color: 'oklch(0.56 0.085 185)' },
      { pct: 0.30, color: 'oklch(0.44 0.072 185)' },
      { pct: 0.25, color: 'oklch(0.36 0.090 155)' },
    ]
    let angle = -Math.PI / 2
    const arcs = segs.map(s => {
      const a1 = angle, a2 = angle + s.pct * 2 * Math.PI
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
      angle = a2
      return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${s.pct > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`, color: s.color }
    })
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <svg width={sz} height={sz}>
          {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} opacity={0.88} />)}
          {t === 'donutchart' && <circle cx={cx} cy={cy} r={r * 0.48} fill="oklch(0.985 0.005 185)" />}
        </svg>
      </div>
    )
  }

  if (['tableex','table','matrix','pivottable'].includes(t)) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 1, padding: Math.max(4, 8 * scale) }}>
        <div style={{ height: Math.max(8, 14 * scale), background: 'oklch(0.87 0.020 185)', borderRadius: 3 }} />
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, minHeight: 0,
            background: i % 2 === 0 ? '#fff' : 'oklch(0.98 0.006 185)',
            borderRadius: 2,
            border: '1px solid oklch(0.94 0.008 185)',
          }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', gap: 6 }}>
      <VisualTypeIcon type={visual.type} size={Math.max(16, 24 * scale)} />
      <span style={{ fontSize: Math.max(7, 10 * scale), fontWeight: 500, color: 'oklch(0.55 0.015 240)' }}>
        {displayLabel(visual.type)}
      </span>
    </div>
  )
}

// ── Visual box ────────────────────────────────────────────────────────────────

interface VisualBoxProps {
  visual: MockVisual
  scale: number
  pageW: number
  index: number
  totalVisuals: number
  onClick: () => void
}

const MIN_W = 80
const MIN_H = 50

function fallbackRect(index: number, pageW: number) {
  const cols = 4, pad = 10
  const cellW = Math.floor((pageW - pad * (cols + 1)) / cols)
  const cellH = 120
  const col = index % cols
  const row = Math.floor(index / cols)
  return { x: pad + col * (cellW + pad), y: pad + row * (cellH + pad), width: cellW, height: cellH }
}

function VisualBox({ visual, scale, pageW, index, totalVisuals, onClick }: VisualBoxProps) {
  const [hovered, setHovered] = useState(false)

  const hasLayout = (
    visual.x !== undefined && visual.y !== undefined &&
    visual.width !== undefined && visual.height !== undefined &&
    visual.width > 0 && visual.height > 0
  )

  const rawSlot = hasLayout
    ? { x: visual.x!, y: visual.y!, width: visual.width!, height: visual.height! }
    : fallbackRect(index, pageW)

  const rect = hasLayout ? applyVisualGutter(rawSlot) : rawSlot

  const left   = rect.x * scale
  const top    = rect.y * scale
  const width  = Math.max(MIN_W * scale, rect.width  * scale)
  const height = Math.max(MIN_H * scale, rect.height * scale)

  const label = displayLabel(visual.type)
  const chip  = typeChipStyle(visual.type)
  const displayTitle = (visual.title && visual.title.toLowerCase() !== visual.type.toLowerCase())
    ? visual.title
    : label

  const headerH = Math.max(22, Math.min(30, height * 0.22))
  const iconSize = Math.max(9, Math.min(13, headerH * 0.46))
  const chipFontSize = Math.max(7, Math.min(10, headerH * 0.38))
  const showFooter = height > 72
  const footerH = showFooter ? Math.max(18, Math.min(24, height * 0.15)) : 0
  const previewH = height - headerH - footerH

  const area = rect.width * rect.height
  const maxArea = PBI_DEFAULT_W * PBI_DEFAULT_H
  const areaRank = Math.round((1 - area / maxArea) * (totalVisuals + 1))
  const baseZ = Math.max(1, areaRank)

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
        position: 'absolute',
        left, top, width, height,
        background: '#ffffff',
        border: `1px solid ${hovered ? 'oklch(0.70 0.065 185)' : 'oklch(0.90 0.015 185)'}`,
        borderRadius: Math.max(5, 9 * scale),
        boxShadow: hovered
          ? '0 6px 20px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)'
          : '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-2px) scale(1.002)' : 'translateY(0) scale(1)',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        zIndex: hovered ? 9999 : baseZ,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: Math.max(3, 6 * scale),
        padding: `0 ${Math.max(5, 9 * scale)}px`,
        borderBottom: `1px solid oklch(0.95 0.008 185)`,
        flexShrink: 0, height: headerH, overflow: 'hidden',
        background: hovered ? 'oklch(0.985 0.012 185)' : 'oklch(0.992 0.006 185)',
        transition: 'background 160ms ease',
      }}>
        <VisualTypeIcon type={visual.type} size={iconSize} />
        <span style={{
          padding: `1px ${Math.max(4, 6 * scale)}px`, borderRadius: 999,
          fontSize: chipFontSize, fontWeight: 600,
          background: chip.bg, color: chip.color,
          border: `1px solid ${chip.border}`,
          lineHeight: '14px', whiteSpace: 'nowrap',
          letterSpacing: '0.01em', flexShrink: 0,
        }}>
          {label}
        </span>
        {visual.fields && visual.fields.length > 0 && width > 100 && (
          <span style={{
            marginLeft: 'auto', fontSize: chipFontSize,
            color: 'oklch(0.62 0.015 240)', whiteSpace: 'nowrap',
          }}>
            {visual.fields.length}f
          </span>
        )}
      </div>

      {/* Preview */}
      <div style={{
        background: 'oklch(0.99 0.004 185)',
        height: previewH, overflow: 'hidden', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MiniPreview visual={visual} scale={scale} />
      </div>

      {/* Footer */}
      {showFooter && (
        <div style={{
          padding: `0 ${Math.max(5, 9 * scale)}px`,
          borderTop: `1px solid oklch(0.95 0.008 185)`,
          flexShrink: 0, height: footerH, overflow: 'hidden',
          display: 'flex', alignItems: 'center',
          background: 'oklch(0.992 0.006 185)',
        }}>
          <p style={{
            fontSize: Math.max(8, 11 * scale), fontWeight: 500,
            color: 'oklch(0.38 0.018 240)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            margin: 0, lineHeight: 1.2,
          }} title={displayTitle}>
            {displayTitle}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main grid ─────────────────────────────────────────────────────────────────

interface VisualGridProps {
  page: MockPage
  onClickVisual: (visualId: string) => void
}

export default function VisualGrid({ page, onClickVisual }: VisualGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0
      setContainerWidth(w)
    })
    obs.observe(el)
    setContainerWidth(el.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [])

  if (page.visuals.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '80px 32px', minHeight: 300,
        background: 'oklch(0.985 0.006 185)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'oklch(0.94 0.022 185)',
          border: '1px solid oklch(0.87 0.030 185)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Eye size={24} style={{ color: 'oklch(0.60 0.040 185)' }} />
        </div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'oklch(0.38 0.020 240)' }}>
          No visuals on this page
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'oklch(0.60 0.012 240)' }}>
          This page contains no visual elements.
        </p>
      </div>
    )
  }

  const pageW = page.page_width  ?? PBI_DEFAULT_W
  const pageH = page.page_height ?? PBI_DEFAULT_H
  const CANVAS_PADDING = 20
  const usableWidth = Math.max(0, containerWidth - CANVAS_PADDING * 2)
  const scale = usableWidth > 0 ? usableWidth / pageW : 1
  const canvasH = pageH * scale

  return (
    <div
      ref={containerRef}
      style={{
        background: 'oklch(0.972 0.010 185)',
        padding: `${CANVAS_PADDING}px ${CANVAS_PADDING}px 36px`,
        minHeight: '100%',
        overflowY: 'auto',
      }}
      aria-label={`Report page: ${page.name}`}
    >
      {/* Page name label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 14,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'oklch(0.50 0.035 185)',
        }}>
          {page.name}
        </span>
        {page.visuals.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: 'oklch(0.44 0.072 185)',
            background: 'oklch(0.93 0.030 185)',
            border: '1px solid oklch(0.87 0.035 185)',
            borderRadius: 8, padding: '1px 8px',
          }}>
            {page.visuals.length} visual{page.visuals.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Canvas surface */}
      <div
        style={{
          position: 'relative',
          width: containerWidth > 0 ? usableWidth : '100%',
          height: canvasH || pageH,
          background: '#ffffff',
          border: '1px solid oklch(0.88 0.018 185)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.05)',
        }}
      >
        {containerWidth > 0 && page.visuals.map((visual, i) => (
          <VisualBox
            key={visual.id}
            visual={visual}
            scale={scale}
            pageW={pageW}
            index={i}
            totalVisuals={page.visuals.length}
            onClick={() => onClickVisual(visual.id)}
          />
        ))}
      </div>
    </div>
  )
}
