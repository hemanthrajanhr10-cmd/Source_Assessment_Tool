import { useState, useRef, useLayoutEffect, useCallback, useEffect, forwardRef } from 'react'
import {
  Hash, Calculator, Table2, BookOpen, Eye,
  Search, Network, AlertCircle, BarChart2, Code2, Copy, Check,
  Database, FolderOpen, ChevronDown,
} from 'lucide-react'
import type { FabricWorkspace, MeasureComplexity } from '../../types/api'

// ── Keyframes ──────────────────────────────────────────────────────────────────

const STYLES = `
@keyframes lgFadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes lgFadeLeft {
  from { opacity: 0; transform: translateX(-16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes lgFadeRight {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes lgScaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
`

// ── Types ──────────────────────────────────────────────────────────────────────

interface UsageEntry {
  reportId: string
  reportName: string
  pageName: string
  visualTitle: string
  visualType: string
}

interface LineageItem {
  key: string
  name: string
  table: string
  modelName: string
  workspaceName: string
  expression?: string
  complexity?: MeasureComplexity
  type: 'Measure' | 'Calc Column' | 'Calc Table'
  sourceType: 'model' | 'report-only'
  usages: UsageEntry[]
}

interface GroupedUsage {
  reportId: string
  reportName: string
  visualCount: number
  pageCount: number
}

// ── Data builder ───────────────────────────────────────────────────────────────

function buildLineageData(workspaces: FabricWorkspace[]): LineageItem[] {
  const items = new Map<string, LineageItem>()

  workspaces.forEach(ws => {
    ws.datasets.forEach(ds => {
      ds.measures.forEach(m => {
        const key = `${ws.name}||${ds.name}||${m.table}||${m.name}||measure`
        items.set(key, {
          key, name: m.name, table: m.table, modelName: ds.name,
          workspaceName: ws.name, expression: m.expression,
          complexity: m.complexity, type: 'Measure', sourceType: 'model', usages: [],
        })
      });
      (ds.calculated_columns || []).forEach(c => {
        const key = `${ws.name}||${ds.name}||${c.table}||${c.name}||calc_col`
        items.set(key, {
          key, name: c.name, table: c.table, modelName: ds.name,
          workspaceName: ws.name, expression: c.expression,
          complexity: c.complexity, type: 'Calc Column', sourceType: 'model', usages: [],
        })
      });
      (ds.calculated_tables || []).forEach(t => {
        const key = `${ws.name}||${ds.name}||${t.name}||${t.name}||calc_table`
        items.set(key, {
          key, name: t.name, table: t.name, modelName: ds.name,
          workspaceName: ws.name, expression: t.expression,
          complexity: t.complexity, type: 'Calc Table', sourceType: 'model', usages: [],
        })
      })
    })
  })

  workspaces.forEach(ws => {
    ws.reports.forEach(report => {
      report.pages.forEach(page => {
        page.visuals.forEach(visual => {
          visual.fields.forEach(field => {
            if (field.field_type !== 'measure' && field.field_type !== 'column') return
            const usage: UsageEntry = {
              reportId: report.id,
              reportName: report.name,
              pageName: page.name,
              visualTitle: visual.title || visual.type || 'Visual',
              visualType: visual.type,
            }
            let matched = false
            for (const [, item] of items) {
              if (
                item.workspaceName === ws.name &&
                item.name === field.name &&
                (item.table === field.table || !field.table) &&
                item.type === 'Measure' && field.field_type === 'measure'
              ) { item.usages.push(usage); matched = true; break }
              if (
                item.workspaceName === ws.name &&
                item.name === field.name &&
                item.table === field.table &&
                item.type === 'Calc Column' && field.field_type === 'column'
              ) { item.usages.push(usage); matched = true; break }
            }
            if (!matched && field.field_type === 'measure') {
              const key = `${ws.name}||report-only||${field.table || ''}||${field.name}||measure`
              if (items.has(key)) {
                items.get(key)!.usages.push(usage)
              } else {
                items.set(key, {
                  key, name: field.name, table: field.table || '',
                  modelName: 'Not in model catalog', workspaceName: ws.name,
                  expression: field.expression, complexity: field.complexity,
                  type: 'Measure', sourceType: 'report-only', usages: [usage],
                })
              }
            }
          })
        })
      })
    })
  })

  return Array.from(items.values())
}

function groupUsagesByReport(usages: UsageEntry[]): GroupedUsage[] {
  const byReport = new Map<string, { name: string; pages: Set<string>; visuals: number }>()
  usages.forEach(u => {
    if (!byReport.has(u.reportId)) byReport.set(u.reportId, { name: u.reportName, pages: new Set(), visuals: 0 })
    const r = byReport.get(u.reportId)!
    r.pages.add(u.pageName)
    r.visuals += 1
  })
  return Array.from(byReport.entries()).map(([id, { name, pages, visuals }]) => ({
    reportId: id, reportName: name, visualCount: visuals, pageCount: pages.size,
  }))
}

// ── Complexity badge ───────────────────────────────────────────────────────────

const COMPLEXITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  None:           { bg: 'rgba(148,163,184,0.10)', text: '#64748B', border: 'rgba(148,163,184,0.25)' },
  Simple:         { bg: 'rgba(5,150,105,0.08)',   text: '#047857', border: 'rgba(5,150,105,0.22)'  },
  Moderate:       { bg: 'rgba(217,119,6,0.08)',   text: '#B45309', border: 'rgba(217,119,6,0.22)'  },
  Complex:        { bg: 'rgba(234,88,12,0.08)',   text: '#C2410C', border: 'rgba(234,88,12,0.22)'  },
  'Very Complex': { bg: 'rgba(220,38,38,0.08)',   text: '#B91C1C', border: 'rgba(220,38,38,0.22)'  },
}

function ComplexityPill({ c }: { c: MeasureComplexity }) {
  const clr = COMPLEXITY_COLORS[c.level] ?? COMPLEXITY_COLORS.None
  if (c.score === 0) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 6px', borderRadius: 9999, fontSize: 9, fontWeight: 700,
      background: clr.bg, color: clr.text, border: `1px solid ${clr.border}`,
    }}>
      <BarChart2 size={8} />
      {c.level}
    </span>
  )
}

// ── Type meta ──────────────────────────────────────────────────────────────────

const TYPE_META = {
  Measure:       { icon: <Hash size={11} />,        color: '#0056B3', bg: 'rgba(0,86,179,0.09)',  border: 'rgba(0,86,179,0.22)'  },
  'Calc Column': { icon: <Calculator size={11} />,  color: '#B45309', bg: 'rgba(217,119,6,0.09)', border: 'rgba(217,119,6,0.22)' },
  'Calc Table':  { icon: <Table2 size={11} />,      color: '#C2410C', bg: 'rgba(234,88,12,0.09)', border: 'rgba(234,88,12,0.22)' },
} as const

// ── Workspace picker ───────────────────────────────────────────────────────────

function WorkspacePickerCard({
  workspace, onClick, animDelay,
}: { workspace: FabricWorkspace; onClick: () => void; animDelay: number }) {
  const [hov, setHov] = useState(false)
  const totalMeasures = workspace.datasets.reduce((s, ds) => s + ds.measure_count + (ds.calculated_column_count ?? 0), 0)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        padding: '18px 20px', borderRadius: 13,
        border: `1.5px solid ${hov ? 'rgba(0,86,179,0.42)' : 'rgba(197,213,236,0.7)'}`,
        background: hov ? 'rgba(0,86,179,0.035)' : 'white',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        boxShadow: hov
          ? '0 8px 28px rgba(0,86,179,0.11), 0 2px 8px rgba(0,86,179,0.07)'
          : '0 1px 4px rgba(0,0,0,0.05)',
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.42s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hov ? 'rgba(0,86,179,0.10)' : 'rgba(0,86,179,0.06)',
          border: '1px solid rgba(0,86,179,0.14)',
        }}>
          <FolderOpen size={17} style={{ color: '#0056B3' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.3 }}>
            {workspace.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94A3B8' }}>{workspace.type}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          { icon: <Database size={10} />, n: workspace.dataset_count, label: 'models' },
          { icon: <Network size={10} />,  n: totalMeasures,            label: 'calc items' },
          { icon: <BarChart2 size={10} />, n: workspace.report_count, label: 'reports' },
        ].map(({ icon, n, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#94A3B8' }}>{icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{n}</span>
            <span style={{ fontSize: 10, color: '#94A3B8' }}>{label}</span>
          </div>
        ))}
      </div>
    </button>
  )
}

// ── Measure card (left, ref-forwarded) ─────────────────────────────────────────

const MeasureCard = forwardRef<HTMLDivElement, {
  item: LineageItem
  isActive: boolean
  expanded: boolean
  onToggle: () => void
  animDelay: number
}>(function MeasureCard({ item, isActive, expanded, onToggle, animDelay }, ref) {
  const [hov, setHov] = useState(false)
  const meta = TYPE_META[item.type]
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item.expression) return
    navigator.clipboard.writeText(item.expression).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 11, overflow: 'hidden',
        border: `1.5px solid ${expanded ? 'rgba(0,86,179,0.38)' : hov ? 'rgba(0,86,179,0.32)' : 'rgba(197,213,236,0.7)'}`,
        background: expanded ? 'rgba(0,86,179,0.03)' : hov ? 'rgba(0,86,179,0.02)' : 'white',
        opacity: isActive ? 1 : 0.3,
        boxShadow: (hov || expanded)
          ? '0 4px 16px rgba(0,86,179,0.10), 0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
          : '0 1px 3px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
        transform: hov ? 'translateX(2px)' : 'translateX(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeLeft 0.46s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        position: 'relative', zIndex: 2, cursor: 'pointer',
      }}
      onClick={onToggle}
    >
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        {/* Type icon */}
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: meta.bg, border: `1px solid ${meta.border}`,
        }}>
          <span style={{ color: meta.color }}>{meta.icon}</span>
        </div>

        {/* Name + table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 12, fontWeight: 700, color: '#1E293B', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          }}>
            {item.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.table && item.table !== item.name ? `${item.table} · ` : ''}{item.modelName}
          </p>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          {item.complexity && <ComplexityPill c={item.complexity} />}
          {item.sourceType === 'report-only' && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#B45309',
              background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.22)',
              borderRadius: 4, padding: '1px 5px',
            }}>REPORT-ONLY</span>
          )}
        </div>

        <ChevronDown size={12} style={{
          color: '#94A3B8', flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.18s ease',
        }} />
      </div>

      {/* Expanded DAX expression */}
      {expanded && item.expression && (
        <div style={{
          padding: '0 12px 10px',
          borderTop: '1px solid rgba(197,213,236,0.4)',
          paddingTop: 8,
          animation: 'lgScaleIn 0.18s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: '#94A3B8',
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Code2 size={9} /> DAX
            </span>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                cursor: 'pointer', border: 'none',
                background: copied ? 'rgba(13,148,136,0.10)' : 'rgba(0,86,179,0.07)',
                color: copied ? '#0F766E' : '#0056B3',
              }}
            >
              {copied ? <><Check size={8} /> Copied!</> : <><Copy size={8} /> Copy</>}
            </button>
          </div>
          <pre style={{
            margin: 0, fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            padding: '6px 8px', borderRadius: 6, overflowX: 'auto',
            whiteSpace: 'pre-wrap', maxHeight: 100, color: '#334155',
            background: 'rgba(0,86,179,0.03)', border: '1px solid rgba(0,86,179,0.12)',
          }}>
            {item.expression}
          </pre>
        </div>
      )}
    </div>
  )
})

// ── Report usage card (right, ref-forwarded) ───────────────────────────────────

const ReportUsageCard = forwardRef<HTMLDivElement, {
  usage: GroupedUsage
  isActive: boolean
  animDelay: number
}>(function ReportUsageCard({ usage, isActive, animDelay }, ref) {
  const [hov, setHov] = useState(false)

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '8px 12px', borderRadius: 10,
        border: `1.5px solid ${hov ? 'rgba(0,86,179,0.45)' : 'rgba(197,213,236,0.65)'}`,
        background: hov ? 'rgba(0,86,179,0.03)' : 'white',
        opacity: isActive ? 1 : 0.28,
        boxShadow: hov
          ? '0 4px 14px rgba(0,86,179,0.10), 0 1px 3px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
          : '0 1px 3px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
        transform: hov ? 'translateX(3px)' : 'translateX(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeRight 0.46s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        display: 'flex', alignItems: 'center', gap: 9,
        position: 'relative', zIndex: 2,
      }}
    >
      <div style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hov ? 'rgba(0,86,179,0.10)' : 'rgba(0,86,179,0.06)',
        border: '1px solid rgba(0,86,179,0.14)',
        transition: 'background 0.2s ease',
      }}>
        <BarChart2 size={12} style={{ color: '#0056B3' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: '#1E293B', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {usage.reportName}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94A3B8' }}>
            <BookOpen size={9} />{usage.pageCount} {usage.pageCount === 1 ? 'page' : 'pages'}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94A3B8' }}>
            <Eye size={9} />{usage.visualCount} {usage.visualCount === 1 ? 'visual' : 'visuals'}
          </span>
        </div>
      </div>
    </div>
  )
})

// ── SVG path type ──────────────────────────────────────────────────────────────

interface SvgPath { d: string; pathId: string; arrowX: number; arrowY: number }

// ── Measure row — bipartite with SVG overlay ───────────────────────────────────

function MeasureRow({
  item,
  usages,
  isFiltered,
  expanded,
  onToggle,
  animDelay,
}: {
  item: LineageItem
  usages: GroupedUsage[]
  isFiltered: boolean
  expanded: boolean
  onToggle: () => void
  animDelay: number
}) {
  const rowRef        = useRef<HTMLDivElement>(null)
  const measureRef    = useRef<HTMLDivElement>(null)
  const reportRefs    = useRef<(HTMLDivElement | null)[]>([])
  const [svgPaths, setSvgPaths]   = useState<SvgPath[]>([])
  const [svgSize, setSvgSize]     = useState({ w: 0, h: 0 })
  const isUsed = usages.length > 0

  const computePaths = useCallback(() => {
    const row     = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return

    const rowRect = row.getBoundingClientRect()
    const mRect   = measure.getBoundingClientRect()
    const fromX   = mRect.right  - rowRect.left
    const fromY   = mRect.top + mRect.height / 2 - rowRect.top

    const paths: SvgPath[] = []
    reportRefs.current.forEach((el, i) => {
      if (!el || i >= usages.length) return
      const rRect = el.getBoundingClientRect()
      const toX   = rRect.left - rowRect.left
      const toY   = rRect.top + rRect.height / 2 - rowRect.top
      const dx    = Math.max(Math.abs(toX - fromX) * 0.40, 18)
      paths.push({
        d: `M ${fromX},${fromY} C ${fromX + dx},${fromY} ${toX - dx},${toY} ${toX},${toY}`,
        pathId: usages[i].reportId,
        arrowX: toX,
        arrowY: toY,
      })
    })

    setSvgPaths(paths)
    setSvgSize({ w: rowRect.width, h: rowRect.height })
  }, [usages])

  useLayoutEffect(() => {
    let raf1: number, raf2: number
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(computePaths) })
    const ro = new ResizeObserver(computePaths)
    if (rowRef.current) ro.observe(rowRef.current)
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); ro.disconnect() }
  }, [computePaths, expanded, usages.length])

  const ARROW_SIZE = 5

  return (
    <div
      ref={rowRef}
      style={{
        display: 'flex', alignItems: 'center', position: 'relative',
        opacity: isFiltered ? 0.22 : 1,
        transition: 'opacity 0.22s ease',
        animation: `lgFadeUp 0.44s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        minHeight: 52,
      }}
    >
      {/* Measure card — left column */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <MeasureCard
          ref={measureRef}
          item={item}
          isActive={!isFiltered}
          expanded={expanded}
          onToggle={onToggle}
          animDelay={0}
        />
      </div>

      {/* Gap for SVG */}
      <div style={{ width: 64, flexShrink: 0 }} />

      {/* Reports column — right */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isUsed ? usages.map((u, ri) => (
          <div key={u.reportId} ref={el => { reportRefs.current[ri] = el }}>
            <ReportUsageCard usage={u} isActive={!isFiltered} animDelay={ri * 30} />
          </div>
        )) : (
          <div style={{
            height: 44, display: 'flex', alignItems: 'center', paddingLeft: 4,
            animation: `lgFadeRight 0.46s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
          }}>
            <span style={{ fontSize: 11, color: '#CBD5E1', fontStyle: 'italic' }}>Unused</span>
          </div>
        )}
      </div>

      {/* Per-row SVG overlay */}
      <svg
        style={{
          position: 'absolute', left: 0, top: 0,
          width: svgSize.w || '100%', height: svgSize.h || '100%',
          overflow: 'visible', pointerEvents: 'none', zIndex: 1,
        }}
        aria-hidden="true"
      >
        {svgPaths.map(({ d, pathId, arrowX, arrowY }) => (
          <g key={pathId}>
            <path
              d={d} fill="none"
              stroke="rgba(0,86,179,0.28)" strokeWidth={1.5} strokeLinecap="round"
              style={{ transition: 'stroke 0.16s ease' }}
            />
            <polygon
              points={`
                ${arrowX - ARROW_SIZE * 1.4},${arrowY - ARROW_SIZE * 0.85}
                ${arrowX + 1},${arrowY}
                ${arrowX - ARROW_SIZE * 1.4},${arrowY + ARROW_SIZE * 0.85}
              `}
              fill="rgba(0,86,179,0.28)"
            />
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Column header label ────────────────────────────────────────────────────────

function ColLabel({ children, count }: { children: string; count?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      marginBottom: 14, paddingBottom: 9,
      borderBottom: '1px solid rgba(197,213,236,0.45)',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.07em',
        textTransform: 'uppercase', color: '#94A3B8',
      }}>{children}</span>
      {count !== undefined && (
        <span style={{
          fontSize: 10, fontWeight: 800, color: '#0056B3',
          background: 'rgba(0,86,179,0.08)', borderRadius: 10,
          padding: '1px 7px', border: '1px solid rgba(0,86,179,0.16)',
        }}>{count}</span>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function LineageTab({ workspaces }: { workspaces: FabricWorkspace[] }) {
  const [selectedWs, setSelectedWs]         = useState<FabricWorkspace | null>(
    workspaces.length === 1 ? workspaces[0] : null,
  )
  const [search, setSearch]                 = useState('')
  const [typeFilter, setTypeFilter]         = useState<'all' | 'Measure' | 'Calc Column' | 'Calc Table'>('all')
  const [usageFilter, setUsageFilter]       = useState<'all' | 'used' | 'unused' | 'report-only'>('all')
  const [expandedKeys, setExpandedKeys]     = useState<Set<string>>(new Set())

  // Reset filters on workspace change
  useEffect(() => {
    setSearch('')
    setTypeFilter('all')
    setUsageFilter('all')
    setExpandedKeys(new Set())
  }, [selectedWs?.id])

  const all = selectedWs ? buildLineageData([selectedWs]) : []

  const totalItems      = all.length
  const usedItems       = all.filter(x => x.usages.length > 0).length
  const unusedItems     = all.filter(x => x.usages.length === 0 && x.sourceType === 'model').length
  const reportOnlyItems = all.filter(x => x.sourceType === 'report-only').length

  const filtered = all.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (usageFilter === 'used'        && item.usages.length === 0) return false
    if (usageFilter === 'unused'      && (item.usages.length > 0 || item.sourceType === 'report-only')) return false
    if (usageFilter === 'report-only' && item.sourceType !== 'report-only') return false
    if (search) {
      const q = search.toLowerCase()
      if (!item.name.toLowerCase().includes(q) && !item.modelName.toLowerCase().includes(q) && !item.table.toLowerCase().includes(q)) return false
    }
    return true
  })

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── Workspace picker ──────────────────────────────────────────────────────────

  if (!selectedWs) {
    return (
      <div style={{ padding: '26px 0', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <style>{STYLES}</style>
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
            Select a workspace to explore measure lineage
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
            {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} · trace DAX usage across reports and visuals
          </p>
        </div>
        {workspaces.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
            {workspaces.map((ws, i) => (
              <WorkspacePickerCard key={ws.id} workspace={ws} onClick={() => setSelectedWs(ws)} animDelay={i * 40} />
            ))}
          </div>
        ) : (
          <p style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8', fontSize: 13 }}>
            No workspaces found in this assessment.
          </p>
        )}
      </div>
    )
  }

  // ── Graph canvas ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{STYLES}</style>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 0 14px',
        borderBottom: '1px solid rgba(197,213,236,0.55)',
        marginBottom: 18, flexWrap: 'wrap',
      }}>
        {/* Back to workspace picker (only when >1 workspace) */}
        {workspaces.length > 1 && (
          <button
            onClick={() => setSelectedWs(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
              background: 'rgba(0,86,179,0.06)', color: '#0056B3',
              border: '1px solid rgba(0,86,179,0.18)', cursor: 'pointer',
            }}
          >
            <FolderOpen size={11} /> {selectedWs.name}
          </button>
        )}

        {/* Stats pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Total',       value: totalItems,      color: '#0056B3', bg: 'rgba(0,86,179,0.08)',    border: 'rgba(0,86,179,0.18)' },
            { label: 'Used',        value: usedItems,       color: '#047857', bg: 'rgba(5,150,105,0.08)',   border: 'rgba(5,150,105,0.18)' },
            { label: 'Unused',      value: unusedItems,     color: '#94A3B8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.18)' },
            { label: 'Report-Only', value: reportOnlyItems, color: '#B45309', bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.18)' },
          ].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 20, fontSize: 11,
              background: s.bg, border: `1px solid ${s.border}`,
            }}>
              <span style={{ fontWeight: 800, color: s.color }}>{s.value}</span>
              <span style={{ color: s.color, opacity: 0.7 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 220, marginLeft: 'auto' }}>
          <Search size={12} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: '#94A3B8', pointerEvents: 'none',
          }} />
          <input
            style={{
              width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
              fontSize: 12, borderRadius: 8, outline: 'none',
              border: '1px solid rgba(197,213,236,0.8)', background: 'white', color: '#334155',
              boxSizing: 'border-box',
            }}
            placeholder="Search measures…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Filters row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Type filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'Measure', 'Calc Column', 'Calc Table'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', border: 'none',
              background: typeFilter === t ? '#0056B3' : 'rgba(0,86,179,0.06)',
              color: typeFilter === t ? '#fff' : '#0056B3',
            }}>
              {t === 'all' ? 'All Types' : t}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: 'rgba(197,213,236,0.7)' }} />
        {/* Usage filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([['all', 'All'], ['used', 'Used'], ['unused', 'Unused'], ['report-only', 'Report-Only']] as const).map(([val, lbl]) => (
            <button key={val} onClick={() => setUsageFilter(val)} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', border: 'none',
              background: usageFilter === val ? '#334155' : 'rgba(148,163,184,0.10)',
              color: usageFilter === val ? '#fff' : '#64748B',
            }}>
              {lbl}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94A3B8' }}>{filtered.length} items</span>
      </div>

      {/* ── Column headers ───────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', marginBottom: 4 }}>
          <div style={{ width: 240, flexShrink: 0 }}>
            <ColLabel count={filtered.length}>Calc Items</ColLabel>
          </div>
          <div style={{ width: 64, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <ColLabel>Reports Using This Item</ColLabel>
          </div>
        </div>
      )}

      {/* ── Bipartite rows ───────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '60px 0', gap: 12,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,86,179,0.06)', border: '1px solid rgba(0,86,179,0.12)',
          }}>
            <AlertCircle size={22} style={{ color: '#94A3B8' }} />
          </div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#64748B' }}>No items match your filters</p>
          <p style={{ margin: 0, fontSize: 11, color: '#94A3B8', textAlign: 'center', maxWidth: 280 }}>
            {search ? `No items found for "${search}".` : 'Try adjusting the type or usage filters.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((item, idx) => (
            <MeasureRow
              key={item.key}
              item={item}
              usages={groupUsagesByReport(item.usages)}
              isFiltered={false}
              expanded={expandedKeys.has(item.key)}
              onToggle={() => toggleExpand(item.key)}
              animDelay={Math.min(idx * 25, 300)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
