import React, { useState, useMemo, useCallback, startTransition } from 'react'
import {
  Hash, BarChart2, Database,
  FolderOpen, FileText, ChevronRight, Search, AlertCircle,
  BookOpen, Eye, Code2, Copy, Check, ArrowRight, Layers,
} from 'lucide-react'
import type { FabricWorkspace, FabricDataset, FabricReport, FabricMeasure, MeasureComplexity } from '../../types/api'

// ── Design tokens ──────────────────────────────────────────────────────────────

const T = {
  blue:   '#1D4ED8',
  teal:   '#0F766E',
  violet: '#6D28D9',
  slate:  '#3B5BDB',
  ink:    '#0F172A',
  ink2:   '#1E293B',
  mid:    '#475569',
  muted:  '#64748B',
  dim:    '#94A3B8',
  border: 'rgba(203,213,225,0.7)',
  surfaceHover: 'rgba(248,250,252,0.9)',
  shadow:  '0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.04)',
  shadowMd: '0 4px 14px rgba(15,23,42,0.09), 0 1px 4px rgba(15,23,42,0.05)',
  shadowLg: '0 8px 28px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.06)',
}

// ── Keyframes ──────────────────────────────────────────────────────────────────

const STYLES = `
@keyframes lgFadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes lgFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes lgPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
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

// ── Complexity pills ───────────────────────────────────────────────────────────

const COMPLEXITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  None:           { bg: 'rgba(148,163,184,0.10)', text: '#64748B', border: 'rgba(148,163,184,0.25)' },
  Simple:         { bg: 'rgba(5,150,105,0.08)',   text: '#047857', border: 'rgba(5,150,105,0.22)'   },
  Moderate:       { bg: 'rgba(217,119,6,0.08)',   text: '#B45309', border: 'rgba(217,119,6,0.22)'   },
  Complex:        { bg: 'rgba(234,88,12,0.08)',   text: '#C2410C', border: 'rgba(234,88,12,0.22)'   },
  'Very Complex': { bg: 'rgba(220,38,38,0.08)',   text: '#B91C1C', border: 'rgba(220,38,38,0.22)'   },
}

function ComplexityPill({ c }: { c: MeasureComplexity }) {
  const clr = COMPLEXITY_COLORS[c.level] ?? COMPLEXITY_COLORS.None
  if (c.score === 0) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 9999, fontSize: 9.5, fontWeight: 700, flexShrink: 0,
      background: clr.bg, color: clr.text, border: `1px solid ${clr.border}`,
      letterSpacing: '0.02em',
    }}>
      <BarChart2 size={8} />
      {c.level}
    </span>
  )
}

// ── Column header ──────────────────────────────────────────────────────────────

function ColHeader({
  icon, title, count, accent,
}: { icon: React.ReactNode; title: string; count?: number; accent: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px 11px',
      borderBottom: `1px solid ${T.border}`,
      background: `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 100%)`,
      flexShrink: 0,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${accent}12`,
        border: `1px solid ${accent}28`,
        flexShrink: 0,
      }}>
        <span style={{ color: accent, display: 'flex' }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: T.muted,
          textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</p>
        {count !== undefined && (
          <p style={{ margin: '1px 0 0', fontSize: 11, fontWeight: 600, color: accent, letterSpacing: '0.01em' }}>
            {count} {count === 1 ? 'item' : 'items'}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Column connector ───────────────────────────────────────────────────────────

function ColConnector({ label }: { label?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', width: 52, flexShrink: 0, gap: 0, alignSelf: 'stretch',
    }}>
      <div style={{
        flex: 1, width: 1,
        background: `linear-gradient(to bottom, transparent 0%, ${T.border} 25%, ${T.border} 75%, transparent 100%)`,
        backgroundRepeat: 'no-repeat',
      }} />
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, padding: '6px 0',
      }}>
        <ChevronRight size={15} style={{ color: T.dim }} />
        {label && (
          <span style={{ fontSize: 8.5, fontWeight: 700, color: T.dim,
            textTransform: 'uppercase', letterSpacing: '0.08em', writingMode: 'vertical-rl',
            transform: 'rotate(180deg)', lineHeight: 1 }}>
            {label}
          </span>
        )}
      </div>
      <div style={{
        flex: 1, width: 1,
        background: `linear-gradient(to bottom, ${T.border} 0%, ${T.border} 75%, transparent 100%)`,
      }} />
    </div>
  )
}

// ── Workspace anchor card ──────────────────────────────────────────────────────

function WorkspaceCol({ workspace }: { workspace: FabricWorkspace }) {
  return (
    <div style={{
      width: 224, flexShrink: 0, display: 'flex', flexDirection: 'column',
      border: `1.5px solid ${T.border}`, borderTop: `3px solid ${T.slate}`,
      borderRadius: '0 0 14px 14px', borderTopLeftRadius: 14, borderTopRightRadius: 14,
      overflow: 'hidden', background: 'white',
      boxShadow: T.shadowMd,
      animation: 'lgFadeUp 0.36s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      {/* Header strip */}
      <div style={{
        padding: '12px 16px 11px', borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(135deg, ${T.slate}0E 0%, ${T.slate}05 100%)`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${T.slate}14`, border: `1px solid ${T.slate}28`, flexShrink: 0,
        }}>
          <FolderOpen size={14} style={{ color: T.slate }} />
        </div>
        <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: T.muted,
          textTransform: 'uppercase', letterSpacing: '0.07em' }}>Workspace</p>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${T.slate}15 0%, ${T.slate}08 100%)`,
            border: `1.5px solid ${T.slate}22`,
          }}>
            <FolderOpen size={18} style={{ color: T.slate }} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: T.ink2, lineHeight: 1.3,
              wordBreak: 'break-word' }}>
              {workspace.name}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: T.dim, letterSpacing: '0.01em' }}>
              {workspace.type}
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}>
          {[
            { icon: <Database size={12} />, label: 'Models', value: workspace.dataset_count, accent: T.blue },
            { icon: <FileText size={12} />, label: 'Reports', value: workspace.report_count, accent: T.teal },
          ].map(({ icon, label, value, accent }) => (
            <div key={label} style={{
              display: 'flex', flexDirection: 'column', gap: 3,
              padding: '9px 10px', borderRadius: 9,
              background: `${accent}07`, border: `1px solid ${accent}1A`,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: accent }}>
                {icon}
              </span>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.ink2, lineHeight: 1 }}>{value}</p>
              <p style={{ margin: 0, fontSize: 10, color: T.muted, fontWeight: 500 }}>{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Scrollable column shell ────────────────────────────────────────────────────

const COL_HEIGHT = 540

function ColShell({
  children, width, accent, isEmpty, emptyMsg,
}: {
  children: React.ReactNode
  width: number
  accent: string
  isEmpty?: boolean
  emptyMsg?: string
}) {
  return (
    <div style={{
      width, height: COL_HEIGHT, flexShrink: 0, display: 'flex', flexDirection: 'column',
      border: `1.5px solid ${T.border}`, borderTop: `3px solid ${accent}`,
      borderRadius: '0 0 14px 14px', borderTopLeftRadius: 14, borderTopRightRadius: 14,
      overflow: 'hidden', background: 'white',
      boxShadow: T.shadowMd,
    }}>
      {isEmpty ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '36px 20px', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(148,163,184,0.09)', border: `1px solid ${T.border}`,
          }}>
            <AlertCircle size={16} style={{ color: T.dim }} />
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: T.muted, textAlign: 'center', lineHeight: 1.5 }}>
            {emptyMsg}
          </p>
        </div>
      ) : (
        <div style={{ overflow: 'auto', flex: 1 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Semantic model card ────────────────────────────────────────────────────────

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
  const active = isSelected || hov
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '12px 14px', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
        border: `1.5px solid ${isSelected ? `${T.blue}55` : hov ? `${T.blue}30` : T.border}`,
        background: isSelected ? `${T.blue}07` : hov ? `${T.blue}04` : 'white',
        boxShadow: isSelected ? T.shadowMd : active ? '0 3px 10px rgba(15,23,42,0.08)' : T.shadow,
        opacity: isActive ? 1 : 0.3,
        transform: active && !isSelected ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isSelected ? `${T.blue}14` : `${T.blue}09`,
          border: `1px solid ${T.blue}22`,
          transition: 'all 0.18s ease',
        }}>
          <Database size={13} style={{ color: T.blue }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: T.ink2, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ds.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 10.5, color: T.dim }}>
            {ds.measure_count}m · {ds.table_count}t · {node.reports.length}r
          </p>
        </div>
        {isSelected && (
          <ChevronRight size={13} style={{ color: T.blue, flexShrink: 0 }} />
        )}
      </div>
    </button>
  )
}

// ── Report card ────────────────────────────────────────────────────────────────

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
  const active = isSelected || hov
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '12px 14px', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
        border: `1.5px solid ${isSelected ? `${T.teal}55` : hov ? `${T.teal}30` : T.border}`,
        background: isSelected ? `${T.teal}07` : hov ? `${T.teal}03` : 'white',
        boxShadow: isSelected ? T.shadowMd : active ? '0 3px 10px rgba(15,23,42,0.08)' : T.shadow,
        opacity: isActive ? 1 : 0.3,
        transform: active && !isSelected ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isSelected ? `${T.teal}14` : `${T.teal}09`,
          border: `1px solid ${T.teal}22`,
          transition: 'all 0.18s ease',
        }}>
          <BarChart2 size={13} style={{ color: T.teal }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: T.ink2, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {report.name}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: T.dim }}>
              <BookOpen size={9} />{report.page_count ?? 0} pages
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: T.dim }}>
              <Eye size={9} />{report.visual_count} visuals
            </span>
          </div>
        </div>
        {isSelected && (
          <ChevronRight size={13} style={{ color: T.teal, flexShrink: 0 }} />
        )}
      </div>
    </button>
  )
}

// ── Measure card ───────────────────────────────────────────────────────────────

function MeasureCard({ usage, animDelay }: { usage: MeasureUsage; animDelay: number }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hov, setHov] = useState(false)
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
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 11, overflow: 'hidden', cursor: 'pointer',
        border: `1.5px solid ${expanded ? `${T.violet}45` : hov ? `${T.violet}25` : T.border}`,
        background: expanded ? `${T.violet}05` : hov ? `${T.violet}02` : 'white',
        boxShadow: expanded ? T.shadowMd : hov ? '0 3px 10px rgba(15,23,42,0.08)' : T.shadow,
        transform: hov && !expanded ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${T.violet}0D`, border: `1px solid ${T.violet}22`,
        }}>
          <Hash size={12} style={{ color: T.violet }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.ink2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", monospace' }}>
            {m.name}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 10.5, color: T.dim,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.table}
            </span>
            {usage.visualCount > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: T.violet,
                fontWeight: 600, flexShrink: 0 }}>
                <Eye size={8.5} />{usage.visualCount}
              </span>
            )}
          </div>
        </div>
        {m.complexity && <ComplexityPill c={m.complexity} />}
      </div>
      {expanded && m.expression && (
        <div style={{
          padding: '0 13px 12px', borderTop: `1px solid ${T.violet}18`, paddingTop: 10,
          animation: 'lgFadeIn 0.16s ease both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: T.dim,
              textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Code2 size={9} /> DAX Expression
            </span>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700, cursor: 'pointer',
                border: 'none', transition: 'all 0.15s ease',
                background: copied ? `${T.teal}12` : `${T.violet}0E`,
                color: copied ? T.teal : T.violet,
              }}
            >
              {copied ? <><Check size={8} /> Copied</> : <><Copy size={8} /> Copy</>}
            </button>
          </div>
          <pre style={{
            margin: 0, fontSize: 10.5, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", monospace',
            padding: '8px 10px', borderRadius: 7, overflowX: 'auto',
            whiteSpace: 'pre-wrap', maxHeight: 110, color: T.mid,
            background: `${T.violet}05`, border: `1px solid ${T.violet}16`,
            lineHeight: 1.55,
          }}>
            {m.expression}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Unused measure card ────────────────────────────────────────────────────────

function UnusedModelMeasureCard({ m, animDelay }: { m: FabricMeasure; animDelay: number }) {
  const [expanded, setExpanded] = useState(false)
  const [hov, setHov] = useState(false)

  return (
    <div
      onClick={() => setExpanded(x => !x)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 11, overflow: 'hidden', cursor: 'pointer',
        border: `1.5px solid ${expanded || hov ? 'rgba(148,163,184,0.45)' : T.border}`,
        background: expanded ? 'rgba(248,250,252,0.8)' : 'white',
        opacity: 0.62,
        boxShadow: T.shadow,
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.22)',
        }}>
          <Hash size={12} style={{ color: T.dim }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", monospace' }}>
            {m.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 10.5, color: T.dim }}>
            {m.table} · unused
          </p>
        </div>
        {m.complexity && <ComplexityPill c={m.complexity} />}
      </div>
      {expanded && m.expression && (
        <div style={{
          padding: '0 13px 12px', borderTop: '1px solid rgba(197,213,236,0.4)', paddingTop: 10,
          animation: 'lgFadeIn 0.16s ease both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: T.dim,
              textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Code2 size={9} /> DAX
            </span>
            <button
              onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(m.expression!).then(() => {}) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700, cursor: 'pointer',
                border: 'none', background: 'rgba(148,163,184,0.10)', color: T.muted,
              }}
            >
              <Copy size={8} /> Copy
            </button>
          </div>
          <pre style={{
            margin: 0, fontSize: 10.5, fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", monospace',
            padding: '8px 10px', borderRadius: 7, overflowX: 'auto',
            whiteSpace: 'pre-wrap', maxHeight: 110, color: T.mid,
            background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.18)',
            lineHeight: 1.55,
          }}>
            {m.expression}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Workspace picker card ──────────────────────────────────────────────────────

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
        display: 'flex', flexDirection: 'column', gap: 14,
        padding: '18px 20px', borderRadius: 14,
        border: `1.5px solid ${hov ? `${T.slate}45` : T.border}`,
        borderTop: `3px solid ${hov ? T.slate : T.border}`,
        background: hov ? `${T.slate}04` : 'white',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        boxShadow: hov ? T.shadowLg : T.shadowMd,
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.42s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${T.slate}10`, border: `1px solid ${T.slate}22`,
        }}>
          <FolderOpen size={17} style={{ color: T.slate }} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: T.ink2 }}>{ws.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.dim }}>{ws.type}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {[
          { icon: <Database size={11} />, n: ws.dataset_count, label: 'models', accent: T.blue },
          { icon: <BarChart2 size={11} />, n: ws.report_count, label: 'reports', accent: T.teal },
        ].map(({ icon, n, label, accent }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: accent }}>{icon}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink2 }}>{n}</span>
            <span style={{ fontSize: 10.5, color: T.muted }}>{label}</span>
          </div>
        ))}
      </div>
    </button>
  )
}

// ── Workspace picker ───────────────────────────────────────────────────────────

function WorkspacePicker({
  workspaces, onSelect,
}: { workspaces: FabricWorkspace[]; onSelect: (ws: FabricWorkspace) => void }) {
  return (
    <div style={{ padding: '20px 0', fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{STYLES}</style>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${T.slate}0F`, border: `1px solid ${T.slate}25`,
          }}>
            <Layers size={15} style={{ color: T.slate }} />
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink2 }}>
            Select a workspace
          </p>
        </div>
        <p style={{ margin: '0 0 0 42px', fontSize: 12.5, color: T.muted }}>
          {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} — trace DAX measure usage across reports and visuals
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {workspaces.map((ws, i) => (
          <WsPickerCard key={ws.id} ws={ws} onSelect={() => onSelect(ws)} animDelay={i * 45} />
        ))}
      </div>
    </div>
  )
}

// ── Data builders ──────────────────────────────────────────────────────────────

function buildModelNodes(workspace: FabricWorkspace): ModelNode[] {
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
  const [selectedWs, setSelectedWs]             = useState<FabricWorkspace | null>(
    workspaces.length === 1 ? workspaces[0] : null,
  )
  const [selectedModelId, setSelectedModelId]   = useState<string | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [search, setSearch]                     = useState('')
  const [measuresPage, setMeasuresPage]         = useState(40)

  const handleSelectWs = useCallback((ws: FabricWorkspace) => {
    setSelectedWs(ws)
    startTransition(() => {
      setSelectedModelId(null); setSelectedReportId(null)
      setSearch(''); setMeasuresPage(40)
    })
  }, [])

  const handleSelectModel = useCallback((id: string) => {
    startTransition(() => {
      setSelectedModelId(prev => prev === id ? null : id)
      setSelectedReportId(null); setSearch(''); setMeasuresPage(40)
    })
  }, [])

  const handleSelectReport = useCallback((id: string) => {
    startTransition(() => {
      setSelectedReportId(prev => prev === id ? null : id)
      setSearch(''); setMeasuresPage(40)
    })
  }, [])

  // All hooks must be unconditional (before any early return)

  const modelNodes = useMemo(
    () => selectedWs ? buildModelNodes(selectedWs) : [],
    [selectedWs],
  )
  const selectedModel = useMemo(
    () => modelNodes.find(n => n.dataset.id === selectedModelId) ?? null,
    [modelNodes, selectedModelId],
  )
  const visibleReports = useMemo(
    () => selectedModel ? selectedModel.reports : (selectedWs?.reports ?? []),
    [selectedModel, selectedWs],
  )
  const selectedReport = useMemo(
    () => visibleReports.find(r => r.id === selectedReportId) ?? null,
    [visibleReports, selectedReportId],
  )
  const usedMeasures = useMemo(() => {
    if (!selectedModel || !selectedReport) return []
    return getMeasuresUsedInReport(selectedModel.dataset, selectedReport)
  }, [selectedModel, selectedReport])

  const unusedMeasures = useMemo(() => {
    if (!selectedModel) return []
    if (!selectedReport) return selectedModel.dataset.measures
    const usedNames = new Set(usedMeasures.map(u => u.measure.name))
    return selectedModel.dataset.measures.filter(m => !usedNames.has(m.name))
  }, [selectedModel, selectedReport, usedMeasures])

  const filteredUsed = useMemo(() => {
    if (!search) return usedMeasures
    const q = search.toLowerCase()
    return usedMeasures.filter(u =>
      u.measure.name.toLowerCase().includes(q) || u.measure.table.toLowerCase().includes(q),
    )
  }, [usedMeasures, search])

  const filteredUnused = useMemo(() => {
    if (!search) return unusedMeasures
    const q = search.toLowerCase()
    return unusedMeasures.filter(m =>
      m.name.toLowerCase().includes(q) || m.table.toLowerCase().includes(q),
    )
  }, [unusedMeasures, search])

  const allFiltered = [
    ...filteredUsed.map(u => ({ type: 'used' as const, data: u })),
    ...filteredUnused.map(m => ({ type: 'unused' as const, data: m })),
  ]

  // Early return after all hooks
  if (!selectedWs) {
    return <WorkspacePicker workspaces={workspaces} onSelect={handleSelectWs} />
  }

  const steps = [
    { icon: <FolderOpen size={11} />, label: 'Workspace',      active: true            },
    { icon: <Database size={11} />,   label: 'Semantic Model', active: !!selectedModel },
    { icon: <BarChart2 size={11} />,  label: 'Report',         active: !!selectedReport },
    { icon: <Hash size={11} />,       label: 'Measures',       active: !!selectedReport },
  ]

  const accentForStep = [T.slate, T.blue, T.teal, T.violet]

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{STYLES}</style>

      {/* ── Flow stepper ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        marginBottom: 20, padding: '10px 16px',
        background: 'white',
        border: `1.5px solid ${T.border}`,
        borderRadius: 12,
        boxShadow: T.shadow,
      }}>
        {workspaces.length > 1 && (
          <>
            <button
              onClick={() => { setSelectedWs(null); setSelectedModelId(null); setSelectedReportId(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px 4px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                background: `${T.slate}0A`, color: T.slate,
                border: `1px solid ${T.slate}22`, cursor: 'pointer', marginRight: 14, flexShrink: 0,
              }}
            >
              <FolderOpen size={11} /> {selectedWs.name}
            </button>
            <ArrowRight size={12} style={{ color: T.dim, flexShrink: 0, marginRight: 14 }} />
          </>
        )}
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <ArrowRight size={11} style={{
                color: step.active ? T.dim : 'rgba(148,163,184,0.4)',
                flexShrink: 0, margin: '0 8px',
                transition: 'color 0.2s ease',
              }} />
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 20, flexShrink: 0,
              background: step.active ? `${accentForStep[i]}0D` : 'transparent',
              border: step.active ? `1px solid ${accentForStep[i]}28` : '1px solid transparent',
              transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
            }}>
              <span style={{
                color: step.active ? accentForStep[i] : 'rgba(148,163,184,0.5)',
                display: 'flex', transition: 'color 0.2s ease',
              }}>{step.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600,
                color: step.active ? accentForStep[i] : 'rgba(148,163,184,0.5)',
                transition: 'color 0.2s ease',
              }}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* ── 4-column flow ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'stretch', gap: 0,
        overflowX: 'auto', paddingBottom: 4,
      }}>

        {/* Column 1: Workspace anchor */}
        <WorkspaceCol workspace={selectedWs} />

        <ColConnector label="contains" />

        {/* Column 2: Semantic Models */}
        <ColShell width={252} accent={T.blue}>
          <ColHeader
            icon={<Database size={14} />}
            title="Semantic Models"
            count={modelNodes.length}
            accent={T.blue}
          />
          <div style={{
            padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 7,
            height: COL_HEIGHT - 56, overflowY: 'auto',
          }}>
            {modelNodes.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 12.5, color: T.muted, padding: '36px 0' }}>
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

        <ColConnector label="used by" />

        {/* Column 3: Reports */}
        <ColShell
          width={262}
          accent={T.teal}
          isEmpty={visibleReports.length === 0 && !!selectedModel}
          emptyMsg="No reports use this semantic model"
        >
          <ColHeader
            icon={<BarChart2 size={14} />}
            title="Reports"
            count={visibleReports.length}
            accent={T.teal}
          />
          <div style={{
            padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 7,
            height: COL_HEIGHT - 56, overflowY: 'auto',
          }}>
            {!selectedModel && (
              <div style={{
                padding: '10px 12px', borderRadius: 9, marginBottom: 2,
                background: `${T.teal}07`, border: `1px solid ${T.teal}18`,
              }}>
                <p style={{ margin: 0, fontSize: 11.5, color: T.teal, lineHeight: 1.45 }}>
                  Select a semantic model to filter reports
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

        <ColConnector label="uses" />

        {/* Column 4: Measures */}
        <ColShell
          width={278}
          accent={T.violet}
          isEmpty={!selectedReport && !selectedModel}
          emptyMsg="Select a report to see measures"
        >
          <ColHeader
            icon={<Hash size={14} />}
            title="Measures"
            count={selectedReport
              ? filteredUsed.length + filteredUnused.length
              : selectedModel
              ? selectedModel.dataset.measure_count
              : undefined}
            accent={T.violet}
          />
          {/* Search */}
          {(selectedReport || selectedModel) && (
            <div style={{ padding: '9px 11px 0', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={11} style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  color: T.dim, pointerEvents: 'none',
                }} />
                <input
                  style={{
                    width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                    fontSize: 11.5, borderRadius: 8, outline: 'none', boxSizing: 'border-box',
                    border: `1px solid ${T.border}`, background: 'rgba(248,250,252,0.8)', color: T.ink2,
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={e => (e.target.style.borderColor = `${T.violet}40`)}
                  onBlur={e => (e.target.style.borderColor = T.border)}
                  placeholder="Search measures…"
                  value={search}
                  onChange={e => startTransition(() => setSearch(e.target.value))}
                />
              </div>
            </div>
          )}
          <div style={{
            padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6,
            height: COL_HEIGHT - (selectedReport || selectedModel ? 116 : 56), overflowY: 'auto',
          }}>
            {!selectedModel && !selectedReport ? null
              : !selectedReport && selectedModel ? (
              <>
                <p style={{ margin: '0 0 6px', fontSize: 11.5, color: T.muted, fontStyle: 'italic', lineHeight: 1.4 }}>
                  Select a report to see which measures it uses
                </p>
                {filteredUnused.slice(0, measuresPage).map((m, i) => (
                  <UnusedModelMeasureCard key={`${m.table}||${m.name}`} m={m} animDelay={i * 18} />
                ))}
                {filteredUnused.length > measuresPage && (
                  <button
                    onClick={() => setMeasuresPage(p => p + 40)}
                    style={{
                      padding: '8px', borderRadius: 9, fontSize: 11.5, fontWeight: 600,
                      background: 'rgba(148,163,184,0.08)', color: T.muted,
                      border: `1px solid ${T.border}`, cursor: 'pointer', marginTop: 3,
                    }}
                  >
                    Show {Math.min(40, filteredUnused.length - measuresPage)} more…
                  </button>
                )}
              </>
            ) : selectedReport ? (
              <>
                {filteredUsed.length === 0 && filteredUnused.length === 0 ? (
                  <p style={{ textAlign: 'center', fontSize: 12.5, color: T.muted, padding: '28px 0', lineHeight: 1.5 }}>
                    {search ? `No measures match "${search}"` : 'No model measures used in this report'}
                  </p>
                ) : (
                  <>
                    {filteredUsed.length > 0 && (
                      <>
                        <p style={{ margin: '0 0 5px', fontSize: 10, fontWeight: 800, color: T.violet,
                          textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Used in this report ({filteredUsed.length})
                        </p>
                        {filteredUsed.slice(0, measuresPage).map((u, i) => (
                          <MeasureCard key={`${u.measure.table}||${u.measure.name}`} usage={u} animDelay={i * 18} />
                        ))}
                      </>
                    )}
                    {filteredUnused.length > 0 && filteredUsed.length > 0 && (
                      <div style={{ height: 1, background: T.border, margin: '6px 0' }} />
                    )}
                    {filteredUnused.length > 0 && (
                      <>
                        <p style={{ margin: '4px 0 5px', fontSize: 10, fontWeight: 800, color: T.dim,
                          textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Unused ({filteredUnused.length})
                        </p>
                        {filteredUnused.slice(0, Math.max(0, measuresPage - filteredUsed.length)).map((m, i) => (
                          <UnusedModelMeasureCard key={`${m.table}||${m.name}`} m={m} animDelay={i * 14} />
                        ))}
                      </>
                    )}
                    {allFiltered.length > measuresPage && (
                      <button
                        onClick={() => setMeasuresPage(p => p + 40)}
                        style={{
                          padding: '8px', borderRadius: 9, fontSize: 11.5, fontWeight: 600,
                          background: `${T.violet}07`, color: T.violet,
                          border: `1px solid ${T.violet}20`, cursor: 'pointer', marginTop: 3,
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
