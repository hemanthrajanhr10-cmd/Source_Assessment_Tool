import { useRef, useState, useLayoutEffect } from 'react'
import {
  TrendingUp, BarChart2, Table2, Filter, Activity,
  PieChart, LayoutGrid, Type, Image as ImageIcon,
  ScatterChart, TrendingDown, Eye,
} from 'lucide-react'
import type { MockPage, MockVisual } from '../../data/mockReports'

// ── Power BI default canvas size (used as fallback when page dims are absent) ──

const PBI_DEFAULT_W = 1280
const PBI_DEFAULT_H = 720

// ── Visual gutter ─────────────────────────────────────────────────────────────
// Gap to inset each visual from its raw Power BI bounding box, in page-coordinate
// pixels (before the container scale factor is applied). This creates breathing room
// between adjacent visuals without changing their relative order or grouping.
// Tune this single constant to adjust the overall density of the report canvas.

const VISUAL_GAP_PX = 5   // half-gap per side: visuals 10px apart when touching

// Minimum inset-adjusted dimensions (in page-coordinate pixels) below which we
// stop insetting so small visuals stay legible.
const INSET_MIN_W = 60
const INSET_MIN_H = 36

interface RawRect { x: number; y: number; width: number; height: number }

/**
 * Returns an inset copy of `raw` that adds breathing room between adjacent visuals.
 *
 * Strategy: shrink each visual by VISUAL_GAP_PX on every side, but only when the
 * visual is genuinely touching a neighbour (i.e. gap < VISUAL_GAP_PX*2 in source).
 * We detect this by checking whether the visual already has at least VISUAL_GAP_PX
 * of clear space on each side vs the page edge — if it does, we assume the report
 * author intentionally spaced it out and we only add half the inset so already-
 * spaced reports aren't over-corrected.
 *
 * Simpler heuristic used here: always inset by VISUAL_GAP_PX per side (uniform),
 * but cap so the visual never shrinks below INSET_MIN_W × INSET_MIN_H.
 * This is sufficient because the gap is small (5px each side) — visuals that were
 * already well-spaced in the source shrink slightly but grouping is unchanged.
 */
function applyVisualGutter(raw: RawRect): RawRect {
  const g = VISUAL_GAP_PX
  const newW = Math.max(INSET_MIN_W, raw.width  - g * 2)
  const newH = Math.max(INSET_MIN_H, raw.height - g * 2)
  // Centre the inset box within the original slot
  const dx = (raw.width  - newW) / 2
  const dy = (raw.height - newH) / 2
  return {
    x:      raw.x + dx,
    y:      raw.y + dy,
    width:  newW,
    height: newH,
  }
}

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
  // Also try with spaces preserved for multi-word types like "kpi card"
  const keySpaced = type.toLowerCase()
  return TYPE_LABEL_MAP[keySpaced] ?? (type.charAt(0).toUpperCase() + type.slice(1))
}

function typeChipStyle(type: string): { bg: string; color: string } {
  const t = type.toLowerCase().replace(/\s+/g, '')
  if (t === 'slicer')
    return { bg: '#EFF6FF', color: '#0056B3' }
  if (['columnchart', 'clusteredcolumnchart', 'stackedcolumnchart',
       'hundredpercentstackedcolumnchart', 'barchart', 'clusteredbarchart',
       'stackedbarchart', 'hundredpercentstackedbarchart', 'lineclusteredcolumnchart'].includes(t))
    return { bg: '#EDF8FA', color: '#0A6678' }
  if (['pivottable', 'matrix'].includes(t))
    return { bg: '#EDF9F0', color: '#136137' }
  if (['tableex', 'table'].includes(t))
    return { bg: '#EDF8FA', color: '#084E5B' }
  if (['card', 'kpivisual', 'kpi', 'kpicard'].includes(t))
    return { bg: '#EDF9F0', color: '#177B44' }
  if (['linechart', 'areachart', 'stackedareachart'].includes(t))
    return { bg: '#EDF8FA', color: '#0D7F97' }
  if (['donutchart', 'piechart'].includes(t))
    return { bg: '#EFF6FF', color: '#0056B3' }
  if (t === 'gauge')
    return { bg: '#FDF4FF', color: '#7C3AED' }
  if (t === 'image')
    return { bg: '#F9FAFB', color: '#6B7280' }
  return { bg: '#F9FAFB', color: '#374151' }
}

// ── Visual type icon ───────────────────────────────────────────────────────────

function VisualTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const t = type.toLowerCase().replace(/\s+/g, '')
  if (t === 'slicer') return <Filter size={size} style={{ color: '#0056B3' }} />
  if (['linechart', 'areachart', 'stackedareachart'].includes(t))
    return <Activity size={size} style={{ color: '#0D7F97' }} />
  if (['barchart', 'clusteredbarchart', 'stackedbarchart', 'columnchart',
       'clusteredcolumnchart', 'stackedcolumnchart', 'hundredpercentstackedcolumnchart',
       'hundredpercentstackedbarchart', 'lineclusteredcolumnchart'].includes(t))
    return <BarChart2 size={size} style={{ color: '#0A6678' }} />
  if (['card', 'kpivisual', 'kpi', 'kpicard'].includes(t))
    return <TrendingUp size={size} style={{ color: '#177B44' }} />
  if (['tableex', 'table'].includes(t))
    return <Table2 size={size} style={{ color: '#084E5B' }} />
  if (['matrix', 'pivottable'].includes(t))
    return <LayoutGrid size={size} style={{ color: '#136137' }} />
  if (['donutchart', 'piechart'].includes(t))
    return <PieChart size={size} style={{ color: '#0056B3' }} />
  if (t === 'gauge')
    return <Activity size={size} style={{ color: '#7C3AED' }} />
  if (t === 'scatterchart')
    return <ScatterChart size={size} style={{ color: '#0D7F97' }} />
  if (['waterfallchart', 'funnelchart', 'ribbonchart', 'treemap'].includes(t))
    return <TrendingDown size={size} style={{ color: '#0D7F97' }} />
  if (t === 'textbox')
    return <Type size={size} style={{ color: '#6B7280' }} />
  if (t === 'image')
    return <ImageIcon size={size} style={{ color: '#6B7280' }} />
  if (['shape', 'basicshape'].includes(t))
    return <div style={{ width: size, height: size, border: '1.5px solid #9CA3AF', borderRadius: 2 }} />
  return <Eye size={size} style={{ color: '#9CA3AF' }} />
}

// ── Mini Preview ───────────────────────────────────────────────────────────────
// Renders a scaled content preview that fills whatever space the parent gives it.

function MiniPreview({ visual, scale }: { visual: MockVisual; scale: number }) {
  const t = visual.type.toLowerCase().replace(/\s+/g, '')

  if (['textbox', 'shape', 'basicshape'].includes(t)) {
    const text = visual.text_content || visual.mockValue || ''
    return (
      <div className="flex items-start justify-start w-full h-full overflow-hidden"
        style={{ padding: Math.max(4, 8 * scale) }}>
        {text
          ? <span style={{
              fontSize: Math.max(8, 11 * scale),
              color: '#374151', wordBreak: 'break-word', lineHeight: 1.4,
            }}>
              {text.slice(0, 140)}
            </span>
          : <div className="flex flex-col items-center justify-center w-full h-full gap-1">
              <VisualTypeIcon type={visual.type} size={Math.max(12, 20 * scale)} />
              <span style={{ fontSize: Math.max(7, 10 * scale), color: '#9CA3AF' }}>
                {displayLabel(visual.type)}
              </span>
            </div>
        }
      </div>
    )
  }

  if (['card', 'kpivisual', 'kpi', 'kpicard'].includes(t)) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full">
        <span style={{ fontSize: Math.max(12, 22 * scale), fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>
          {visual.mockValue ?? '—'}
        </span>
        {visual.mockSubtitle && (
          <span style={{ fontSize: Math.max(7, 9 * scale), marginTop: 2, fontWeight: 500, color: '#047857' }}>
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
    const endAngle   = startAngle + pct * Math.PI
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle)
    return (
      <div className="flex items-center justify-center w-full h-full">
        <svg width="100%" height="100%" viewBox="0 0 112 68" preserveAspectRatio="xMidYMid meet">
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none" stroke="#E5E7EB" strokeWidth="8" strokeLinecap="round" />
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
            fill="none" stroke="#7C3AED" strokeWidth="8" strokeLinecap="round" />
          <text x={cx} y={cy - 4} textAnchor="middle"
            style={{ fontSize: 12, fontWeight: 700, fill: '#1F2937', fontFamily: 'system-ui' }}>
            {visual.mockValue ?? '72%'}
          </text>
        </svg>
      </div>
    )
  }

  if (t === 'slicer') {
    return (
      <div className="flex flex-wrap items-center gap-1 w-full content-center h-full"
        style={{ padding: Math.max(4, 8 * scale) }}>
        {['(All)', 'A', 'B', 'C'].map((c, i) => (
          <span key={c} style={{
            padding: `${Math.max(1, 2 * scale)}px ${Math.max(4, 8 * scale)}px`,
            fontSize: Math.max(7, 10 * scale), borderRadius: 999, fontWeight: 500,
            border: '1px solid', borderColor: i === 0 ? '#0056B3' : '#D1D5DB',
            background: i === 0 ? '#0056B3' : '#fff',
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
      <div className="flex items-end justify-center gap-1 w-full h-full"
        style={{ padding: `${Math.max(4, 8 * scale)}px ${Math.max(8, 16 * scale)}px ${Math.max(6, 10 * scale)}px` }}>
        {bars.map((p, i) => (
          <div key={i} style={{
            flex: 1, height: `${p * 100}%`,
            background: `hsl(${189 + i * 8}, 60%, ${38 + i * 5}%)`,
            borderRadius: '2px 2px 0 0',
          }} />
        ))}
      </div>
    )
  }

  if (['linechart', 'areachart', 'stackedareachart'].includes(t)) {
    const pts = [0.7, 0.45, 0.6, 0.3, 0.5, 0.2, 0.4, 0.35]
    const W = 180, H = 60
    const xStep = W / (pts.length - 1)
    const polyline = pts.map((p, i) => `${i * xStep},${p * H}`).join(' ')
    const areaPath = `M 0 ${pts[0] * H} ${pts.map((p, i) => `L ${i * xStep} ${p * H}`).join(' ')} L ${W} ${H} L 0 ${H} Z`
    return (
      <div className="flex items-center justify-center w-full h-full"
        style={{ padding: Math.max(4, 8 * scale) }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <path d={areaPath} fill="#EDF8FA" fillOpacity={0.6} />
          <polyline points={polyline} fill="none" stroke="#0D7F97" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  if (['donutchart', 'piechart'].includes(t)) {
    const sz = 80, r = sz / 2 - 4, cx = sz / 2, cy = sz / 2
    const segs = [{ pct: 0.45, color: '#0056B3' }, { pct: 0.3, color: '#0D7F97' }, { pct: 0.25, color: '#177B44' }]
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
      <div className="w-full h-full flex flex-col gap-px"
        style={{ padding: Math.max(4, 8 * scale) }}>
        <div style={{ height: Math.max(8, 14 * scale), background: '#E5E7EB', borderRadius: 2 }} />
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, minHeight: 0,
            background: i % 2 === 0 ? '#fff' : '#F9FAFB',
            borderRadius: 2, border: '1px solid #F3F4F6',
          }} />
        ))}
      </div>
    )
  }

  // Generic fallback
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-2">
      <VisualTypeIcon type={visual.type} size={Math.max(16, 24 * scale)} />
      <span style={{ fontSize: Math.max(7, 10 * scale), fontWeight: 500, color: '#6B7280' }}>
        {displayLabel(visual.type)}
      </span>
    </div>
  )
}

// ── Absolutely-positioned visual box ──────────────────────────────────────────

interface VisualBoxProps {
  visual: MockVisual
  scale: number
  pageW: number
  index: number
  onClick: () => void
}

// Minimum rendered size (before scale) to avoid unreadably tiny boxes
const MIN_W = 80
const MIN_H = 50

// Fallback grid placement for visuals with no layout data
function fallbackRect(index: number, pageW: number) {
  const cols = 4
  const pad  = 10
  const cellW = Math.floor((pageW - pad * (cols + 1)) / cols)
  const cellH = 120
  const col   = index % cols
  const row   = Math.floor(index / cols)
  return {
    x: pad + col * (cellW + pad),
    y: pad + row * (cellH + pad),
    width: cellW,
    height: cellH,
  }
}

function VisualBox({ visual, scale, pageW, index, onClick }: VisualBoxProps) {
  const [hovered, setHovered] = useState(false)

  const hasLayout = (
    visual.x !== undefined && visual.y !== undefined &&
    visual.width !== undefined && visual.height !== undefined &&
    visual.width > 0 && visual.height > 0
  )

  if (!hasLayout) {
    // Warn once per visual, not on every render
    console.warn(
      `[VisualGrid] No layout data for visual "${visual.title}" (id: ${visual.id}) — using fallback position.`,
    )
  }

  const rawSlot = hasLayout
    ? { x: visual.x!, y: visual.y!, width: visual.width!, height: visual.height! }
    : fallbackRect(index, pageW)

  // Apply gutter inset to add breathing room between adjacent visuals.
  // Fallback rects already have explicit padding baked in, so skip guttering them.
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

  // Header height scales with the box
  const headerH = Math.max(20, Math.min(28, height * 0.22))
  const iconSize = Math.max(9, Math.min(13, headerH * 0.48))
  const chipFontSize = Math.max(7, Math.min(10, headerH * 0.40))
  const showFooter = height > 70
  const footerH = showFooter ? Math.max(16, Math.min(22, height * 0.15)) : 0
  const previewH = height - headerH - footerH

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
        left,
        top,
        width,
        height,
        background: '#FFFFFF',
        border: `1px solid ${hovered ? 'rgba(0,86,179,0.35)' : '#E5E7EB'}`,
        borderRadius: Math.max(4, 8 * scale),
        boxShadow: hovered
          ? '0 4px 16px rgba(0,86,179,0.14), 0 1px 4px rgba(0,0,0,0.06)'
          : '0 1px 4px rgba(0,0,0,0.08)',
        transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        // z-index from data or default stack by index
        zIndex: hovered ? 999 : (index + 1),
      }}
    >
      {/* Header: icon + type chip + field count */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: Math.max(3, 6 * scale),
        padding: `${Math.max(3, 6 * scale)}px ${Math.max(5, 9 * scale)}px`,
        borderBottom: '1px solid #F3F4F6',
        flexShrink: 0,
        height: headerH,
        overflow: 'hidden',
      }}>
        <VisualTypeIcon type={visual.type} size={iconSize} />
        <span style={{
          padding: `1px ${Math.max(4, 6 * scale)}px`, borderRadius: 999,
          fontSize: chipFontSize, fontWeight: 600,
          background: chip.bg, color: chip.color,
          lineHeight: '14px', whiteSpace: 'nowrap',
          letterSpacing: '0.01em', flexShrink: 0,
        }}>
          {label}
        </span>
        {visual.fields && visual.fields.length > 0 && width > 100 && (
          <span style={{
            marginLeft: 'auto', fontSize: chipFontSize,
            color: '#9CA3AF', whiteSpace: 'nowrap',
          }}>
            {visual.fields.length}f
          </span>
        )}
      </div>

      {/* Preview area */}
      <div style={{
        background: '#F9FAFB',
        height: previewH,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <MiniPreview visual={visual} scale={scale} />
      </div>

      {/* Footer: visual name (only if tall enough) */}
      {showFooter && (
        <div style={{
          padding: `${Math.max(2, 5 * scale)}px ${Math.max(5, 9 * scale)}px`,
          borderTop: '1px solid #F3F4F6',
          flexShrink: 0,
          height: footerH,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
        }}>
          <p style={{
            fontSize: Math.max(8, 11 * scale), fontWeight: 600, color: '#1F2937',
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

// ── Main Grid Component ────────────────────────────────────────────────────────

interface VisualGridProps {
  page: MockPage
  onClickVisual: (visualId: string) => void
}

export default function VisualGrid({ page, onClickVisual }: VisualGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Measure container width and track resizes for responsive scaling
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
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-8"
        style={{ color: '#9CA3AF', minHeight: 300 }}>
        <Eye size={40} style={{ opacity: 0.25 }} />
        <p className="text-sm font-medium" style={{ color: '#6B7280' }}>No visuals on this page</p>
        <p className="text-xs" style={{ color: '#9CA3AF' }}>This page contains no visual elements.</p>
      </div>
    )
  }

  const pageW = page.page_width  ?? PBI_DEFAULT_W
  const pageH = page.page_height ?? PBI_DEFAULT_H

  // Single scale factor: fit the page width into the container (maintain aspect ratio)
  const scale = containerWidth > 0 ? containerWidth / pageW : 1
  const canvasH = pageH * scale

  return (
    // Outer scroll wrapper — page can still be taller than the visible area
    <div
      ref={containerRef}
      className="overflow-y-auto"
      style={{ background: '#F7F9FA', padding: '16px 16px 32px', minHeight: '100%' }}
      aria-label={`Report page: ${page.name}`}
    >
      {/* Canvas: sized exactly to the scaled page dimensions */}
      <div
        style={{
          position: 'relative',
          width: containerWidth > 0 ? containerWidth : '100%',
          height: canvasH || pageH, // fallback to un-scaled height while measuring
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {containerWidth > 0 && page.visuals.map((visual, i) => (
          <VisualBox
            key={visual.id}
            visual={visual}
            scale={scale}
            pageW={pageW}
            index={i}
            onClick={() => onClickVisual(visual.id)}
          />
        ))}
      </div>
    </div>
  )
}
