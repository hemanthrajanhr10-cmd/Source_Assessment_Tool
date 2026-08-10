import {
  useState, useRef, useEffect, useLayoutEffect, useCallback,
  forwardRef,
} from 'react'
import {
  Database, BarChart2, FolderOpen, Search, X,
  FileText, Link2Off, Layers, ChevronDown,
} from 'lucide-react'
import type { FabricWorkspace, FabricDataset, FabricReport } from '../../types/api'

// ── Keyframes ─────────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModelGroup {
  modelId: string
  dataset: FabricDataset | null
  reports: FabricReport[]
}

export interface LineageExplorerProps {
  workspaces: FabricWorkspace[]
  selectedWorkspace: FabricWorkspace | null
  onWorkspaceSelect: (ws: FabricWorkspace | null) => void
  onSelectReport: (reportId: string, workspaceName: string) => void
}

// ── Data ──────────────────────────────────────────────────────────────────────

function buildGroups(ws: FabricWorkspace): ModelGroup[] {
  const map = new Map<string, ModelGroup>()
  for (const ds of ws.datasets) {
    map.set(ds.id, { modelId: ds.id, dataset: ds, reports: [] })
  }
  const unlinked: FabricReport[] = []
  for (const r of ws.reports) {
    if (r.dataset_id && map.has(r.dataset_id)) {
      map.get(r.dataset_id)!.reports.push(r)
    } else {
      unlinked.push(r)
    }
  }
  const groups = Array.from(map.values())
  if (unlinked.length > 0) {
    groups.push({ modelId: '__unlinked__', dataset: null, reports: unlinked })
  }
  return groups
}

// ── Workspace picker cards ────────────────────────────────────────────────────

function WorkspacePickerCard({
  workspace, onClick, animDelay,
}: { workspace: FabricWorkspace; onClick: () => void; animDelay: number }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 14,
        padding: '20px 22px', borderRadius: 14,
        border: `1.5px solid ${hov ? 'rgba(108,189,181,0.55)' : 'rgba(197,213,236,0.7)'}`,
        background: hov ? 'rgba(108,189,181,0.04)' : 'white',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        boxShadow: hov
          ? '0 8px 28px rgba(108,189,181,0.16), 0 2px 8px rgba(108,189,181,0.10)'
          : '0 1px 4px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)',
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.42s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hov ? 'rgba(108,189,181,0.16)' : 'rgba(108,189,181,0.08)',
          border: '1px solid rgba(108,189,181,0.22)',
          transition: 'background 0.2s ease',
          boxShadow: hov ? '0 2px 8px rgba(108,189,181,0.18)' : 'none',
        }}>
          <FolderOpen size={18} style={{ color: '#6CBDB5' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.3 }}>
            {workspace.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94A3B8' }}>{workspace.type}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        {[
          { icon: <Database size={11} />, n: workspace.dataset_count, label: 'models' },
          { icon: <BarChart2 size={11} />, n: workspace.report_count, label: 'reports' },
        ].map(({ icon, n, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#94A3B8' }}>{icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{n}</span>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{label}</span>
          </div>
        ))}
      </div>
    </button>
  )
}

// ── Workspace node (canvas left column) ───────────────────────────────────────

function WorkspaceNode({ workspace }: { workspace: FabricWorkspace }) {
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 13,
      background: 'white',
      border: '2px solid rgba(108,189,181,0.30)',
      boxShadow: '0 2px 12px rgba(108,189,181,0.14), 0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
      animation: 'lgFadeLeft 0.44s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(108,189,181,0.12)', border: '1px solid rgba(108,189,181,0.24)',
          flexShrink: 0,
          boxShadow: '0 1px 4px rgba(108,189,181,0.14)',
        }}>
          <FolderOpen size={16} style={{ color: '#6CBDB5' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1E293B', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {workspace.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8' }}>{workspace.type}</p>
        </div>
      </div>
      <div style={{
        paddingTop: 10, borderTop: '1px solid rgba(197,213,236,0.45)',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {[
          { l: 'Semantic models', v: workspace.dataset_count },
          { l: 'Reports', v: workspace.report_count },
          { l: 'Paginated', v: workspace.paginated_report_count },
        ].map(({ l, v }) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{l}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Model card (per-row, ref-forwarded) ───────────────────────────────────────

const ModelCard = forwardRef<HTMLDivElement, {
  group: ModelGroup
  isActive: boolean
  isSelected: boolean
  hoveredReportId: string | null
  onHoverChange: (h: boolean) => void
  onClick: () => void
  animDelay: number
}>(function ModelCard({ group, isActive, isSelected, onHoverChange, onClick, animDelay }, ref) {
  const [hov, setHov] = useState(false)
  const ds = group.dataset
  const isUnlinked = ds === null

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => { setHov(true); onHoverChange(true) }}
      onMouseLeave={() => { setHov(false); onHoverChange(false) }}
      style={{
        padding: '12px 14px', borderRadius: 11, cursor: 'pointer',
        border: `1.5px solid ${
          isSelected ? '#D97706'
          : hov ? 'rgba(217,119,6,0.45)'
          : isUnlinked ? 'rgba(148,163,184,0.38)'
          : 'rgba(217,119,6,0.22)'}`,
        background: isSelected ? 'rgba(217,119,6,0.055)'
          : hov ? 'rgba(217,119,6,0.03)' : 'white',
        opacity: isActive ? 1 : 0.3,
        boxShadow: (hov || isSelected)
          ? '0 4px 14px rgba(217,119,6,0.14), 0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)'
          : '0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
        transform: hov ? 'translateX(2px)' : 'translateX(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeLeft 0.46s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        position: 'relative', zIndex: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isUnlinked ? 'rgba(148,163,184,0.12)' : 'rgba(217,119,6,0.10)',
          border: `1px solid ${isUnlinked ? 'rgba(148,163,184,0.28)' : 'rgba(217,119,6,0.22)'}`,
          boxShadow: (hov || isSelected) ? '0 1px 4px rgba(217,119,6,0.14)' : 'none',
        }}>
          {isUnlinked
            ? <Link2Off size={13} style={{ color: '#94A3B8' }} />
            : <Database size={13} style={{ color: '#D97706' }} />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: isUnlinked ? '#64748B' : '#1E293B', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {isUnlinked ? 'No linked model' : ds!.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8' }}>
            {isUnlinked
              ? `${group.reports.length} unlinked report${group.reports.length !== 1 ? 's' : ''}`
              : `${ds!.table_count} tables · ${ds!.measure_count} measures`}
          </p>
        </div>
        {!isUnlinked && (
          <ChevronDown size={12} style={{
            color: '#D97706', opacity: 0.7, flexShrink: 0,
            transform: isSelected ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }} />
        )}
      </div>

      {isSelected && ds && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid rgba(217,119,6,0.16)',
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
          animation: 'lgScaleIn 0.22s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          {[
            { label: 'Calc cols', value: ds.calculated_column_count },
            { label: 'Relations', value: ds.relationship_count },
            { label: 'Reports', value: group.reports.length },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1E293B' }}>{value}</p>
              <p style={{ margin: 0, fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

// ── Report card (per-row, ref-forwarded) ──────────────────────────────────────

const ReportCard = forwardRef<HTMLDivElement, {
  report: FabricReport
  isActive: boolean
  onHoverChange: (h: boolean) => void
  onClick: () => void
  animDelay: number
}>(function ReportCard({ report, isActive, onHoverChange, onClick, animDelay }, ref) {
  const [hov, setHov] = useState(false)

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => { setHov(true); onHoverChange(true) }}
      onMouseLeave={() => { setHov(false); onHoverChange(false) }}
      style={{
        padding: '9px 13px', borderRadius: 10, cursor: 'pointer',
        border: `1.5px solid ${hov ? 'rgba(108,189,181,0.55)' : 'rgba(197,213,236,0.65)'}`,
        background: hov ? 'rgba(108,189,181,0.04)' : 'white',
        opacity: isActive ? 1 : 0.28,
        boxShadow: hov
          ? '0 4px 16px rgba(108,189,181,0.18), 0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
          : '0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
        transform: hov ? 'translateX(3px)' : 'translateX(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeRight 0.46s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        display: 'flex', alignItems: 'center', gap: 10,
        position: 'relative', zIndex: 2,
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hov ? 'rgba(108,189,181,0.16)' : 'rgba(108,189,181,0.08)',
        border: '1px solid rgba(108,189,181,0.22)',
        transition: 'background 0.2s ease',
        boxShadow: hov ? '0 1px 4px rgba(108,189,181,0.18)' : 'none',
      }}>
        <BarChart2 size={13} style={{ color: '#6CBDB5' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: '#1E293B', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {report.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94A3B8' }}>
            <FileText size={9} />
            {report.page_count ?? 0} {(report.page_count ?? 0) === 1 ? 'page' : 'pages'}
          </span>
          {report.is_paginated && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#6366F1',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)',
              borderRadius: 4, padding: '1px 5px',
            }}>PAG</span>
          )}
        </div>
      </div>
      <span style={{
        fontSize: 9, fontWeight: 700, color: hov ? '#0F766E' : '#94A3B8',
        background: hov ? 'rgba(108,189,181,0.12)' : 'rgba(0,0,0,0.04)',
        border: `1px solid ${hov ? 'rgba(108,189,181,0.28)' : 'rgba(0,0,0,0.08)'}`,
        borderRadius: 5, padding: '2px 7px', flexShrink: 0,
        transition: 'all 0.15s ease',
        letterSpacing: '0.04em',
      }}>VIEW →</span>
    </div>
  )
})

// ── ModelGroupRow — owns its own SVG connections ──────────────────────────────

interface SvgPath {
  d: string
  reportId: string
  arrowX: number
  arrowY: number
}

function ModelGroupRow({
  group,
  isFiltered,
  isSelected,
  hoveredReport,
  hoveredModel,
  onModelClick,
  onModelHoverChange,
  onReportClick,
  onReportHoverChange,
  animDelay,
}: {
  group: ModelGroup
  isFiltered: boolean
  isSelected: boolean
  hoveredReport: string | null
  hoveredModel: string | null
  onModelClick: () => void
  onModelHoverChange: (h: boolean) => void
  onReportClick: (id: string) => void
  onReportHoverChange: (id: string | null) => void
  animDelay: number
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const modelCardRef = useRef<HTMLDivElement>(null)
  const reportCardRefs = useRef<(HTMLDivElement | null)[]>([])
  const [svgPaths, setSvgPaths] = useState<SvgPath[]>([])
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 })

  const computePaths = useCallback(() => {
    const row = rowRef.current
    const model = modelCardRef.current
    if (!row || !model) return

    const rowRect = row.getBoundingClientRect()
    const mRect = model.getBoundingClientRect()

    const fromX = mRect.right - rowRect.left
    const fromY = mRect.top + mRect.height / 2 - rowRect.top

    const paths: SvgPath[] = []
    reportCardRefs.current.forEach((el, i) => {
      if (!el || i >= group.reports.length) return
      const rRect = el.getBoundingClientRect()
      const toX = rRect.left - rowRect.left
      const toY = rRect.top + rRect.height / 2 - rowRect.top

      // Cubic bezier control points — 40% of horizontal gap
      const dx = Math.max(Math.abs(toX - fromX) * 0.40, 18)
      const cp1x = fromX + dx
      const cp2x = toX - dx

      paths.push({
        d: `M ${fromX},${fromY} C ${cp1x},${fromY} ${cp2x},${toY} ${toX},${toY}`,
        reportId: group.reports[i]?.id ?? `r${i}`,
        arrowX: toX,
        arrowY: toY,
      })
    })

    setSvgPaths(paths)
    setSvgSize({ w: rowRect.width, h: rowRect.height })
  }, [group.reports])

  useLayoutEffect(() => {
    // Double RAF: first to let React flush DOM, second for layout measurement
    let raf1: number
    let raf2: number
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(computePaths)
    })
    const ro = new ResizeObserver(computePaths)
    if (rowRef.current) ro.observe(rowRef.current)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      ro.disconnect()
    }
  }, [computePaths, isSelected, group.reports.length])

  const isModelActive = !isFiltered
  const ARROW_SIZE = 5

  return (
    <div
      ref={rowRef}
      style={{
        display: 'flex', alignItems: 'center', position: 'relative',
        opacity: isFiltered ? 0.22 : 1,
        transition: 'opacity 0.22s ease',
        animation: `lgFadeUp 0.44s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        minHeight: 56,
      }}
    >
      {/* Model card */}
      <div style={{ width: 222, flexShrink: 0 }}>
        <ModelCard
          ref={modelCardRef}
          group={group}
          isActive={isModelActive}
          isSelected={isSelected}
          hoveredReportId={hoveredReport}
          onHoverChange={onModelHoverChange}
          onClick={onModelClick}
          animDelay={0}
        />
      </div>

      {/* Gap — the SVG lives in absolute over this space + beyond */}
      <div style={{ width: 72, flexShrink: 0 }} />

      {/* Reports column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {group.reports.length > 0 ? group.reports.map((r, ri) => (
          <div key={r.id} ref={el => { reportCardRefs.current[ri] = el }}>
            <ReportCard
              report={r}
              isActive={
                isModelActive &&
                (hoveredModel === null || hoveredModel === group.modelId)
              }
              onHoverChange={h => onReportHoverChange(h ? r.id : null)}
              onClick={() => onReportClick(r.id)}
              animDelay={ri * 35}
            />
          </div>
        )) : (
          <div style={{
            height: 48, display: 'flex', alignItems: 'center', paddingLeft: 4,
          }}>
            <span style={{ fontSize: 11, color: '#CBD5E1', fontStyle: 'italic' }}>No reports</span>
          </div>
        )}
      </div>

      {/* Per-row SVG overlay — positioned absolute, z-index behind cards */}
      <svg
        style={{
          position: 'absolute', left: 0, top: 0,
          width: svgSize.w || '100%',
          height: svgSize.h || '100%',
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 1,
        }}
        aria-hidden="true"
      >
        {svgPaths.map(({ d, reportId, arrowX, arrowY }) => {
          const isHovModel = hoveredModel === group.modelId
          const isHovReport = hoveredReport === reportId
          const bright = isHovModel || isHovReport
          const stroke = bright ? 'rgba(108,189,181,0.90)' : 'rgba(108,189,181,0.35)'
          const sw = bright ? 2.2 : 1.5

          return (
            <g key={reportId}>
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={sw}
                strokeLinecap="round"
                style={{ transition: 'stroke 0.16s ease, stroke-width 0.16s ease' }}
              />
              {/* Arrowhead: filled polygon pointing right at path terminus */}
              <polygon
                points={`
                  ${arrowX - ARROW_SIZE * 1.4},${arrowY - ARROW_SIZE * 0.85}
                  ${arrowX + 1},${arrowY}
                  ${arrowX - ARROW_SIZE * 1.4},${arrowY + ARROW_SIZE * 0.85}
                `}
                fill={stroke}
                style={{ transition: 'fill 0.16s ease' }}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Column header ─────────────────────────────────────────────────────────────

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
          fontSize: 10, fontWeight: 800, color: '#0F766E',
          background: 'rgba(108,189,181,0.12)', borderRadius: 10,
          padding: '1px 7px', border: '1px solid rgba(108,189,181,0.28)',
        }}>{count}</span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LineageExplorer({
  workspaces,
  selectedWorkspace,
  onWorkspaceSelect,
  onSelectReport,
}: LineageExplorerProps) {
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null)
  const [hoveredReportId, setHoveredReportId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Reset when workspace changes
  useEffect(() => {
    setActiveModelId(null)
    setSearchQuery('')
    setHoveredModelId(null)
    setHoveredReportId(null)
  }, [selectedWorkspace?.id])

  const allGroups = selectedWorkspace ? buildGroups(selectedWorkspace) : []

  const filteredGroups = allGroups.map(g => ({
    ...g,
    reports: searchQuery.trim()
      ? g.reports.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : g.reports,
  })).filter(g => !searchQuery.trim() || g.reports.length > 0)

  const totalReports = filteredGroups.reduce((s, g) => s + g.reports.length, 0)

  // ── Workspace picker ────────────────────────────────────────────────────────

  if (!selectedWorkspace) {
    const totalM = workspaces.reduce((s, w) => s + w.dataset_count, 0)
    const totalR = workspaces.reduce((s, w) => s + w.report_count, 0)
    return (
      <div style={{ padding: '26px 30px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <style>{STYLES}</style>
        <div style={{ marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
            Select a workspace to explore its lineage
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
            {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} · {totalM} model{totalM !== 1 ? 's' : ''} · {totalR} report{totalR !== 1 ? 's' : ''}
          </p>
        </div>
        {workspaces.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {workspaces.map((ws, i) => (
              <WorkspacePickerCard key={ws.id} workspace={ws} onClick={() => onWorkspaceSelect(ws)} animDelay={i * 45} />
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

  // ── Lineage canvas ──────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{STYLES}</style>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 22px',
        borderBottom: '1px solid rgba(197,213,236,0.55)',
        background: 'linear-gradient(180deg, #F7FDFB 0%, #EFF9F7 100%)',
        flexShrink: 0,
      }}>
        <div style={{ position: 'relative', width: 264 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search reports…"
            style={{
              width: '100%', paddingLeft: 30, paddingRight: searchQuery ? 28 : 10,
              paddingTop: 6, paddingBottom: 6, fontSize: 12, borderRadius: 8,
              border: '1px solid rgba(197,213,236,0.8)', background: 'white',
              color: '#1E293B', outline: 'none', boxSizing: 'border-box',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = '#6CBDB5'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(108,189,181,0.18), 0 1px 2px rgba(0,0,0,0.04)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(197,213,236,0.8)'
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2, display: 'flex' }}>
              <X size={12} />
            </button>
          )}
        </div>

        {activeModelId && (
          <button
            onClick={() => setActiveModelId(null)}
            style={{
              fontSize: 11, fontWeight: 700, color: '#D97706',
              background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.22)',
              borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Clear filter
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 18 }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            <b style={{ color: '#475569' }}>{selectedWorkspace.dataset_count}</b> models
          </span>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            <b style={{ color: '#475569' }}>{totalReports}</b>{totalReports !== selectedWorkspace.report_count ? ` of ${selectedWorkspace.report_count}` : ''} reports
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div style={{
        flex: 1, overflow: 'auto', padding: 28,
        background: '#F4FBFA',
      }}>
        {filteredGroups.length > 0 ? (
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', minWidth: 700 }}>

            {/* Column 1: Workspace node */}
            <div style={{ flexShrink: 0, width: 196, paddingRight: 32 }}>
              <ColLabel>Workspace</ColLabel>
              <WorkspaceNode workspace={selectedWorkspace} />
            </div>

            {/* Trunk line — visual connector from workspace to model rows */}
            <div style={{ flexShrink: 0, width: 24, position: 'relative', alignSelf: 'stretch' }}>
              {/* Vertical trunk */}
              <div style={{
                position: 'absolute',
                left: 11, top: 38, bottom: 28,
                width: 2, borderRadius: 2,
                background: 'linear-gradient(to bottom, rgba(108,189,181,0.40) 0%, rgba(108,189,181,0.08) 100%)',
              }} />
            </div>

            {/* Columns 2+3: Model rows */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Column headers */}
              <div style={{ display: 'flex', gap: 0, marginBottom: 0 }}>
                <div style={{ width: 222, flexShrink: 0 }}>
                  <ColLabel count={filteredGroups.length}>Semantic Models</ColLabel>
                </div>
                <div style={{ width: 72, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <ColLabel count={totalReports}>Reports</ColLabel>
                </div>
              </div>

              {/* Model group rows — each owns its SVG connections */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
                {filteredGroups.map((g, gi) => (
                  <div key={g.modelId} style={{ position: 'relative' }}>
                    {/* Trunk nub connecting to this row */}
                    <div style={{
                      position: 'absolute',
                      left: -24, top: '50%', marginTop: -1,
                      width: 24, height: 2, borderRadius: 1,
                      background: 'rgba(108,189,181,0.30)',
                    }} />
                    {/* Dot on trunk */}
                    <div style={{
                      position: 'absolute',
                      left: -27, top: '50%', marginTop: -3,
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'rgba(108,189,181,0.55)',
                      border: '1.5px solid white',
                      boxShadow: '0 0 0 1px rgba(108,189,181,0.28)',
                    }} />

                    <ModelGroupRow
                      group={g}
                      isFiltered={activeModelId !== null && activeModelId !== g.modelId}
                      isSelected={activeModelId === g.modelId}
                      hoveredReport={hoveredReportId}
                      hoveredModel={hoveredModelId}
                      onModelClick={() => setActiveModelId(prev => prev === g.modelId ? null : g.modelId)}
                      onModelHoverChange={h => setHoveredModelId(h ? g.modelId : null)}
                      onReportClick={id => onSelectReport(id, selectedWorkspace.name)}
                      onReportHoverChange={setHoveredReportId}
                      animDelay={gi * 55}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Layers size={30} style={{ color: '#CBD5E1', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>
              {searchQuery ? `No reports match "${searchQuery}".` : 'No reports in this workspace.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  marginTop: 12, fontSize: 11, fontWeight: 700, color: '#0F766E',
                  background: 'rgba(108,189,181,0.10)', border: '1px solid rgba(108,189,181,0.28)',
                  borderRadius: 6, padding: '5px 14px', cursor: 'pointer',
                }}
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
