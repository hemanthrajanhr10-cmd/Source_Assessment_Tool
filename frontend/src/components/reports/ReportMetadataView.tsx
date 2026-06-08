import { useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, Hash, GitMerge, BarChart2, Table2,
  Layers, AlertTriangle, CheckCircle2, Info,
  TrendingUp, Eye, Shield,
} from 'lucide-react'
import type { FabricWorkspace, FabricReport, FabricDataset } from '../../types/api'

// ── Motion tokens (mirror CSS custom properties) ──────────────────────────────

const SPRING_SNAPPY   = { type: 'spring', duration: 0.38, bounce: 0.18 } as const
const SPRING_GENTLE   = { type: 'spring', duration: 0.45, bounce: 0    } as const

// Stagger container
const STAGGER_CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
}
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  show:   { opacity: 1, y: 0,  filter: 'blur(0px)', transition: SPRING_GENTLE },
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReportMetadataViewProps {
  report: FabricReport
  workspace: FabricWorkspace
}

interface FieldStat {
  table: string
  directFields: number
  measures: number
  aggregations: number
  totalFields: number
}

// ── Complexity styles ──────────────────────────────────────────────────────────

const CX: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  'None':         { bg: 'rgba(148,163,184,0.10)', text: '#64748B', border: 'rgba(148,163,184,0.25)', glow: 'rgba(148,163,184,0.12)' },
  'Simple':       { bg: 'rgba(5,150,105,0.08)',   text: '#047857', border: 'rgba(5,150,105,0.22)',   glow: 'rgba(5,150,105,0.10)'   },
  'Moderate':     { bg: 'rgba(217,119,6,0.08)',   text: '#B45309', border: 'rgba(217,119,6,0.22)',   glow: 'rgba(217,119,6,0.10)'   },
  'Complex':      { bg: 'rgba(234,88,12,0.08)',   text: '#C2410C', border: 'rgba(234,88,12,0.22)',   glow: 'rgba(234,88,12,0.10)'   },
  'Very Complex': { bg: 'rgba(220,38,38,0.08)',   text: '#B91C1C', border: 'rgba(220,38,38,0.22)',   glow: 'rgba(220,38,38,0.10)'   },
  'Minimal':      { bg: 'rgba(148,163,184,0.08)', text: '#64748B', border: 'rgba(148,163,184,0.20)', glow: 'rgba(148,163,184,0.08)' },
}

function ComplexityBadge({ level, score }: { level: string; score?: number }) {
  const s = CX[level] ?? CX['None']
  return (
    <motion.span
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING_SNAPPY}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
        borderRadius: 9999, fontSize: 11, fontWeight: 700, letterSpacing: '0.01em',
        background: s.bg, color: s.text, border: `1px solid ${s.border}`,
        boxShadow: `0 0 0 3px ${s.glow}`,
      }}
    >
      <BarChart2 size={10} />
      {level}
      {score !== undefined && score > 0 && (
        <span style={{ opacity: 0.60, fontSize: 10 }}>({score})</span>
      )}
    </motion.span>
  )
}

// ── Risk badge ─────────────────────────────────────────────────────────────────

function RiskBadge({ mode }: { mode: string }) {
  const MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    DirectQuery: { label: 'High Risk',   color: '#DC2626', icon: <AlertTriangle size={10} /> },
    Composite:   { label: 'Medium Risk', color: '#D97706', icon: <Shield size={10} />       },
    Import:      { label: 'Low Risk',    color: '#059669', icon: <CheckCircle2 size={10} /> },
    DirectLake:  { label: 'Low Risk',    color: '#059669', icon: <CheckCircle2 size={10} /> },
    Push:        { label: 'Medium Risk', color: '#D97706', icon: <Shield size={10} />       },
  }
  const e = MAP[mode] ?? { label: 'Unknown', color: '#94A3B8', icon: <Info size={10} /> }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
      borderRadius: 9999, fontSize: 10, fontWeight: 700,
      background: e.color + '14', color: e.color,
      border: `1px solid ${e.color}30`,
    }}>
      {e.icon}{e.label}
    </span>
  )
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon, delay = 0 }: {
  label: string; value: number; color: string; icon: React.ReactNode; delay?: number
}) {
  return (
    <motion.div
      variants={STAGGER_ITEM}
      whileHover={{ y: -3, transition: SPRING_SNAPPY }}
      whileTap={{ scale: 0.97 }}
      style={{
        background: '#fff',
        border: '1px solid rgba(197,213,236,0.7)',
        borderRadius: 12,
        padding: '14px 16px',
        textAlign: 'center',
        boxShadow: 'var(--elevation-2), var(--elevation-border-1)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
      }}
    >
      {/* Gradient shimmer top strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: 0.7,
      }} />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8, margin: '0 auto 8px',
        background: color + '16',
        border: `1px solid ${color}28`,
      }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...SPRING_SNAPPY, delay: delay + 0.12 }}
        style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1, letterSpacing: '-0.03em' }}
      >
        {value}
      </motion.div>
      <div style={{
        fontSize: 9.5, color: '#64748B', marginTop: 4, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </div>
    </motion.div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count, accent = '#0056B3' }: {
  icon: React.ReactNode; title: string; count?: number; accent?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 18px',
      background: `linear-gradient(135deg, ${accent}0D 0%, ${accent}05 100%)`,
      borderBottom: '1px solid rgba(197,213,236,0.55)',
    }}>
      <motion.span
        initial={{ scale: 0, rotate: -15 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={SPRING_SNAPPY}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: `linear-gradient(135deg, ${accent}, ${accent}CC)`,
          boxShadow: `0 2px 8px ${accent}35`,
        }}
      >
        {icon}
      </motion.span>
      <span style={{ fontWeight: 700, fontSize: 13, color: '#1E293B', letterSpacing: '-0.01em' }}>{title}</span>
      {count !== undefined && (
        <motion.span
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...SPRING_GENTLE, delay: 0.1 }}
          style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#64748B',
            background: 'rgba(100,116,139,0.10)', padding: '2px 9px',
            borderRadius: 9999, border: '1px solid rgba(100,116,139,0.15)',
          }}
        >
          {count} item{count !== 1 ? 's' : ''}
        </motion.span>
      )}
    </div>
  )
}

// ── Sortable, hoverable data table ────────────────────────────────────────────

function MetaTable({
  headers, rows, colAligns,
}: {
  headers: string[]
  rows: (string | React.ReactNode)[][]
  colAligns?: ('left' | 'center' | 'right')[]
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'rgba(239,246,255,0.8)', borderBottom: '1px solid rgba(197,213,236,0.55)' }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '9px 15px', fontWeight: 700, color: '#475569', fontSize: 11,
                textAlign: colAligns?.[i] ?? (i === 0 ? 'left' : 'center'),
                whiteSpace: 'nowrap', letterSpacing: '0.02em',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="sync">
            {rows.map((row, ri) => (
              <motion.tr
                key={ri}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING_GENTLE, delay: ri * 0.03 }}
                style={{
                  background: ri % 2 === 0 ? '#fff' : 'rgba(248,250,253,0.9)',
                  borderBottom: '1px solid rgba(197,213,236,0.30)',
                }}
                whileHover={{
                  backgroundColor: 'rgba(0,86,179,0.03)',
                  transition: { duration: 0.12 },
                }}
              >
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '8px 15px',
                    textAlign: colAligns?.[ci] ?? (ci === 0 ? 'left' : 'center'),
                    color: '#334155', verticalAlign: 'middle',
                  }}>
                    {cell}
                  </td>
                ))}
              </motion.tr>
            ))}
          </AnimatePresence>
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} style={{
                padding: '24px 15px', textAlign: 'center',
                color: '#94A3B8', fontStyle: 'italic', fontSize: 12,
              }}>
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Complexity scoring helpers ─────────────────────────────────────────────────

function reportComplexityLevel(report: FabricReport, ds: FabricDataset | undefined): string {
  const vc = report.visual_count ?? 0
  const mc = ds?.measure_count ?? 0
  const rc = ds?.relationship_count ?? 0
  const score = vc + mc * 2 + rc
  if (score >= 80) return 'Very Complex'
  if (score >= 40) return 'Complex'
  if (score >= 20) return 'Moderate'
  if (score >= 5)  return 'Simple'
  return 'Minimal'
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReportMetadataView({ report, workspace }: ReportMetadataViewProps) {
  const ds = useMemo(
    () => workspace.datasets.find(d => d.id === report.dataset_id),
    [workspace.datasets, report.dataset_id],
  )

  // Field-level table stats from pages
  const fieldStats = useMemo<FieldStat[]>(() => {
    const tblMap = new Map<string, FieldStat>()
    for (const page of report.pages ?? []) {
      for (const visual of page.visuals ?? []) {
        for (const field of visual.fields ?? []) {
          const tbl = field.table || '(unknown)'
          if (!tblMap.has(tbl)) {
            tblMap.set(tbl, { table: tbl, directFields: 0, measures: 0, aggregations: 0, totalFields: 0 })
          }
          const entry = tblMap.get(tbl)!
          entry.totalFields++
          if (field.field_type === 'measure') entry.measures++
          else if (field.field_type === 'aggregation') entry.aggregations++
          else entry.directFields++
        }
      }
    }
    return Array.from(tblMap.values()).sort((a, b) => b.totalFields - a.totalFields)
  }, [report.pages])

  const fieldTableNames = useMemo(() => new Set(fieldStats.map(f => f.table)), [fieldStats])

  // Measures used in this report
  const usedMeasures = useMemo(() => {
    const seen = new Map<string, {
      name: string; table: string
      complexity?: import('../../types/api').MeasureComplexity; usedCount: number
    }>()
    for (const page of report.pages ?? []) {
      for (const visual of page.visuals ?? []) {
        for (const field of visual.fields ?? []) {
          if (field.field_type === 'measure') {
            const key = `${field.table}::${field.name}`
            if (!seen.has(key)) {
              seen.set(key, { name: field.name, table: field.table, complexity: field.complexity, usedCount: 0 })
            }
            seen.get(key)!.usedCount++
          }
        }
      }
    }
    return Array.from(seen.values()).sort((a, b) => (b.complexity?.score ?? 0) - (a.complexity?.score ?? 0))
  }, [report.pages])

  // Model relationships that touch tables used by this report
  const linkedRels = useMemo(() => {
    if (!ds) return []
    return ds.relationships.filter(r =>
      fieldTableNames.has(r.from_table) || fieldTableNames.has(r.to_table),
    )
  }, [ds, fieldTableNames])

  const totalComplexScore = useMemo(
    () => usedMeasures.reduce((s, m) => s + (m.complexity?.score ?? 0), 0),
    [usedMeasures],
  )

  const complexityLevel = reportComplexityLevel(report, ds)

  // ── KPI data ───────────────────────────────────────────────────────────────
  const kpis = [
    { label: 'Pages',         value: report.page_count ?? 0,   color: '#0056B3', icon: <Eye size={14} />        },
    { label: 'Visuals',       value: report.visual_count ?? 0, color: '#0891B2', icon: <BarChart2 size={14} />   },
    { label: 'Unique Tables', value: fieldTableNames.size,      color: '#059669', icon: <Table2 size={14} />     },
    { label: 'Measures Used', value: usedMeasures.length,       color: '#7C3AED', icon: <Hash size={14} />       },
    { label: 'Relationships', value: linkedRels.length,         color: '#D97706', icon: <GitMerge size={14} />   },
    { label: 'DAX Score',     value: totalComplexScore,         color: '#DC2626', icon: <TrendingUp size={14} /> },
  ]

  return (
    <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ── KPI grid ────────────────────────────────────────────────────────── */}
      <motion.div
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="show"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}
      >
        {kpis.map((k, i) => (
          <KpiCard key={k.label} delay={i * 0.04} {...k} />
        ))}
      </motion.div>

      {/* ── Summary banner ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_GENTLE, delay: 0.15 }}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          padding: '11px 18px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(0,86,179,0.05) 0%, rgba(0,132,212,0.03) 100%)',
          border: '1px solid rgba(0,86,179,0.13)',
          boxShadow: '0 1px 4px rgba(0,86,179,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#334155' }}>
          <Database size={13} color="#0056B3" />
          <strong style={{ color: '#1E293B' }}>Semantic Model:</strong>
          <span>{ds?.name ?? <em style={{ color: '#94A3B8' }}>unlinked</em>}</span>
        </div>
        <Divider />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#334155' }}>
          <Layers size={13} color="#0891B2" />
          <strong style={{ color: '#1E293B' }}>Storage:</strong>
          <span style={{ color: '#475569' }}>{ds?.storage_mode ?? '—'}</span>
        </div>
        {ds && <><Divider /><RiskBadge mode={ds.storage_mode} /></>}
        <Divider />
        <ComplexityBadge level={complexityLevel} />
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>
          {report.report_type}{report.is_paginated ? ' · Paginated' : ''}
        </div>
      </motion.div>

      {/* ── Data Source Tables ───────────────────────────────────────────────── */}
      <AnimatedCard delay={0.18} accent="#059669">
        <SectionHeader
          icon={<Table2 size={13} color="#fff" />}
          title="Data Source Tables"
          count={fieldStats.length}
          accent="#059669"
        />
        <MetaTable
          headers={['Table Name', 'Direct Fields', 'Measures', 'Aggregations', 'Total Fields', 'In Model']}
          colAligns={['left', 'center', 'center', 'center', 'center', 'center']}
          rows={fieldStats.map(f => {
            const inModel = ds?.tables?.some(t => t.name === f.table) ?? false
            return [
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1E293B', fontSize: 12 }}>{f.table}</span>,
              numCell(f.directFields, '#0056B3'),
              numCell(f.measures, '#7C3AED'),
              numCell(f.aggregations, '#D97706'),
              <strong style={{ color: '#1E293B' }}>{f.totalFields}</strong>,
              inModel
                ? <StatusChip ok label="Verified" />
                : <StatusChip ok={false} label="Missing" />,
            ]
          })}
        />
      </AnimatedCard>

      {/* ── Measures Used ────────────────────────────────────────────────────── */}
      <AnimatedCard delay={0.24} accent="#7C3AED">
        <SectionHeader
          icon={<Hash size={13} color="#fff" />}
          title="Measures Used in This Report"
          count={usedMeasures.length}
          accent="#7C3AED"
        />
        <MetaTable
          headers={['Measure Name', 'Table', 'Used', 'Complexity', 'Score', 'Nesting', 'Functions']}
          colAligns={['left', 'left', 'center', 'left', 'center', 'center', 'center']}
          rows={usedMeasures.map(m => [
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1E293B', fontSize: 12 }}>{m.name}</span>,
            <span style={{ color: '#475569', fontSize: 11 }}>{m.table}</span>,
            <strong style={{ color: '#0056B3' }}>{m.usedCount}</strong>,
            m.complexity ? <ComplexityBadge level={m.complexity.level} /> : <span style={{ color: '#94A3B8' }}>—</span>,
            m.complexity?.score ?? dashCell(),
            m.complexity?.nesting_depth ?? dashCell(),
            m.complexity?.function_count ?? dashCell(),
          ])}
        />
      </AnimatedCard>

      {/* ── Relevant Relationships ────────────────────────────────────────────── */}
      <AnimatedCard delay={0.30} accent="#D97706">
        <SectionHeader
          icon={<GitMerge size={13} color="#fff" />}
          title="Relevant Relationships (via used tables)"
          count={linkedRels.length}
          accent="#D97706"
        />
        <MetaTable
          headers={['From Table', 'From Column', 'To Table', 'To Column', 'Cardinality', 'Cross Filter', 'Status']}
          colAligns={['left', 'left', 'left', 'left', 'center', 'center', 'center']}
          rows={linkedRels.map(r => [
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1E293B', fontSize: 11 }}>{r.from_table}</span>,
            <span style={{ color: '#475569', fontSize: 11 }}>{r.from_column}</span>,
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1E293B', fontSize: 11 }}>{r.to_table}</span>,
            <span style={{ color: '#475569', fontSize: 11 }}>{r.to_column}</span>,
            <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{r.cardinality}</span>,
            <span style={{ fontSize: 11, color: '#475569' }}>{r.cross_filter}</span>,
            r.is_active
              ? <StatusChip ok label="Active" />
              : <StatusChip ok={false} label="Inactive" />,
          ])}
        />
      </AnimatedCard>

      {/* ── All Model Tables ──────────────────────────────────────────────────── */}
      {ds && ds.tables && ds.tables.length > 0 && (
        <AnimatedCard delay={0.36} accent="#0056B3">
          <SectionHeader
            icon={<Database size={13} color="#fff" />}
            title="Semantic Model — All Tables"
            count={ds.tables.length}
            accent="#0056B3"
          />
          <MetaTable
            headers={['Table Name', 'Storage Mode', 'Visibility', 'Type', 'Used by Report']}
            colAligns={['left', 'center', 'center', 'center', 'center']}
            rows={ds.tables.map(t => [
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1E293B', fontSize: 12 }}>{t.name}</span>,
              <span style={{ fontSize: 11, color: '#475569' }}>{t.storage_mode || '—'}</span>,
              t.is_hidden
                ? <span style={{ color: '#94A3B8', fontSize: 11 }}>Hidden</span>
                : <StatusChip ok label="Visible" />,
              t.is_calculated
                ? <span style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', background: 'rgba(124,58,237,0.07)', padding: '2px 7px', borderRadius: 6 }}>Calculated</span>
                : <span style={{ color: '#94A3B8', fontSize: 11 }}>Base</span>,
              fieldTableNames.has(t.name)
                ? <StatusChip ok label="Yes" />
                : <span style={{ color: '#CBD5E1', fontSize: 11 }}>No</span>,
            ])}
          />
        </AnimatedCard>
      )}

      {/* ── Layout not parsed notice ──────────────────────────────────────────── */}
      <AnimatePresence>
        {!report.layout_parsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_GENTLE}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px',
              borderRadius: 10, background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.22)', fontSize: 12, color: '#92400E',
            }}
          >
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            Full layout was not parsed for this report. Table-level data comes from the linked semantic model.
            Field-level breakdown requires layout extraction.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Small sub-components ───────────────────────────────────────────────────────

function Divider() {
  return <div style={{ width: 1, height: 14, background: 'rgba(197,213,236,0.7)', flexShrink: 0 }} />
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      color: ok ? '#059669' : '#DC2626', fontSize: 11, fontWeight: 700,
    }}>
      {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
      {label}
    </span>
  )
}

function numCell(val: number, color: string) {
  if (val === 0) return <span style={{ color: '#CBD5E1' }}>0</span>
  return <strong style={{ color }}>{val}</strong>
}

function dashCell() {
  return <span style={{ color: '#94A3B8' }}>—</span>
}

// ── Animated card wrapper ──────────────────────────────────────────────────────

function AnimatedCard({ children, delay = 0, accent = '#0056B3' }: {
  children: React.ReactNode; delay?: number; accent?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState('')
  const [glow, setGlow] = useState({ x: 50, y: 50 })
  const [hovered, setHovered] = useState(false)

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return
    const el = ref.current
    if (!el) return
    const { left, top, width, height } = el.getBoundingClientRect()
    const x = (e.clientX - left) / width
    const y = (e.clientY - top) / height
    setTilt(`perspective(1000px) rotateX(${(y - 0.5) * -2.5}deg) rotateY(${(x - 0.5) * 2.5}deg) translateZ(3px)`)
    setGlow({ x: x * 100, y: y * 100 })
  }, [prefersReducedMotion])

  const onLeave = useCallback(() => {
    setTilt('')
    setGlow({ x: 50, y: 50 })
    setHovered(false)
  }, [])

  return (
    <motion.div
      ref={ref as React.RefObject<HTMLDivElement>}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_GENTLE, delay }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onMouseEnter={() => setHovered(true)}
      style={{
        border: `1px solid rgba(197,213,236,${hovered ? '0.9' : '0.65'})`,
        borderRadius: 14,
        background: '#ffffff',
        overflow: 'hidden',
        position: 'relative',
        transform: tilt,
        boxShadow: hovered
          ? `var(--elevation-3), var(--elevation-border-2), 0 0 0 3px ${accent}10`
          : 'var(--elevation-2), var(--elevation-border-1)',
        transition: tilt
          ? 'transform 60ms cubic-bezier(0.4,0,0.2,1), box-shadow 180ms cubic-bezier(0.4,0,0.2,1)'
          : 'transform 350ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 200ms cubic-bezier(0.4,0,0.2,1)',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
    >
      {/* Specular light catch */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit', zIndex: 1,
        background: `radial-gradient(circle at ${glow.x}% ${glow.y}%, rgba(255,255,255,0.18) 0%, transparent 60%)`,
        transition: 'background 80ms ease',
      }} />
      <div style={{ position: 'relative', zIndex: 2 }}>
        {children}
      </div>
    </motion.div>
  )
}
