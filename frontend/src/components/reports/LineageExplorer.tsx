import { useState, useRef, useEffect, useCallback, forwardRef } from 'react'
import {
  Database, BarChart2, FolderOpen, Search, X,
  FileText, Link2Off, Layers,
} from 'lucide-react'
import type { FabricWorkspace, FabricDataset, FabricReport } from '../../types/api'

// ── Keyframes ─────────────────────────────────────────────────────────────────

const STYLES = `
@keyframes lineageFadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes lineageFadeLeft {
  from { opacity: 0; transform: translateX(-14px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes lineageFadeRight {
  from { opacity: 0; transform: translateX(14px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes lineageScaleIn {
  from { opacity: 0; transform: scale(0.94); }
  to   { opacity: 1; transform: scale(1); }
}
`

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModelGroup {
  modelId: string
  dataset: FabricDataset | null
  reports: FabricReport[]
}

interface Connection {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  modelId: string
  reportId: string
}

export interface LineageExplorerProps {
  workspaces: FabricWorkspace[]
  selectedWorkspace: FabricWorkspace | null
  onWorkspaceSelect: (ws: FabricWorkspace | null) => void
  onSelectReport: (reportId: string, workspaceName: string) => void
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function buildModelGroups(ws: FabricWorkspace): ModelGroup[] {
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

function getConnections(
  containerEl: HTMLElement,
  modelRefs: Map<string, HTMLElement>,
  reportRefs: Map<string, HTMLElement>,
): Connection[] {
  const rect = containerEl.getBoundingClientRect()
  const conns: Connection[] = []
  reportRefs.forEach((reportEl, key) => {
    const sep = key.indexOf('::')
    if (sep === -1) return
    const modelId = key.slice(0, sep)
    const reportId = key.slice(sep + 2)
    const modelEl = modelRefs.get(modelId)
    if (!modelEl) return
    const mR = modelEl.getBoundingClientRect()
    const rR = reportEl.getBoundingClientRect()
    conns.push({
      id: key,
      fromX: mR.right - rect.left,
      fromY: mR.top + mR.height / 2 - rect.top,
      toX: rR.left - rect.left,
      toY: rR.top + rR.height / 2 - rect.top,
      modelId,
      reportId,
    })
  })
  return conns
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColLabel({ children, count }: { children: string; count?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginBottom: 12, paddingBottom: 8,
      borderBottom: '1px solid rgba(197,213,236,0.5)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B' }}>
        {children}
      </span>
      {count !== undefined && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#0056B3',
          background: 'rgba(0,86,179,0.08)', borderRadius: 10,
          padding: '1px 7px', border: '1px solid rgba(0,86,179,0.15)',
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

function WorkspaceCard({ workspace, onClick, animDelay }: {
  workspace: FabricWorkspace
  onClick: () => void
  animDelay: number
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
        padding: '18px 20px', borderRadius: 14, border: '1.5px solid',
        borderColor: hovered ? 'rgba(0,86,179,0.4)' : 'rgba(197,213,236,0.7)',
        background: hovered ? 'rgba(0,86,179,0.04)' : 'white',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        boxShadow: hovered
          ? '0 6px 24px rgba(0,86,179,0.10), 0 2px 8px rgba(0,86,179,0.06)'
          : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
        animation: `lineageFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hovered ? 'rgba(0,86,179,0.10)' : 'rgba(0,86,179,0.06)',
          border: '1px solid rgba(0,86,179,0.14)',
          transition: 'background 0.2s ease',
        }}>
          <FolderOpen size={18} style={{ color: '#0056B3' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.3 }}>
            {workspace.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B' }}>
            {workspace.type}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, width: '100%' }}>
        <Pill icon={<Database size={11} />} value={workspace.dataset_count} label="models" />
        <Pill icon={<BarChart2 size={11} />} value={workspace.report_count} label="reports" />
      </div>
    </button>
  )
}

function Pill({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ color: '#94A3B8' }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{value}</span>
      <span style={{ fontSize: 11, color: '#94A3B8' }}>{label}</span>
    </div>
  )
}

function WorkspaceNodeCard({ workspace }: { workspace: FabricWorkspace }) {
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 12,
      background: 'white', border: '2px solid rgba(0,86,179,0.2)',
      boxShadow: '0 2px 12px rgba(0,86,179,0.08)',
      animation: 'lineageFadeLeft 0.4s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,86,179,0.08)', border: '1px solid rgba(0,86,179,0.18)',
          flexShrink: 0,
        }}>
          <FolderOpen size={16} style={{ color: '#0056B3' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {workspace.name}
          </p>
          <p style={{ margin: '1px 0 0', fontSize: 10, color: '#64748B' }}>
            {workspace.type}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 10, borderTop: '1px solid rgba(197,213,236,0.5)' }}>
        <StatRow label="Semantic models" value={workspace.dataset_count} />
        <StatRow label="Reports" value={workspace.report_count} />
        <StatRow label="Paginated" value={workspace.paginated_report_count} />
      </div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#94A3B8' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{value}</span>
    </div>
  )
}

const ModelNodeCard = forwardRef<HTMLDivElement, {
  group: ModelGroup
  isActive: boolean
  isSelected: boolean
  onHoverChange: (h: boolean) => void
  onClick: () => void
  animDelay: number
}>(function ModelNodeCard({ group, isActive, isSelected, onHoverChange, onClick, animDelay }, ref) {
  const [hovered, setHovered] = useState(false)
  const ds = group.dataset
  const isUnlinked = ds === null

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => { setHovered(true); onHoverChange(true) }}
      onMouseLeave={() => { setHovered(false); onHoverChange(false) }}
      style={{
        padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
        border: '1.5px solid',
        borderColor: isSelected
          ? '#D97706'
          : hovered
            ? 'rgba(217,119,6,0.5)'
            : isUnlinked
              ? 'rgba(148,163,184,0.4)'
              : 'rgba(217,119,6,0.25)',
        background: isSelected
          ? 'rgba(217,119,6,0.06)'
          : hovered
            ? 'rgba(217,119,6,0.04)'
            : isUnlinked ? 'rgba(241,245,249,0.8)' : 'white',
        opacity: isActive ? 1 : 0.35,
        boxShadow: (hovered || isSelected) ? '0 3px 14px rgba(217,119,6,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateX(2px)' : 'translateX(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lineageFadeLeft 0.45s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isUnlinked ? 'rgba(148,163,184,0.12)' : 'rgba(217,119,6,0.10)',
          border: `1px solid ${isUnlinked ? 'rgba(148,163,184,0.3)' : 'rgba(217,119,6,0.22)'}`,
        }}>
          {isUnlinked
            ? <Link2Off size={14} style={{ color: '#94A3B8' }} />
            : <Database size={14} style={{ color: '#D97706' }} />
          }
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: isUnlinked ? '#64748B' : '#1E293B', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {isUnlinked ? 'No linked model' : ds!.name}
          </p>
          {ds && (
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8' }}>
              {ds.table_count} tables · {ds.measure_count} measures
            </p>
          )}
          {isUnlinked && (
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8' }}>
              {group.reports.length} unlinked report{group.reports.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
      {isSelected && (
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(217,119,6,0.18)',
          display: 'flex', gap: 8,
        }}>
          {ds && <MiniStat label="Calc cols" value={ds.calculated_column_count} />}
          {ds && <MiniStat label="Relations" value={ds.relationship_count} />}
          <MiniStat label="Reports" value={group.reports.length} />
        </div>
      )}
    </div>
  )
})

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1E293B' }}>{value}</p>
      <p style={{ margin: 0, fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
    </div>
  )
}

const ReportNodeCard = forwardRef<HTMLDivElement, {
  report: FabricReport
  isActive: boolean
  onHoverChange: (h: boolean) => void
  onClick: () => void
  animDelay: number
}>(function ReportNodeCard({ report, isActive, onHoverChange, onClick, animDelay }, ref) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => { setHovered(true); onHoverChange(true) }}
      onMouseLeave={() => { setHovered(false); onHoverChange(false) }}
      style={{
        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
        border: '1.5px solid',
        borderColor: hovered ? 'rgba(0,86,179,0.5)' : 'rgba(197,213,236,0.7)',
        background: hovered ? 'rgba(0,86,179,0.04)' : 'white',
        opacity: isActive ? 1 : 0.3,
        boxShadow: hovered
          ? '0 4px 16px rgba(0,86,179,0.12)'
          : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateX(3px)' : 'translateX(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lineageFadeRight 0.45s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hovered ? 'rgba(0,86,179,0.10)' : 'rgba(0,86,179,0.06)',
        border: '1px solid rgba(0,86,179,0.14)',
        transition: 'background 0.2s ease',
      }}>
        <BarChart2 size={13} style={{ color: '#0056B3' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: '#1E293B',
          lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {report.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{
            fontSize: 10, color: '#94A3B8',
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <FileText size={9} />
            {report.page_count ?? 0} {report.page_count === 1 ? 'page' : 'pages'}
          </span>
          {report.is_paginated && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#6366F1',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 4, padding: '1px 5px',
            }}>
              PAGINATED
            </span>
          )}
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#0056B3',
            background: 'rgba(0,86,179,0.07)', border: '1px solid rgba(0,86,179,0.15)',
            borderRadius: 4, padding: '1px 5px', marginLeft: 'auto',
          }}>
            VIEW →
          </span>
        </div>
      </div>
    </div>
  )
})

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
  const [connections, setConnections] = useState<Connection[]>([])
  const [connsVisible, setConnsVisible] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const modelRefs = useRef(new Map<string, HTMLElement>())
  const reportRefs = useRef(new Map<string, HTMLElement>())

  // Reset active model when workspace changes
  useEffect(() => {
    setActiveModelId(null)
    setSearchQuery('')
    setConnsVisible(false)
    modelRefs.current.clear()
    reportRefs.current.clear()
  }, [selectedWorkspace?.id])

  const allGroups = selectedWorkspace ? buildModelGroups(selectedWorkspace) : []

  const filteredGroups = allGroups.map(g => ({
    ...g,
    reports: searchQuery.trim()
      ? g.reports.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : g.reports,
  })).filter(g => !searchQuery.trim() || g.reports.length > 0)

  const recompute = useCallback(() => {
    if (!containerRef.current) return
    const conns = getConnections(containerRef.current, modelRefs.current, reportRefs.current)
    setConnections(conns)
    setTimeout(() => setConnsVisible(true), 80)
  }, [])

  useEffect(() => {
    if (!selectedWorkspace) { setConnsVisible(false); return }
    const id = requestAnimationFrame(() => setTimeout(recompute, 60))
    const ro = new ResizeObserver(recompute)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => { cancelAnimationFrame(id); ro.disconnect() }
  }, [selectedWorkspace, filteredGroups.length, recompute])

  // Re-run connections when search changes (node positions may shift)
  useEffect(() => {
    if (!selectedWorkspace) return
    setConnsVisible(false)
    const id = setTimeout(() => { recompute() }, 100)
    return () => clearTimeout(id)
  }, [searchQuery, activeModelId, recompute, selectedWorkspace])

  const getEdge = (modelId: string, reportId: string) => {
    const hovM = hoveredModelId === modelId
    const hovR = hoveredReportId === reportId
    const dimmed = activeModelId !== null && activeModelId !== modelId
    if (hovM || hovR) return { stroke: 'rgba(0,86,179,0.85)', width: 2.5, op: 1 }
    if (dimmed) return { stroke: 'rgba(0,86,179,0.06)', width: 1, op: 0.4 }
    return { stroke: 'rgba(0,86,179,0.3)', width: 1.5, op: 1 }
  }

  // ── Workspace picker ──────────────────────────────────────────────────────

  if (!selectedWorkspace) {
    const totalModels = workspaces.reduce((s, w) => s + w.dataset_count, 0)
    const totalReports = workspaces.reduce((s, w) => s + w.report_count, 0)

    return (
      <div style={{ padding: '24px 28px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <style>{STYLES}</style>
        <div style={{ marginBottom: 22 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
            Select a workspace to explore its lineage
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
            {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} · {totalModels} semantic model{totalModels !== 1 ? 's' : ''} · {totalReports} report{totalReports !== 1 ? 's' : ''}
          </p>
        </div>

        {workspaces.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {workspaces.map((ws, i) => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                onClick={() => onWorkspaceSelect(ws)}
                animDelay={i * 45}
              />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8', fontSize: 13 }}>
            No workspaces found in this assessment.
          </div>
        )}
      </div>
    )
  }

  // ── Lineage canvas ────────────────────────────────────────────────────────

  const totalVisible = filteredGroups.reduce((s, g) => s + g.reports.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{STYLES}</style>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px',
        borderBottom: '1px solid rgba(197,213,236,0.6)',
        background: 'linear-gradient(180deg, #F8FAFD 0%, #F0F5FC 100%)',
        flexShrink: 0,
      }}>
        <div style={{ position: 'relative', width: 260 }}>
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
              e.currentTarget.style.borderColor = '#0056B3'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,86,179,0.10)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(197,213,236,0.8)'
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: '#94A3B8' }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {activeModelId && (
          <button
            onClick={() => setActiveModelId(null)}
            style={{
              fontSize: 11, fontWeight: 700, color: '#D97706',
              background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.2)',
              borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
            }}
          >
            Clear filter
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>{selectedWorkspace.dataset_count}</span> models
          </span>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>{totalVisible}</span> of {selectedWorkspace.report_count} reports
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          flex: 1, overflow: 'auto', position: 'relative',
          background: 'oklch(0.987 0.005 240)',
          padding: 28, minHeight: 0,
        }}
      >
        {/* SVG connections overlay */}
        <svg
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'visible',
            opacity: connsVisible ? 1 : 0,
            transition: 'opacity 0.5s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <defs>
            <marker id="arrow-dim" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,1 L0,6 L6,3.5 z" fill="rgba(0,86,179,0.22)" />
            </marker>
            <marker id="arrow-active" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,1 L0,6 L6,3.5 z" fill="rgba(0,86,179,0.85)" />
            </marker>
          </defs>
          {connections.map(conn => {
            const { id, fromX, fromY, toX, toY, modelId, reportId } = conn
            const dx = Math.min(Math.abs(toX - fromX) * 0.42, 90)
            const edge = getEdge(modelId, reportId)
            const bright = edge.width > 1.5
            return (
              <path
                key={id}
                d={`M ${fromX},${fromY} C ${fromX + dx},${fromY} ${toX - dx},${toY} ${toX},${toY}`}
                fill="none"
                stroke={edge.stroke}
                strokeWidth={edge.width}
                opacity={edge.op}
                markerEnd={bright ? 'url(#arrow-active)' : 'url(#arrow-dim)'}
                style={{ transition: 'stroke 0.18s ease, stroke-width 0.15s ease, opacity 0.18s ease' }}
              />
            )
          })}
        </svg>

        {/* Three-column layout */}
        <div style={{
          display: 'flex', gap: 40, alignItems: 'flex-start',
          position: 'relative', zIndex: 1, minWidth: 680,
        }}>

          {/* Column 1: Workspace */}
          <div style={{ flexShrink: 0, width: 196 }}>
            <ColLabel>Workspace</ColLabel>
            <WorkspaceNodeCard workspace={selectedWorkspace} />
          </div>

          {/* Column 2: Semantic Models */}
          <div style={{ flexShrink: 0, width: 218 }}>
            <ColLabel count={filteredGroups.length}>Semantic Models</ColLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredGroups.length > 0 ? filteredGroups.map((g, i) => (
                <ModelNodeCard
                  key={g.modelId}
                  group={g}
                  isActive={activeModelId === null || activeModelId === g.modelId}
                  isSelected={activeModelId === g.modelId}
                  onHoverChange={h => setHoveredModelId(h ? g.modelId : null)}
                  onClick={() => setActiveModelId(prev => prev === g.modelId ? null : g.modelId)}
                  animDelay={i * 55}
                  ref={el => {
                    if (el) modelRefs.current.set(g.modelId, el)
                    else modelRefs.current.delete(g.modelId)
                  }}
                />
              )) : (
                <p style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>
                  {searchQuery ? 'No matches.' : 'No models found.'}
                </p>
              )}
            </div>
          </div>

          {/* Column 3: Reports */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <ColLabel count={totalVisible}>Reports</ColLabel>
            {totalVisible > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {filteredGroups.map((g, gi) => (
                  <div
                    key={g.modelId}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 6,
                      marginBottom: gi < filteredGroups.length - 1 ? 14 : 0,
                    }}
                  >
                    {g.reports.map((r, ri) => (
                      <ReportNodeCard
                        key={r.id}
                        report={r}
                        isActive={
                          (activeModelId === null || activeModelId === g.modelId) &&
                          (hoveredModelId === null || hoveredModelId === g.modelId)
                        }
                        onHoverChange={h => setHoveredReportId(h ? r.id : null)}
                        onClick={() => onSelectReport(r.id, selectedWorkspace.name)}
                        animDelay={(gi * 3 + ri) * 35}
                        ref={el => {
                          const key = `${g.modelId}::${r.id}`
                          if (el) reportRefs.current.set(key, el)
                          else reportRefs.current.delete(key)
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <Layers size={28} style={{ color: '#CBD5E1', margin: '0 auto 10px' }} />
                <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>
                  {searchQuery ? `No reports match "${searchQuery}".` : 'No reports in this workspace.'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      marginTop: 10, fontSize: 11, fontWeight: 700, color: '#0056B3',
                      background: 'rgba(0,86,179,0.07)', border: '1px solid rgba(0,86,179,0.18)',
                      borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
                    }}
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
