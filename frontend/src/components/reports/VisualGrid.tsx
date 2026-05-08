import { useRef, useEffect, useState } from 'react'
import {
  TrendingUp, BarChart2, Table2, Filter, Activity,
  PieChart, LayoutGrid, Type, Image as ImageIcon,
  ScatterChart, TrendingDown, Eye, ZoomIn,
} from 'lucide-react'
import type { MockPage, MockVisual } from '../../data/mockReports'

interface VisualGridProps {
  page: MockPage
  onClickVisual: (visualId: string) => void
}

// ── Visual type → icon (compact, for canvas tiles) ────────────────────────────

function canvasIcon(type: string, size = 14): React.ReactNode {
  const t = type.toLowerCase()
  const blue = '#0078D4'
  const gray = '#8A8886'
  if (t === 'slicer') return <Filter size={size} style={{ color: gray }} />
  if (['linechart', 'areachart', 'stackedareachart', 'line chart'].includes(t))
    return <Activity size={size} style={{ color: blue }} />
  if (['barchart', 'clusteredbarchart', 'stackedbarchart', 'columnchart',
       'clusteredcolumnchart', 'stackedcolumnchart', 'hundredpercentstackedcolumnchart',
       'hundredpercentstackedbarchart', 'bar chart', 'column chart',
       'lineclusteredcolumnchart'].includes(t))
    return <BarChart2 size={size} style={{ color: blue }} />
  if (['card', 'kpivisual', 'kpi', 'kpi card'].includes(t))
    return <TrendingUp size={size} style={{ color: blue }} />
  if (['tableex', 'table'].includes(t))
    return <Table2 size={size} style={{ color: blue }} />
  if (['matrix', 'pivottable'].includes(t))
    return <LayoutGrid size={size} style={{ color: blue }} />
  if (['donutchart', 'piechart', 'donut chart', 'pie chart'].includes(t))
    return <PieChart size={size} style={{ color: blue }} />
  if (['scatterchart'].includes(t))
    return <ScatterChart size={size} style={{ color: blue }} />
  if (['waterfallchart', 'funnelchart', 'ribbonchart', 'treemap'].includes(t))
    return <TrendingDown size={size} style={{ color: blue }} />
  if (['textbox'].includes(t))
    return <Type size={size} style={{ color: gray }} />
  if (['image'].includes(t))
    return <ImageIcon size={size} style={{ color: gray }} />
  if (['shape', 'basicshape'].includes(t))
    return <div style={{ width: size, height: size, border: `1.5px solid ${gray}`, borderRadius: 2 }} />
  return <Eye size={size} style={{ color: gray }} />
}

// ── Mini visual preview rendered inside each canvas tile ──────────────────────

function MiniChart({ type, mockValue, mockSubtitle, text_content, tileW, tileH }: {
  type: string
  mockValue?: string
  mockSubtitle?: string
  text_content?: string
  tileW: number
  tileH: number
}) {
  const t = type.toLowerCase()
  const bodyH = tileH - 24 // subtract title bar height

  // Text box / shape — just render the text
  if (['textbox', 'shape', 'basicshape'].includes(t)) {
    const text = text_content || mockValue || ''
    if (!text) return null
    return (
      <div
        className="flex items-start justify-start px-1 overflow-hidden"
        style={{ height: bodyH, lineHeight: '1.3' }}
      >
        <span style={{ fontSize: Math.max(8, Math.min(11, tileH / 8)), color: '#252423', wordBreak: 'break-word' }}>
          {text}
        </span>
      </div>
    )
  }

  // KPI / Card — big value
  if (['card', 'kpivisual', 'kpi', 'kpi card'].includes(t)) {
    const fontSize = Math.max(10, Math.min(20, tileH / 4))
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: bodyH }}>
        {mockValue && (
          <span style={{ fontSize, fontWeight: 700, color: '#252423', lineHeight: 1.1 }}>
            {mockValue}
          </span>
        )}
        {mockSubtitle && (
          <span style={{ fontSize: Math.max(7, fontSize * 0.55), color: '#107C10', marginTop: 2 }}>
            {mockSubtitle}
          </span>
        )}
      </div>
    )
  }

  // Slicer — pill chips
  if (t === 'slicer') {
    const chipH = Math.max(10, Math.min(14, bodyH * 0.55))
    return (
      <div className="flex items-center gap-1 flex-wrap px-1 overflow-hidden" style={{ height: bodyH }}>
        {['(All)', 'A', 'B', 'C'].map((c, i) => (
          <span key={c} style={{
            display: 'inline-block',
            padding: '1px 5px',
            fontSize: Math.max(7, chipH * 0.65),
            borderRadius: 999,
            border: '1px solid',
            borderColor: i === 0 ? '#0078D4' : '#C8C6C4',
            background: i === 0 ? '#0078D4' : '#fff',
            color: i === 0 ? '#fff' : '#605E5C',
          }}>{c}</span>
        ))}
      </div>
    )
  }

  // Bar chart — mini bars
  if (['barchart', 'clusteredbarchart', 'stackedbarchart', 'columnchart',
       'clusteredcolumnchart', 'stackedcolumnchart', 'hundredpercentstackedcolumnchart',
       'hundredpercentstackedbarchart', 'bar chart', 'column chart'].includes(t)) {
    const bars = [0.6, 0.85, 0.45, 0.9, 0.7]
    const barW = Math.max(3, (tileW - 10) / bars.length - 2)
    const availH = bodyH - 8
    return (
      <div className="flex items-end justify-center gap-0.5 px-1 overflow-hidden"
        style={{ height: bodyH, paddingBottom: 4 }}>
        {bars.map((p, i) => (
          <div key={i} style={{
            width: barW,
            height: Math.max(4, p * availH),
            background: '#0078D4',
            borderRadius: '1px 1px 0 0',
            opacity: 0.8 + i * 0.04,
          }} />
        ))}
      </div>
    )
  }

  // Line chart — SVG polyline
  if (['linechart', 'areachart', 'stackedareachart', 'line chart'].includes(t)) {
    const pts = [0.7, 0.45, 0.6, 0.3, 0.5, 0.2, 0.4, 0.35]
    const w = tileW - 6
    const h = bodyH - 6
    const xStep = w / (pts.length - 1)
    const polyline = pts.map((p, i) => `${i * xStep},${p * h}`).join(' ')
    return (
      <div className="flex items-center justify-center overflow-hidden" style={{ height: bodyH, padding: '3px 3px 3px 3px' }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
          <polyline points={polyline} fill="none" stroke="#0078D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  // Donut / Pie
  if (['donutchart', 'piechart', 'donut chart', 'pie chart'].includes(t)) {
    const r = Math.min(tileW, bodyH) / 2 - 4
    const cx = tileW / 2, cy = bodyH / 2
    const segs = [{ pct: 0.45, color: '#0078D4' }, { pct: 0.3, color: '#8764B8' }, { pct: 0.25, color: '#00B7C3' }]
    let angle = -Math.PI / 2
    const arcs = segs.map(s => {
      const a1 = angle
      const a2 = angle + s.pct * 2 * Math.PI
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
      angle = a2
      return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${s.pct > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`, color: s.color }
    })
    return (
      <div className="flex items-center justify-center overflow-hidden" style={{ height: bodyH }}>
        <svg width={tileW - 4} height={bodyH - 4}>
          {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} opacity={0.85} />)}
          {t === 'donutchart' || t === 'donut chart'
            ? <circle cx={cx} cy={cy} r={r * 0.5} fill="#fff" />
            : null}
        </svg>
      </div>
    )
  }

  // Table / Matrix — lines
  if (['tableex', 'table', 'matrix', 'pivottable'].includes(t)) {
    const rows = Math.min(4, Math.floor(bodyH / 10))
    return (
      <div className="flex flex-col gap-px px-1 overflow-hidden" style={{ height: bodyH, paddingTop: 2, paddingBottom: 2 }}>
        <div style={{ height: Math.max(6, bodyH / (rows + 1) - 2), background: '#F3F2F1', borderRadius: 1 }} />
        {Array.from({ length: Math.max(1, rows - 1) }).map((_, i) => (
          <div key={i} style={{ height: Math.max(5, bodyH / (rows + 1) - 2), background: i % 2 === 0 ? '#fff' : '#FAFAFA', borderRadius: 1, border: '1px solid #F3F2F1' }} />
        ))}
      </div>
    )
  }

  // Fallback — large icon centred
  return (
    <div className="flex items-center justify-center" style={{ height: bodyH }}>
      {canvasIcon(type, Math.max(16, Math.min(32, bodyH * 0.5)))}
    </div>
  )
}

// ── Canvas tile rendered at exact absolute position ───────────────────────────

function CanvasTile({ visual, scale, onClick }: {
  visual: MockVisual
  scale: number
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const t = visual.type.toLowerCase()
  const isTextLike = ['textbox', 'shape', 'basicshape'].includes(t)

  const tileW = Math.round((visual.width ?? 200) * scale)
  const tileH = Math.round((visual.height ?? 150) * scale)
  const titleFontSize = Math.max(7, Math.min(11, tileH / 10))
  const titleText = visual.title || visual.type

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${titleText} — click to inspect`}
      style={{
        position: 'absolute',
        left: Math.round((visual.x ?? 0) * scale),
        top: Math.round((visual.y ?? 0) * scale),
        width: tileW,
        height: tileH,
        background: '#FFFFFF',
        border: hovered ? '1.5px solid #0078D4' : '1px solid #E1DFDD',
        borderRadius: 2,
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: hovered ? '0 2px 8px rgba(0,120,212,0.18)' : '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'border-color 120ms, box-shadow 120ms',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Title bar */}
      {!isTextLike && (
        <div
          style={{
            height: 22,
            minHeight: 22,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '0 5px',
            borderBottom: '1px solid #F3F2F1',
          }}
        >
          {canvasIcon(visual.type, 10)}
          <span
            style={{
              fontSize: titleFontSize,
              fontWeight: 600,
              color: '#252423',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {titleText}
          </span>
          {hovered && (
            <ZoomIn size={9} style={{ color: '#0078D4', flexShrink: 0 }} />
          )}
        </div>
      )}

      {/* Visual body */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <MiniChart
          type={visual.type}
          mockValue={visual.mockValue}
          mockSubtitle={visual.mockSubtitle}
          text_content={visual.text_content}
          tileW={tileW}
          tileH={isTextLike ? tileH : tileH - 22}
        />
      </div>
    </div>
  )
}

// ── Main canvas component ─────────────────────────────────────────────────────

export default function VisualGrid({ page, onClickVisual }: VisualGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const pageW = page.page_width ?? 1280
  const pageH = page.page_height ?? 720

  // Recalculate scale whenever container width changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const compute = () => {
      const available = el.clientWidth - 32 // 16px padding each side
      setScale(Math.max(0.2, available / pageW))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pageW])

  const canvasW = Math.round(pageW * scale)
  const canvasH = Math.round(pageH * scale)

  return (
    // Outer scroll container — gray surround matching Fabric/PBI chrome
    <div
      ref={containerRef}
      className="overflow-auto"
      style={{ background: '#F3F2F1', padding: 16, minHeight: 300 }}
    >
      {/* White page canvas — exact scaled replica of the PBI canvas */}
      <div
        style={{
          position: 'relative',
          width: canvasW,
          height: canvasH,
          background: '#FFFFFF',
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          margin: '0 auto',
          flexShrink: 0,
        }}
        aria-label={`Report page: ${page.name}`}
      >
        {page.visuals.map(visual => (
          <CanvasTile
            key={visual.id}
            visual={visual}
            scale={scale}
            onClick={() => onClickVisual(visual.id)}
          />
        ))}

        {page.visuals.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2"
            style={{ color: '#8A8886' }}>
            <Eye size={32} style={{ opacity: 0.4 }} />
            <p className="text-sm">No visuals on this page</p>
          </div>
        )}
      </div>
    </div>
  )
}
