import React, { useState, useMemo, useCallback, startTransition } from 'react'
import {
  Hash, BarChart2, Database,
  FolderOpen, FileText, ChevronRight, Search, AlertCircle,
  BookOpen, Eye, Code2, Copy, Check, ArrowRight,
} from 'lucide-react'
import type { FabricWorkspace, FabricDataset, FabricReport, FabricMeasure, MeasureComplexity } from '../../types/api'

// ── Keyframes ──────────────────────────────────────────────────────────────────

const STYLES = `
@keyframes lgFadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes lgFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`

// ── Types ──────────────────────────────────────────────────────────────────────

interface ModelNode {
  dataset: FabricDataset
  reports: FabricReport[]
}

interface MeasureUsage {
  measure: FabricMeasure
  visualCount: number
  pageCount: number
}

// ── Complexity colors ──────────────────────────────────────────────────────────

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

// ── Column header ──────────────────────────────────────────────────────────────

function ColHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px 10px',
      borderBottom: '1.5px solid rgba(197,213,236,0.6)',
      background: 'rgba(248,250,252,0.9)',
      flexShrink: 0,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,86,179,0.08)', border: '1px solid rgba(0,86,179,0.15)',
      }}>
        <span style={{ color: '#0056B3' }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#334155',
          textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</p>
        {count !== undefined && (
          <p style={{ margin: 0, fontSize: 10, color: '#94A3B8' }}>{count} item{count !== 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  )
}

// ── Arrow connector between columns ───────────────────────────────────────────

function ColArrow({ label }: { label?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: 40, flexShrink: 0, gap: 4, paddingTop: 50,
    }}>
      <div style={{
        width: 1, flex: 1, background: 'linear-gradient(to bottom, transparent, rgba(0,86,179,0.2) 30%, rgba(0,86,179,0.2) 70%, transparent)',
        maxHeight: 80,
      }} />
      <ArrowRight size={16} style={{ color: 'rgba(0,86,179,0.35)', flexShrink: 0 }} />
      {label && <p style={{ margin: 0, fontSize: 9, color: '#94A3B8', textAlign: 'center',
        fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>}
      <div style={{
        width: 1, flex: 1, background: 'linear-gradient(to bottom, rgba(0,86,179,0.2), transparent)',
        maxHeight: 80,
      }} />
    </div>
  )
}

// ── Workspace card (Column 1) ──────────────────────────────────────────────────

function WorkspaceCol({ workspace }: { workspace: FabricWorkspace }) {
  return (
    <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
      border: '1.5px solid rgba(197,213,236,0.7)', borderRadius: 13, overflow: 'hidden',
      background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      animation: 'lgFadeUp 0.38s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <ColHeader icon={<FolderOpen size={14} />} title="Workspace" />
      <div style={{ padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,86,179,0.08)', border: '1px solid rgba(0,86,179,0.15)',
        }}>
          <FolderOpen size={20} style={{ color: '#0056B3' }} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.3 }}>
            {workspace.name}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94A3B8' }}>{workspace.type}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
          {[
            { icon: <Database size={11} />, label: 'Semantic Models', value: workspace.dataset_count },
            { icon: <FileText size={11} />, label: 'Reports', value: workspace.report_count },
          ].map(({ icon, label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748B' }}>
                <span style={{ color: '#94A3B8' }}>{icon}</span>{label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1E293B' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Semantic model card (Column 2) ────────────────────────────────────────────

function ModelCard({
  node, isSelected, isActive, onClick, animDelay,
}: {
  node: ModelNode
  isSelected: boolean
  isActive: boolean
  onClick: () => void
  animDelay: number
}) {
  const [hov, setHov] = useState(false)
  const ds = node.dataset
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 7,
        padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
        border: `1.5px solid ${isSelected ? 'rgba(0,86,179,0.5)' : hov ? 'rgba(0,86,179,0.3)' : 'rgba(197,213,236,0.7)'}`,
        background: isSelected ? 'rgba(0,86,179,0.06)' : hov ? 'rgba(0,86,179,0.03)' : 'white',
        boxShadow: isSelected
          ? '0 4px 16px rgba(0,86,179,0.14), inset 0 1px 0 rgba(255,255,255,0.9)'
          : '0 1px 3px rgba(0,0,0,0.04)',
        opacity: isActive ? 1 : 0.35,
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isSelected ? 'rgba(0,86,179,0.12)' : 'rgba(0,86,179,0.07)',
          border: '1px solid rgba(0,86,179,0.15)',
        }}>
          <Database size={13} style={{ color: '#0056B3' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1E293B', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ds.name}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: '#94A3B8' }}>
            {ds.measure_count}m · {ds.table_count}t · {node.reports.length} report{node.reports.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isSelected && <ChevronRight size={12} style={{ color: '#0056B3', flexShrink: 0 }} />}
      </div>
    </button>
  )
}

// ── Report card (Column 3) ─────────────────────────────────────────────────────

function ReportCard({
  report, isSelected, isActive, onClick, animDelay,
}: {
  report: FabricReport
  isSelected: boolean
  isActive: boolean
  onClick: () => void
  animDelay: number
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
        border: `1.5px solid ${isSelected ? 'rgba(13,148,136,0.5)' : hov ? 'rgba(13,148,136,0.28)' : 'rgba(197,213,236,0.7)'}`,
        background: isSelected ? 'rgba(13,148,136,0.05)' : hov ? 'rgba(13,148,136,0.02)' : 'white',
        boxShadow: isSelected
          ? '0 4px 16px rgba(13,148,136,0.12), inset 0 1px 0 rgba(255,255,255,0.9)'
          : '0 1px 3px rgba(0,0,0,0.04)',
        opacity: isActive ? 1 : 0.3,
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isSelected ? 'rgba(13,148,136,0.10)' : 'rgba(13,148,136,0.06)',
          border: '1px solid rgba(13,148,136,0.15)',
        }}>
          <BarChart2 size={13} style={{ color: '#0D9488' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1E293B', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {report.name}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94A3B8' }}>
              <BookOpen size={9} />{report.page_count ?? 0} pages
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94A3B8' }}>
              <Eye size={9} />{report.visual_count} visuals
            </span>
          </div>
        </div>
        {isSelected && <ChevronRight size={12} style={{ color: '#0D9488', flexShrink: 0 }} />}
      </div>
    </button>
  )
}

// ── Measure card (Column 4) ────────────────────────────────────────────────────

function MeasureCard({
  usage, animDelay,
}: { usage: MeasureUsage; animDelay: number }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const m = usage.measure

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!m.expression) return
    navigator.clipboard.writeText(m.expression).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      onClick={() => setExpanded(x => !x)}
      style={{
        borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
        border: `1.5px solid ${expanded ? 'rgba(139,92,246,0.42)' : 'rgba(197,213,236,0.7)'}`,
        background: expanded ? 'rgba(139,92,246,0.03)' : 'white',
        boxShadow: expanded
          ? '0 4px 14px rgba(139,92,246,0.10)'
          : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px' }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)',
        }}>
          <Hash size={12} style={{ color: '#7C3AED' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1E293B',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
            {m.name}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: '#94A3B8',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.table}
            </span>
            {usage.visualCount > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94A3B8' }}>
                <Eye size={9} />{usage.visualCount}
              </span>
            )}
          </div>
        </div>
        {m.complexity && <ComplexityPill c={m.complexity} />}
      </div>
      {expanded && m.expression && (
        <div style={{
          padding: '0 11px 10px', borderTop: '1px solid rgba(197,213,236,0.4)', paddingTop: 8,
          animation: 'lgFadeIn 0.16s ease both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8',
              textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Code2 size={9} /> DAX
            </span>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: copied ? 'rgba(13,148,136,0.10)' : 'rgba(139,92,246,0.08)',
                color: copied ? '#0F766E' : '#7C3AED',
              }}
            >
              {copied ? <><Check size={8} /> Copied!</> : <><Copy size={8} /> Copy</>}
            </button>
          </div>
          <pre style={{
            margin: 0, fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            padding: '6px 8px', borderRadius: 6, overflowX: 'auto',
            whiteSpace: 'pre-wrap', maxHeight: 100, color: '#334155',
            background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.14)',
          }}>
            {m.expression}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Unused measures card for "no model measures used" ─────────────────────────

function UnusedModelMeasureCard({ m, animDelay }: { m: FabricMeasure; animDelay: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      onClick={() => setExpanded(x => !x)}
      style={{
        borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
        border: `1.5px solid ${expanded ? 'rgba(148,163,184,0.45)' : 'rgba(197,213,236,0.6)'}`,
        background: expanded ? 'rgba(148,163,184,0.04)' : 'white',
        opacity: 0.65,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px' }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.22)',
        }}>
          <Hash size={12} style={{ color: '#94A3B8' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#64748B',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
            {m.name}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: '#94A3B8' }}>{m.table} · unused</p>
        </div>
        {m.complexity && <ComplexityPill c={m.complexity} />}
      </div>
      {expanded && m.expression && (
        <div style={{
          padding: '0 11px 10px', borderTop: '1px solid rgba(197,213,236,0.4)', paddingTop: 8,
          animation: 'lgFadeIn 0.16s ease both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8',
              textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Code2 size={9} /> DAX
            </span>
            <button
              onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(m.expression!).then(() => { }) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: 'rgba(148,163,184,0.10)', color: '#64748B',
              }}
            >
              <Copy size={8} /> Copy
            </button>
          </div>
          <pre style={{
            margin: 0, fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            padding: '6px 8px', borderRadius: 6, overflowX: 'auto',
            whiteSpace: 'pre-wrap', maxHeight: 100, color: '#475569',
            background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.20)',
          }}>
            {m.expression}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Scrollable column shell ────────────────────────────────────────────────────

function ColShell({
  children, width, accentColor, isEmpty, emptyMsg,
}: {
  children: React.ReactNode
  width: number
  accentColor?: string
  isEmpty?: boolean
  emptyMsg?: string
}) {
  return (
    <div style={{
      width, flexShrink: 0, display: 'flex', flexDirection: 'column',
      border: `1.5px solid ${accentColor ? `${accentColor}35` : 'rgba(197,213,236,0.7)'}`,
      borderRadius: 13, overflow: 'hidden',
      background: 'white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    }}>
      {isEmpty ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '40px 16px', gap: 8 }}>
          <AlertCircle size={20} style={{ color: '#CBD5E1' }} />
          <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>{emptyMsg}</p>
        </div>
      ) : (
        <div style={{ overflow: 'auto', flex: 1 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Workspace picker card (isolated component to allow useState) ───────────────

function WsPickerCard({ ws, onSelect, animDelay }: {
  ws: FabricWorkspace; onSelect: () => void; animDelay: number
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        padding: '18px 20px', borderRadius: 13,
        border: `1.5px solid ${hov ? 'rgba(0,86,179,0.42)' : 'rgba(197,213,236,0.7)'}`,
        background: hov ? 'rgba(0,86,179,0.035)' : 'white',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        boxShadow: hov ? '0 8px 28px rgba(0,86,179,0.11)' : '0 1px 4px rgba(0,0,0,0.05)',
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.42s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,86,179,0.07)', border: '1px solid rgba(0,86,179,0.14)',
        }}>
          <FolderOpen size={17} style={{ color: '#0056B3' }} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{ws.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94A3B8' }}>{ws.type}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          { icon: <Database size={10} />, n: ws.dataset_count, label: 'models' },
          { icon: <BarChart2 size={10} />, n: ws.report_count, label: 'reports' },
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

// ── Workspace picker (shown when >1 workspace) ─────────────────────────────────

function WorkspacePicker({
  workspaces, onSelect,
}: { workspaces: FabricWorkspace[]; onSelect: (ws: FabricWorkspace) => void }) {
  return (
    <div style={{ padding: '24px 0', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{STYLES}</style>
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
          Select a workspace to explore measure lineage
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
          {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} · trace DAX usage across reports and visuals
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {workspaces.map((ws, i) => (
          <WsPickerCard key={ws.id} ws={ws} onSelect={() => onSelect(ws)} animDelay={i * 40} />
        ))}
      </div>
    </div>
  )
}

// ── Data builder (memoized, O(n) with Map lookups) ────────────────────────────

function buildModelNodes(workspace: FabricWorkspace): ModelNode[] {
  // O(reports) — direct dataset_id lookup (no nested scanning)
  const reportsByDataset = new Map<string, FabricReport[]>()
  workspace.reports.forEach(r => {
    if (!reportsByDataset.has(r.dataset_id)) reportsByDataset.set(r.dataset_id, [])
    reportsByDataset.get(r.dataset_id)!.push(r)
  })
  return workspace.datasets.map(ds => ({
    dataset: ds,
    reports: reportsByDataset.get(ds.id) ?? [],
  }))
}

function getMeasuresUsedInReport(dataset: FabricDataset, report: FabricReport): MeasureUsage[] {
  // Build usage counts from the report in O(pages × visuals × fields)
  const visualCount = new Map<string, number>()
  const pageSet     = new Map<string, Set<string>>()

  for (const page of report.pages) {
    for (const visual of page.visuals) {
      for (const field of visual.fields) {
        if (field.field_type !== 'measure') continue
        visualCount.set(field.name, (visualCount.get(field.name) ?? 0) + 1)
        if (!pageSet.has(field.name)) pageSet.set(field.name, new Set())
        pageSet.get(field.name)!.add(page.name)
      }
    }
  }

  if (visualCount.size === 0) return []

  // Filter dataset measures by usage — O(measures)
  return dataset.measures
    .filter(m => visualCount.has(m.name))
    .map(m => ({
      measure: m,
      visualCount: visualCount.get(m.name) ?? 0,
      pageCount: pageSet.get(m.name)?.size ?? 0,
    }))
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function LineageTab({ workspaces }: { workspaces: FabricWorkspace[] }) {
  const [selectedWs, setSelectedWs]           = useState<FabricWorkspace | null>(
    workspaces.length === 1 ? workspaces[0] : null,
  )
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [search, setSearch]                   = useState('')
  const [measuresPage, setMeasuresPage]       = useState(40)

  // Reset selections when workspace changes
  const handleSelectWs = useCallback((ws: FabricWorkspace) => {
    setSelectedWs(ws)
    startTransition(() => {
      setSelectedModelId(null)
      setSelectedReportId(null)
      setSearch('')
      setMeasuresPage(40)
    })
  }, [])

  const handleSelectModel = useCallback((id: string) => {
    startTransition(() => {
      setSelectedModelId(prev => prev === id ? null : id)
      setSelectedReportId(null)
      setSearch('')
      setMeasuresPage(40)
    })
  }, [])

  const handleSelectReport = useCallback((id: string) => {
    startTransition(() => {
      setSelectedReportId(prev => prev === id ? null : id)
      setSearch('')
      setMeasuresPage(40)
    })
  }, [])

  // Workspace picker when >1 workspaces
  if (!selectedWs) {
    return <WorkspacePicker workspaces={workspaces} onSelect={handleSelectWs} />
  }

  // ── Memoized data (recomputed only when workspace changes) ──────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const modelNodes = useMemo(() => buildModelNodes(selectedWs), [selectedWs])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const selectedModel = useMemo(
    () => modelNodes.find(n => n.dataset.id === selectedModelId) ?? null,
    [modelNodes, selectedModelId],
  )

  const visibleReports = useMemo(
    () => selectedModel ? selectedModel.reports : selectedWs.reports,
    [selectedModel, selectedWs.reports],
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const selectedReport = useMemo(
    () => visibleReports.find(r => r.id === selectedReportId) ?? null,
    [visibleReports, selectedReportId],
  )

  // Measures used in selected report — expensive but only runs when both model + report selected
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const usedMeasures = useMemo(() => {
    if (!selectedModel || !selectedReport) return []
    return getMeasuresUsedInReport(selectedModel.dataset, selectedReport)
  }, [selectedModel, selectedReport])

  // Unused measures in selected model (not used in selected report)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const unusedMeasures = useMemo(() => {
    if (!selectedModel) return []
    if (!selectedReport) return selectedModel.dataset.measures
    const usedNames = new Set(usedMeasures.map(u => u.measure.name))
    return selectedModel.dataset.measures.filter(m => !usedNames.has(m.name))
  }, [selectedModel, selectedReport, usedMeasures])

  // Search-filtered measures
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const filteredUsed = useMemo(() => {
    if (!search) return usedMeasures
    const q = search.toLowerCase()
    return usedMeasures.filter(u =>
      u.measure.name.toLowerCase().includes(q) || u.measure.table.toLowerCase().includes(q),
    )
  }, [usedMeasures, search])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const filteredUnused = useMemo(() => {
    if (!search) return unusedMeasures
    const q = search.toLowerCase()
    return unusedMeasures.filter(m =>
      m.name.toLowerCase().includes(q) || m.table.toLowerCase().includes(q),
    )
  }, [unusedMeasures, search])

  const allFiltered = [...filteredUsed.map(u => ({ type: 'used' as const, data: u })),
                       ...filteredUnused.map(m => ({ type: 'unused' as const, data: m }))]

  const colHeight = 520

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{STYLES}</style>

      {/* ── Breadcrumb / back button ───────────────────────────────────────── */}
      {workspaces.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <button
            onClick={() => { setSelectedWs(null); setSelectedModelId(null); setSelectedReportId(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
              background: 'rgba(0,86,179,0.06)', color: '#0056B3',
              border: '1px solid rgba(0,86,179,0.18)', cursor: 'pointer',
            }}
          >
            <FolderOpen size={11} /> {selectedWs.name}
          </button>
        </div>
      )}

      {/* ── Flow header ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 18, padding: '8px 14px',
        background: 'rgba(0,86,179,0.03)', borderRadius: 10,
        border: '1px solid rgba(0,86,179,0.10)',
      }}>
        {[
          { icon: <FolderOpen size={11} />, label: 'Workspace', active: true },
          { icon: <Database size={11} />,   label: 'Semantic Model', active: !!selectedModel },
          { icon: <BarChart2 size={11} />,  label: 'Reports', active: !!selectedReport },
          { icon: <Hash size={11} />,       label: 'Measures', active: !!selectedReport },
        ].map((step, i) => (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <ArrowRight size={12} style={{ color: 'rgba(0,86,179,0.3)', flexShrink: 0 }} />
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 20,
              background: step.active ? 'rgba(0,86,179,0.09)' : 'transparent',
              border: step.active ? '1px solid rgba(0,86,179,0.22)' : '1px solid transparent',
              transition: 'all 0.2s ease',
            }}>
              <span style={{ color: step.active ? '#0056B3' : '#94A3B8' }}>{step.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: step.active ? '#0056B3' : '#94A3B8' }}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* ── 4-column flow ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>

        {/* Column 1: Workspace */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ height: colHeight, display: 'flex', alignItems: 'stretch' }}>
            <WorkspaceCol workspace={selectedWs} />
          </div>
        </div>

        <ColArrow label="contains" />

        {/* Column 2: Semantic Models */}
        <ColShell width={220} accentColor="rgba(0,86,179)">
          <ColHeader
            icon={<Database size={14} />}
            title="Semantic Models"
            count={modelNodes.length}
          />
          <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 6,
            height: colHeight - 54, overflowY: 'auto' }}>
            {modelNodes.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', padding: '40px 0' }}>
                No semantic models found
              </p>
            ) : modelNodes.map((node, i) => (
              <ModelCard
                key={node.dataset.id}
                node={node}
                isSelected={selectedModelId === node.dataset.id}
                isActive={!selectedModelId || selectedModelId === node.dataset.id}
                onClick={() => handleSelectModel(node.dataset.id)}
                animDelay={i * 35}
              />
            ))}
          </div>
        </ColShell>

        <ColArrow label="used by" />

        {/* Column 3: Reports */}
        <ColShell
          width={230}
          accentColor="rgba(13,148,136)"
          isEmpty={visibleReports.length === 0}
          emptyMsg={selectedModel ? 'No reports use this model' : 'Select a model to filter reports'}
        >
          <ColHeader
            icon={<BarChart2 size={14} />}
            title="Reports"
            count={visibleReports.length}
          />
          <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 6,
            height: colHeight - 54, overflowY: 'auto' }}>
            {!selectedModel && (
              <div style={{
                padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                background: 'rgba(13,148,136,0.05)', border: '1px solid rgba(13,148,136,0.15)',
              }}>
                <p style={{ margin: 0, fontSize: 11, color: '#0D9488' }}>
                  Click a Semantic Model to filter reports
                </p>
              </div>
            )}
            {visibleReports.map((report, i) => (
              <ReportCard
                key={report.id}
                report={report}
                isSelected={selectedReportId === report.id}
                isActive={!selectedReportId || selectedReportId === report.id}
                onClick={() => handleSelectReport(report.id)}
                animDelay={i * 30}
              />
            ))}
          </div>
        </ColShell>

        <ColArrow label="uses" />

        {/* Column 4: Measures */}
        <ColShell
          width={260}
          accentColor="rgba(139,92,246)"
          isEmpty={!selectedReport && !selectedModel}
          emptyMsg="Select a Report to see its measures"
        >
          <ColHeader
            icon={<Hash size={14} />}
            title="Measures"
            count={selectedReport
              ? filteredUsed.length + filteredUnused.length
              : selectedModel
              ? selectedModel.dataset.measure_count
              : undefined}
          />
          {/* Search bar */}
          {(selectedReport || selectedModel) && (
            <div style={{ padding: '8px 10px 0', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={11} style={{
                  position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                  color: '#94A3B8', pointerEvents: 'none',
                }} />
                <input
                  style={{
                    width: '100%', paddingLeft: 28, paddingRight: 8, paddingTop: 6, paddingBottom: 6,
                    fontSize: 11, borderRadius: 7, outline: 'none', boxSizing: 'border-box',
                    border: '1px solid rgba(197,213,236,0.8)', background: 'white', color: '#334155',
                  }}
                  placeholder="Search measures…"
                  value={search}
                  onChange={e => startTransition(() => setSearch(e.target.value))}
                />
              </div>
            </div>
          )}
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5,
            height: colHeight - (selectedReport || selectedModel ? 110 : 54), overflowY: 'auto' }}>
            {!selectedModel && !selectedReport ? null
              : !selectedReport && selectedModel ? (
              // No report selected — show all measures from the selected model
              <>
                <p style={{ margin: '0 0 6px', fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
                  Select a report to see which measures it uses
                </p>
                {filteredUnused.slice(0, measuresPage).map((m, i) => (
                  <UnusedModelMeasureCard key={`${m.table}||${m.name}`} m={m} animDelay={i * 20} />
                ))}
                {filteredUnused.length > measuresPage && (
                  <button
                    onClick={() => setMeasuresPage(p => p + 40)}
                    style={{
                      padding: '7px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      background: 'rgba(148,163,184,0.08)', color: '#64748B',
                      border: '1px solid rgba(197,213,236,0.7)', cursor: 'pointer', marginTop: 4,
                    }}
                  >
                    Show {Math.min(40, filteredUnused.length - measuresPage)} more…
                  </button>
                )}
              </>
            ) : selectedReport ? (
              // Report selected — show used (highlighted) + unused (faded)
              <>
                {filteredUsed.length === 0 && filteredUnused.length === 0 ? (
                  <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', padding: '30px 0' }}>
                    {search ? `No measures match "${search}"` : 'No model measures used in this report'}
                  </p>
                ) : (
                  <>
                    {filteredUsed.length > 0 && (
                      <>
                        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#7C3AED',
                          textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Used in this report ({filteredUsed.length})
                        </p>
                        {filteredUsed.slice(0, measuresPage).map((u, i) => (
                          <MeasureCard key={`${u.measure.table}||${u.measure.name}`} usage={u} animDelay={i * 20} />
                        ))}
                      </>
                    )}
                    {filteredUnused.length > 0 && filteredUsed.length > 0 && (
                      <div style={{ height: 1, background: 'rgba(197,213,236,0.5)', margin: '4px 0' }} />
                    )}
                    {filteredUnused.length > 0 && (
                      <>
                        <p style={{ margin: '4px 0 4px', fontSize: 10, fontWeight: 700, color: '#94A3B8',
                          textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Unused in this report ({filteredUnused.length})
                        </p>
                        {filteredUnused.slice(0, Math.max(0, measuresPage - filteredUsed.length)).map((m, i) => (
                          <UnusedModelMeasureCard key={`${m.table}||${m.name}`} m={m} animDelay={i * 15} />
                        ))}
                      </>
                    )}
                    {allFiltered.length > measuresPage && (
                      <button
                        onClick={() => setMeasuresPage(p => p + 40)}
                        style={{
                          padding: '7px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                          background: 'rgba(139,92,246,0.06)', color: '#7C3AED',
                          border: '1px solid rgba(139,92,246,0.18)', cursor: 'pointer', marginTop: 4,
                        }}
                      >
                        Show more…
                      </button>
                    )}
                  </>
                )}
              </>
            ) : null}
          </div>
        </ColShell>
      </div>
    </div>
  )
}
