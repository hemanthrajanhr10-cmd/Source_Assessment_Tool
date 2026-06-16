import React, { useState, useMemo, useCallback, startTransition } from 'react'
import {
  Hash, BarChart2, Database, FolderOpen, FileText,
  ChevronRight, Search, AlertCircle, Eye, Code2, Copy,
  Check, Layers, X,
} from 'lucide-react'
import type {
  FabricWorkspace, FabricDataset, FabricReport, FabricMeasure, MeasureComplexity,
} from '../../types/api'
import Breadcrumb from '../reports/Breadcrumb'

// ── Design tokens ──────────────────────────────────────────────────────────────

const T = {
  wsAccent:    '#3B5BDB',
  modelAccent: '#D97706',
  repAccent:   '#16A34A',
  msrAccent:   '#6D28D9',
  ink2:   '#1E293B',
  mid:    '#475569',
  muted:  '#64748B',
  dim:    '#94A3B8',
  border: 'rgba(187,247,208,0.65)',
  shadow:    '0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
  shadowMd:  '0 4px 16px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
  canvas:    '#F8FAFF',
  toolbarBg: 'linear-gradient(180deg, #F9FAFD 0%, #F2F6FB 100%)',
}

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

// ── Complexity pill ────────────────────────────────────────────────────────────

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
      <BarChart2 size={8} />{c.level}
    </span>
  )
}

// ── Workspace picker card ──────────────────────────────────────────────────────

function WsPickerCard({ ws, onSelect, animDelay }: {
  ws: FabricWorkspace
  onSelect: () => void
  animDelay: number
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
        border: `1.5px solid ${hov ? `${T.wsAccent}45` : T.border}`,
        borderTop: `3px solid ${hov ? T.wsAccent : T.border}`,
        background: hov ? `${T.wsAccent}04` : 'white',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        boxShadow: hov ? T.shadowMd : T.shadow,
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
          background: `${T.wsAccent}10`, border: `1px solid ${T.wsAccent}22`,
        }}>
          <FolderOpen size={17} style={{ color: T.wsAccent }} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: T.ink2 }}>{ws.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.dim }}>{ws.type}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {[
          { icon: <Database size={11} />, n: ws.dataset_count, label: 'models',  accent: T.modelAccent },
          { icon: <BarChart2 size={11} />, n: ws.report_count, label: 'reports', accent: T.repAccent   },
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

// ── Workspace picker view ──────────────────────────────────────────────────────

function WorkspacePickerView({ workspaces, onSelect }: {
  workspaces: FabricWorkspace[]
  onSelect: (ws: FabricWorkspace) => void
}) {
  return (
    <div style={{ padding: '28px', background: T.canvas }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.ink2 }}>
          Select a workspace to explore measure lineage
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: T.muted }}>
          {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} — trace DAX measure usage across models and reports
        </p>
      </div>
      {workspaces.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {workspaces.map((ws, i) => (
            <WsPickerCard key={ws.id} ws={ws} onSelect={() => onSelect(ws)} animDelay={i * 45} />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Layers size={30} style={{ color: '#CBD5E1', margin: '0 auto 12px', display: 'block' }} />
          <p style={{ margin: 0, fontSize: 13, color: T.dim }}>No workspaces found in this assessment.</p>
        </div>
      )}
    </div>
  )
}

// ── Drill item row ─────────────────────────────────────────────────────────────

function DrillItem({ icon, accent, name, meta, badge, onClick, animDelay }: {
  icon: React.ReactNode
  accent: string
  name: string
  meta: React.ReactNode
  badge?: React.ReactNode
  onClick: () => void
  animDelay: number
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 11, cursor: 'pointer',
        border: `1.5px solid ${hov ? `${accent}70` : T.border}`,
        background: hov ? `${accent}06` : 'white',
        boxShadow: hov ? T.shadowMd : T.shadow,
        transform: hov ? 'translateX(3px)' : 'translateX(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.42s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
        textAlign: 'left', width: '100%', outline: 'none',
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hov ? `${accent}14` : `${accent}09`,
        border: `1px solid ${accent}25`,
        transition: 'all 0.18s ease',
        boxShadow: hov ? `0 1px 4px ${accent}22` : 'none',
      }}>
        <span style={{ color: accent, display: 'flex' }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 700, color: T.ink2, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {meta}
        </div>
      </div>
      {badge}
      <ChevronRight
        size={14}
        style={{ color: hov ? accent : '#CBD5E1', flexShrink: 0, transition: 'color 0.15s ease' }}
      />
    </button>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ children, count, accent }: { children: string; count?: number; accent: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      marginBottom: 12, paddingBottom: 9,
      borderBottom: '1px solid rgba(197,213,236,0.45)',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.07em',
        textTransform: 'uppercase', color: T.dim,
      }}>
        {children}
      </span>
      {count !== undefined && (
        <span style={{
          fontSize: 10, fontWeight: 800, color: accent,
          background: `${accent}0D`, borderRadius: 10,
          padding: '1px 7px', border: `1px solid ${accent}22`,
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '52px 20px', gap: 12 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(148,163,184,0.09)', border: `1px solid ${T.border}`,
      }}>
        {icon ?? <AlertCircle size={20} style={{ color: T.dim }} />}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: T.muted, textAlign: 'center', lineHeight: 1.5, maxWidth: 280 }}>
        {message}
      </p>
    </div>
  )
}

// ── Level toolbar ──────────────────────────────────────────────────────────────

function LevelToolbar({
  icon, accent, title, subtitle, stats, search, onSearch, onClearSearch,
}: {
  icon: React.ReactNode
  accent: string
  title: string
  subtitle: string
  stats: { label: string; value: number | string }[]
  search?: string
  onSearch?: (v: string) => void
  onClearSearch?: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px',
      borderBottom: '1px solid rgba(197,213,236,0.55)',
      background: T.toolbarBg, flexShrink: 0, flexWrap: 'wrap', rowGap: 8,
    }}>
      {/* Context label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}0D`, border: `1px solid ${accent}22`,
        }}>
          <span style={{ color: accent, display: 'flex' }}>{icon}</span>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.ink2 }}>{title}</p>
          <p style={{
            margin: '1px 0 0', fontSize: 10.5, color: T.muted,
            maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {subtitle}
          </p>
        </div>
      </div>

      {/* Search box */}
      {onSearch !== undefined && (
        <div style={{ position: 'relative', width: 220, flexShrink: 0 }}>
          <Search size={12} style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: T.dim, pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={search ?? ''}
            onChange={e => onSearch(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            style={{
              width: '100%', paddingLeft: 28, paddingRight: search ? 26 : 10,
              paddingTop: 6, paddingBottom: 6, fontSize: 12, borderRadius: 8,
              border: '1px solid rgba(197,213,236,0.8)', background: 'white',
              color: T.ink2, outline: 'none', boxSizing: 'border-box',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = accent }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(197,213,236,0.8)' }}
          />
          {search && onClearSearch && (
            <button
              onClick={onClearSearch}
              style={{
                position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: T.dim,
                padding: 2, display: 'flex',
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 18 }}>
        {stats.map(({ label, value }) => (
          <span key={label} style={{ fontSize: 11, color: T.dim }}>
            <b style={{ color: T.mid }}>{value}</b> {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Models list view ───────────────────────────────────────────────────────────

function ModelsListView({ workspace, modelNodes, onSelect }: {
  workspace: FabricWorkspace
  modelNodes: ModelNode[]
  onSelect: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = search.trim()
    ? modelNodes.filter(n => n.dataset.name.toLowerCase().includes(search.toLowerCase()))
    : modelNodes

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <LevelToolbar
        icon={<Database size={15} />}
        accent={T.modelAccent}
        title="Semantic Models"
        subtitle={workspace.name}
        stats={[
          { label: 'models',        value: search.trim() ? `${filtered.length} of ${modelNodes.length}` : modelNodes.length },
          { label: 'total reports', value: workspace.report_count },
        ]}
        search={search}
        onSearch={setSearch}
        onClearSearch={() => setSearch('')}
      />
      <div style={{ padding: '24px 28px', background: T.canvas }}>
        <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <SectionLabel count={filtered.length} accent={T.modelAccent}>Semantic Models</SectionLabel>
          {filtered.length === 0 ? (
            <EmptyState
              message={search.trim() ? `No models match "${search}"` : 'No semantic models in this workspace'}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {filtered.map((node, i) => {
                const ds = node.dataset
                return (
                  <DrillItem
                    key={ds.id}
                    icon={<Database size={14} />}
                    accent={T.modelAccent}
                    name={ds.name}
                    meta={
                      <>
                        <span style={{ fontSize: 11, color: T.dim, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Database size={9} />{ds.table_count} tables
                        </span>
                        <span style={{ fontSize: 11, color: T.dim, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Hash size={9} />{ds.measure_count} measures
                        </span>
                        <span style={{ fontSize: 11, color: T.dim, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <BarChart2 size={9} />{node.reports.length} reports
                        </span>
                      </>
                    }
                    badge={
                      node.reports.length > 0 ? (
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, color: T.modelAccent,
                          background: `${T.modelAccent}0D`, border: `1px solid ${T.modelAccent}22`,
                          borderRadius: 5, padding: '2px 7px', flexShrink: 0, letterSpacing: '0.04em',
                        }}>
                          {node.reports.length} report{node.reports.length !== 1 ? 's' : ''}
                        </span>
                      ) : undefined
                    }
                    onClick={() => onSelect(ds.id)}
                    animDelay={i * 35}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Reports list view ──────────────────────────────────────────────────────────

function ReportsListView({ workspace, model, reports, onSelect }: {
  workspace: FabricWorkspace
  model: ModelNode
  reports: FabricReport[]
  onSelect: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = search.trim()
    ? reports.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : reports

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <LevelToolbar
        icon={<BarChart2 size={15} />}
        accent={T.repAccent}
        title="Reports"
        subtitle={`${model.dataset.name} · ${workspace.name}`}
        stats={[
          { label: 'reports',  value: search.trim() ? `${filtered.length} of ${reports.length}` : reports.length },
          { label: 'measures', value: model.dataset.measure_count },
        ]}
        search={search}
        onSearch={setSearch}
        onClearSearch={() => setSearch('')}
      />
      <div style={{ padding: '24px 28px', background: T.canvas }}>
        <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <SectionLabel count={filtered.length} accent={T.repAccent}>Reports</SectionLabel>
          {filtered.length === 0 ? (
            <EmptyState
              message={search.trim() ? `No reports match "${search}"` : 'No reports use this semantic model'}
              icon={<BarChart2 size={20} style={{ color: T.dim }} />}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {filtered.map((report, i) => (
                <DrillItem
                  key={report.id}
                  icon={<BarChart2 size={14} />}
                  accent={T.repAccent}
                  name={report.name}
                  meta={
                    <>
                      <span style={{ fontSize: 11, color: T.dim, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <FileText size={9} />{report.page_count ?? 0} pages
                      </span>
                      <span style={{ fontSize: 11, color: T.dim, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Eye size={9} />{report.visual_count} visuals
                      </span>
                    </>
                  }
                  badge={
                    report.is_paginated ? (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: '#6366F1',
                        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)',
                        borderRadius: 4, padding: '2px 6px', flexShrink: 0,
                      }}>
                        PAG
                      </span>
                    ) : undefined
                  }
                  onClick={() => onSelect(report.id)}
                  animDelay={i * 30}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Measure card (used) ────────────────────────────────────────────────────────

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
        border: `1.5px solid ${expanded ? `${T.msrAccent}45` : hov ? `${T.msrAccent}25` : T.border}`,
        background: expanded ? `${T.msrAccent}05` : hov ? `${T.msrAccent}02` : 'white',
        boxShadow: expanded ? T.shadowMd : hov ? '0 3px 10px rgba(15,23,42,0.08)' : T.shadow,
        transform: hov && !expanded ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        animation: `lgFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${animDelay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${T.msrAccent}0D`, border: `1px solid ${T.msrAccent}22`,
        }}>
          <Hash size={12} style={{ color: T.msrAccent }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 12, fontWeight: 700, color: T.ink2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", monospace',
          }}>
            {m.name}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 10.5, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.table}
            </span>
            {usage.visualCount > 0 && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
                color: T.msrAccent, fontWeight: 600, flexShrink: 0,
              }}>
                <Eye size={8.5} />{usage.visualCount}
              </span>
            )}
          </div>
        </div>
        {m.complexity && <ComplexityPill c={m.complexity} />}
      </div>
      {expanded && m.expression && (
        <div style={{
          padding: '10px 14px 12px', borderTop: `1px solid ${T.msrAccent}18`,
          animation: 'lgFadeIn 0.16s ease both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{
              fontSize: 9, fontWeight: 800, color: T.dim,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <Code2 size={9} /> DAX Expression
            </span>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700, cursor: 'pointer',
                border: 'none', transition: 'all 0.15s ease',
                background: copied ? `${T.repAccent}12` : `${T.msrAccent}0E`,
                color: copied ? T.repAccent : T.msrAccent,
              }}
            >
              {copied ? <><Check size={8} /> Copied</> : <><Copy size={8} /> Copy</>}
            </button>
          </div>
          <pre style={{
            margin: 0, fontSize: 10.5,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", monospace',
            padding: '8px 10px', borderRadius: 7, overflowX: 'auto',
            whiteSpace: 'pre-wrap', maxHeight: 120, color: T.mid,
            background: `${T.msrAccent}05`, border: `1px solid ${T.msrAccent}16`,
            lineHeight: 1.55,
          }}>
            {m.expression}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Measure card (unused) ──────────────────────────────────────────────────────

function UnusedMeasureCard({ m, animDelay }: { m: FabricMeasure; animDelay: number }) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.22)',
        }}>
          <Hash size={12} style={{ color: T.dim }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 12, fontWeight: 600, color: T.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", monospace',
          }}>
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
          padding: '10px 14px 12px', borderTop: '1px solid rgba(197,213,236,0.4)',
          animation: 'lgFadeIn 0.16s ease both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{
              fontSize: 9, fontWeight: 800, color: T.dim,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <Code2 size={9} /> DAX
            </span>
            <button
              onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(m.expression!) }}
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
            margin: 0, fontSize: 10.5,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", monospace',
            padding: '8px 10px', borderRadius: 7, overflowX: 'auto',
            whiteSpace: 'pre-wrap', maxHeight: 120, color: T.mid,
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

// ── Measures view ──────────────────────────────────────────────────────────────

function MeasuresView({ model, report, usedMeasures, allMeasures }: {
  model: ModelNode
  report: FabricReport
  usedMeasures: MeasureUsage[]
  allMeasures: FabricMeasure[]
}) {
  const [search, setSearch]         = useState('')
  const [measuresPage, setMeasuresPage] = useState(40)

  const unusedMeasures = useMemo(() => {
    const usedNames = new Set(usedMeasures.map(u => u.measure.name))
    return allMeasures.filter(m => !usedNames.has(m.name))
  }, [usedMeasures, allMeasures])

  const q = search.trim().toLowerCase()
  const filteredUsed = q
    ? usedMeasures.filter(u => u.measure.name.toLowerCase().includes(q) || u.measure.table.toLowerCase().includes(q))
    : usedMeasures
  const filteredUnused = q
    ? unusedMeasures.filter(m => m.name.toLowerCase().includes(q) || m.table.toLowerCase().includes(q))
    : unusedMeasures

  const total = filteredUsed.length + filteredUnused.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <LevelToolbar
        icon={<Hash size={15} />}
        accent={T.msrAccent}
        title="Measures"
        subtitle={`${report.name} · ${model.dataset.name}`}
        stats={[
          { label: 'used',   value: filteredUsed.length   },
          { label: 'unused', value: filteredUnused.length },
        ]}
        search={search}
        onSearch={v => { setSearch(v); setMeasuresPage(40) }}
        onClearSearch={() => { setSearch(''); setMeasuresPage(40) }}
      />
      <div style={{ padding: '24px 28px', background: T.canvas }}>
        <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {total === 0 ? (
            <EmptyState
              message={q ? `No measures match "${search}"` : 'No model measures used in this report'}
              icon={<Hash size={20} style={{ color: T.dim }} />}
            />
          ) : (
            <>
              {filteredUsed.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionLabel count={filteredUsed.length} accent={T.msrAccent}>
                    Used in this report
                  </SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filteredUsed.slice(0, measuresPage).map((u, i) => (
                      <MeasureCard
                        key={`${u.measure.table}||${u.measure.name}`}
                        usage={u}
                        animDelay={i * 18}
                      />
                    ))}
                  </div>
                </div>
              )}

              {filteredUnused.length > 0 && (
                <div>
                  <SectionLabel count={filteredUnused.length} accent={T.dim}>
                    Unused
                  </SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filteredUnused
                      .slice(0, Math.max(0, measuresPage - filteredUsed.length))
                      .map((m, i) => (
                        <UnusedMeasureCard
                          key={`${m.table}||${m.name}`}
                          m={m}
                          animDelay={i * 14}
                        />
                      ))}
                  </div>
                </div>
              )}

              {total > measuresPage && (
                <button
                  onClick={() => setMeasuresPage(p => p + 40)}
                  style={{
                    padding: '10px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                    background: `${T.msrAccent}07`, color: T.msrAccent,
                    border: `1px solid ${T.msrAccent}20`, cursor: 'pointer',
                    marginTop: 12, maxWidth: 700, width: '100%',
                  }}
                >
                  Show {Math.min(40, total - measuresPage)} more…
                </button>
              )}
            </>
          )}
        </div>
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

  const handleSelectWs = useCallback((ws: FabricWorkspace) => {
    setSelectedWs(ws)
    startTransition(() => { setSelectedModelId(null); setSelectedReportId(null) })
  }, [])

  const handleSelectModel = useCallback((id: string) => {
    startTransition(() => { setSelectedModelId(id); setSelectedReportId(null) })
  }, [])

  const handleSelectReport = useCallback((id: string) => {
    startTransition(() => { setSelectedReportId(id) })
  }, [])

  const handleGoToRoot = useCallback(() => {
    startTransition(() => {
      if (workspaces.length > 1) setSelectedWs(null)
      setSelectedModelId(null)
      setSelectedReportId(null)
    })
  }, [workspaces.length])

  const handleGoToWs = useCallback(() => {
    startTransition(() => { setSelectedModelId(null); setSelectedReportId(null) })
  }, [])

  const handleGoToModel = useCallback(() => {
    startTransition(() => { setSelectedReportId(null) })
  }, [])

  const modelNodes = useMemo(
    () => selectedWs ? buildModelNodes(selectedWs) : [],
    [selectedWs],
  )
  const selectedModel = useMemo(
    () => modelNodes.find(n => n.dataset.id === selectedModelId) ?? null,
    [modelNodes, selectedModelId],
  )
  const selectedReport = useMemo(
    () => selectedModel?.reports.find(r => r.id === selectedReportId) ?? null,
    [selectedModel, selectedReportId],
  )
  const usedMeasures = useMemo(() => {
    if (!selectedModel || !selectedReport) return []
    return getMeasuresUsedInReport(selectedModel.dataset, selectedReport)
  }, [selectedModel, selectedReport])

  // ── Breadcrumb ──────────────────────────────────────────────────────────────

  const multiWs = workspaces.length > 1
  const canGoToRoot = selectedWs ? (multiWs || !!selectedModelId) : false

  const breadcrumbItems = (() => {
    const root = { label: 'Measure Lineage', onClick: canGoToRoot ? handleGoToRoot : undefined }

    if (!selectedWs) return [root]

    if (multiWs) {
      if (!selectedModelId) return [root, { label: selectedWs.name }]
      const wsItem = { label: selectedWs.name, onClick: handleGoToWs }
      if (!selectedReportId || !selectedModel) {
        return [root, wsItem, { label: selectedModel?.dataset.name ?? '…' }]
      }
      return [
        root, wsItem,
        { label: selectedModel.dataset.name, onClick: handleGoToModel },
        { label: selectedReport?.name ?? '…' },
      ]
    }

    // Single workspace
    if (!selectedModelId) return [root]
    if (!selectedReportId || !selectedModel) {
      return [root, { label: selectedModel?.dataset.name ?? '…' }]
    }
    return [
      root,
      { label: selectedModel.dataset.name, onClick: handleGoToModel },
      { label: selectedReport?.name ?? '…' },
    ]
  })()

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{STYLES}</style>

      <Breadcrumb items={breadcrumbItems} />

      {!selectedWs && (
        <WorkspacePickerView workspaces={workspaces} onSelect={handleSelectWs} />
      )}

      {selectedWs && !selectedModelId && (
        <ModelsListView
          workspace={selectedWs}
          modelNodes={modelNodes}
          onSelect={handleSelectModel}
        />
      )}

      {selectedWs && selectedModel && !selectedReportId && (
        <ReportsListView
          workspace={selectedWs}
          model={selectedModel}
          reports={selectedModel.reports}
          onSelect={handleSelectReport}
        />
      )}

      {selectedWs && selectedModel && selectedReport && (
        <MeasuresView
          model={selectedModel}
          report={selectedReport}
          usedMeasures={usedMeasures}
          allMeasures={selectedModel.dataset.measures}
        />
      )}
    </div>
  )
}
