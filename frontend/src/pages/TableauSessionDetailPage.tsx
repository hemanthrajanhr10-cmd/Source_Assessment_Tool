import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  BarChart3, Users, Database, Globe, RefreshCw, Shield,
  CheckCircle2, XCircle, Loader2, ArrowLeft,
  FileSpreadsheet, BookOpen, ChevronDown, ChevronUp,
  AlertTriangle, Layers, Zap, FileText, TrendingUp,
  ArrowRight, Target, Activity, Sparkles, Info, Code2, FlaskConical,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type {
  TableauAssessmentResult,
  MigrationFeasibilityReport,
  WorkbookMigrationScore,
  WorkbookDeepAnalysis,
} from '../types/api'
import Loader3D from '../components/ui/Loader3D'
import { TableauLogo } from '../components/ui/SourceLogos'

// ── Design tokens (Ocean / Deep Atlantic) ────────────────────────────────────

const T = {
  primary:  '#0056B3',
  dark:     '#003D82',
  accent:   '#0084D4',
  teal:     '#0D9488',
  light50:  '#EFF6FF',
  light100: '#DBEEFF',
  light200: '#BAE0FF',
  glow:     'rgba(0,86,179,0.12)',
  glowD:    'rgba(0,86,179,0.08)',
  shadow:   '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,86,179,0.06)',
  shadowH:  '0 4px 8px rgba(0,86,179,0.08), 0 16px 40px rgba(0,86,179,0.12)',
  shadowBtn:'0 2px 8px rgba(0,86,179,0.32), inset 0 1px 0 rgba(255,255,255,0.18)',
  card:     '0 1px 2px rgba(0,0,0,0.04), 0 4px 20px rgba(0,86,179,0.05)',
  radius:   '14px',
}

const COMPLEXITY_CONFIG = {
  Simple:       { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
  Moderate:     { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', dot: '#F59E0B' },
  Complex:      { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA', dot: '#F97316' },
  'Very Complex': { bg: '#FFF1F2', text: '#9F1239', border: '#FECDD3', dot: '#F43F5E' },
}

const FEASIBILITY_CONFIG = {
  High:     { bg: '#F0FDF4', text: '#15803D', icon: '✓', color: '#22C55E' },
  Moderate: { bg: '#FFFBEB', text: '#B45309', icon: '~', color: '#F59E0B' },
  Low:      { bg: '#FFF1F2', text: '#9F1239', icon: '!', color: '#F43F5E' },
}

// ── Progress steps ────────────────────────────────────────────────────────────

const STEPS = [
  'Connecting to Tableau Server',
  'Enumerating projects',
  'Enumerating workbooks',
  'Enumerating views & dashboards',
  'Enumerating data sources',
  'Enumerating users',
  'Enumerating groups',
  'Enumerating Prep flows',
  'Enumerating extract schedules',
  'Enumerating recent background jobs',
  'Sampling workbook permissions',
  'Building data quality flags',
  'Analysing migration complexity',
  'Building migration feasibility report',
  'Deep analysis: parsing workbook XML (.twb/.twbx)',
  'Generating Excel report',
  'Generating Word report (AI-powered)',
]

// ── Tab type ──────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'migration' | 'workbooks' | 'datasources' | 'users' | 'quality' | 'analysis'

// ── SVG Donut Chart ───────────────────────────────────────────────────────────

function DonutChart({
  data, size = 120, label,
}: {
  data: { label: string; value: number; color: string }[]
  size?: number
  label?: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="text-xs text-slate-400">No data</span>
    </div>
  )
  const r = size / 2 - 10
  const cx = size / 2, cy = size / 2
  const ir = r * 0.62
  let angle = -90
  const arcs = data.filter(d => d.value > 0).map(d => {
    const sweep = (d.value / total) * 360
    const startAngle = angle
    angle += sweep
    const s = (Math.PI / 180) * startAngle
    const e = (Math.PI / 180) * (startAngle + sweep)
    const largeArc = sweep > 180 ? 1 : 0
    return {
      ...d,
      d: [
        `M ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)}`,
        `A ${r} ${r} 0 ${largeArc} 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)}`,
        `L ${cx + ir * Math.cos(e)} ${cy + ir * Math.sin(e)}`,
        `A ${ir} ${ir} 0 ${largeArc} 0 ${cx + ir * Math.cos(s)} ${cy + ir * Math.sin(s)}`,
        'Z',
      ].join(' '),
      pct: Math.round((d.value / total) * 100),
    }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((arc, i) => (
        <path key={i} d={arc.d} fill={arc.color} opacity={0.9}>
          <title>{arc.label}: {arc.value} ({arc.pct}%)</title>
        </path>
      ))}
      {label && (
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize="11" fontWeight="700" fill="#1E293B">
          {label}
        </text>
      )}
    </svg>
  )
}

// ── Progress terminal ─────────────────────────────────────────────────────────

function AssessmentTerminal({ status, progressMessage, error }: {
  status: string; progressMessage?: string; error?: string
}) {
  const currentIdx = progressMessage
    ? STEPS.findIndex(s => progressMessage.toLowerCase().includes(s.toLowerCase().split(' ')[0]))
    : -1
  const completedSteps = status === 'completed' ? STEPS.length : Math.max(currentIdx, 0)
  const progress = Math.min((completedSteps / STEPS.length) * 100, 100)

  return (
    <div className="rounded-2xl border border-slate-200/80 overflow-hidden" style={{ boxShadow: T.shadow }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100"
        style={{ background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 100%)` }}>
        <div className="flex items-center gap-2.5">
          <div className="h-2.5 w-2.5 rounded-full" style={{
            background: status === 'completed' ? T.primary : status === 'failed' ? '#EF4444' : status === 'running' ? '#3B82F6' : '#94A3B8',
            boxShadow: status === 'running' ? '0 0 8px rgba(59,130,246,0.6)' : 'none',
          }} />
          <span className="text-sm font-semibold text-slate-700">Assessment Progress</span>
          {status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: status === 'completed' ? T.light100 : status === 'failed' ? '#FEE2E2' : status === 'running' ? '#DBEAFE' : '#F1F5F9',
            color: status === 'completed' ? T.dark : status === 'failed' ? '#991B1B' : status === 'running' ? '#1E40AF' : '#64748B',
          }}>
          {status === 'completed' ? `${STEPS.length}/${STEPS.length}` : `${completedSteps}/${STEPS.length}`} steps
        </span>
      </div>
      <div className="px-5 pt-4 pb-2">
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${status === 'completed' ? 100 : progress}%`,
              background: status === 'failed'
                ? 'linear-gradient(90deg, #EF4444, #F87171)'
                : `linear-gradient(90deg, ${T.dark}, ${T.primary}, ${T.accent})`,
            }} />
        </div>
        <p className="text-xs text-slate-500 mt-1.5">
          {status === 'completed' ? 'All steps completed' : progressMessage || 'Waiting to start…'}
        </p>
      </div>
      <div className="px-5 pb-5 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
        {STEPS.map((step, i) => {
          const done = status === 'completed' || i < completedSteps
          const current = i === completedSteps && status === 'running'
          return (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <div className="shrink-0 h-4 w-4">
                {done ? <CheckCircle2 className="h-4 w-4" style={{ color: T.primary }} />
                  : current ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  : <div className="h-4 w-4 rounded-full border-2 border-slate-200" />}
              </div>
              <span className={`text-xs ${done ? 'text-slate-700 font-medium' : current ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                {step}
              </span>
            </div>
          )
        })}
      </div>
      {error && (
        <div className="mx-5 mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon: Icon, accent = false, index = 0, warn = false }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; accent?: boolean; index?: number; warn?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    el.style.opacity = '0'; el.style.transform = 'translateY(12px)'
    const t = setTimeout(() => {
      el.style.transition = `opacity 320ms cubic-bezier(0,0,0.2,1) ${index * 45}ms, transform 320ms cubic-bezier(0.34,1.56,0.64,1) ${index * 45}ms`
      el.style.opacity = '1'; el.style.transform = 'translateY(0)'
    }, 60)
    return () => clearTimeout(t)
  }, [index])

  const iconBg = warn ? '#FEF2F2' : accent
    ? `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`
    : `linear-gradient(135deg, ${T.dark} 0%, #2C4D8A 100%)`
  const iconColor = warn ? '#DC2626' : 'white'
  const valColor = warn ? '#DC2626' : accent ? T.primary : T.dark

  return (
    <div ref={ref} className="rounded-2xl p-5 group cursor-default"
      style={{
        background: warn ? '#FFF5F5' : `linear-gradient(145deg, #FFFFFF 0%, ${T.light50} 100%)`,
        border: `1px solid ${warn ? '#FECACA' : T.light200}`,
        boxShadow: T.card,
        transition: 'box-shadow 200ms ease, transform 200ms ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = T.shadowH; el.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = T.card; el.style.transform = 'translateY(0)'
      }}>
      <div className="flex items-start justify-between mb-3">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg }}>
          <Icon className="h-4.5 w-4.5" style={{ color: iconColor, width: '18px', height: '18px' }} />
        </div>
      </div>
      <p className="text-2xl font-black tabular-nums tracking-tight" style={{ color: valColor }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-xs font-semibold text-slate-600 mt-0.5 leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, badge, defaultOpen = false, children, accent }: {
  title: string; icon: React.ElementType; badge?: string | number
  defaultOpen?: boolean; children: React.ReactNode; accent?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden"
      style={{ boxShadow: T.shadow }}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        style={{ background: open ? `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 60%)` : '' }}>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: accent
                ? `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`
                : `linear-gradient(135deg, ${T.dark} 0%, #2C4D8A 100%)`,
              boxShadow: accent ? `0 2px 8px ${T.glow}` : `0 2px 6px ${T.glowD}`,
            }}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-800">{title}</span>
          {badge !== undefined && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: T.light100, color: T.dark }}>
              {badge}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4">{children}</div>
      )}
    </div>
  )
}

// ── KV table ──────────────────────────────────────────────────────────────────

function KVTable({ rows }: { rows: [string, string | number][] }) {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-100">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between px-4 py-2.5"
          style={{ background: i % 2 === 0 ? T.light50 : 'white' }}>
          <span className="text-xs text-slate-600 font-medium">{k}</span>
          <span className="text-xs font-semibold text-slate-800 text-right max-w-[60%]">
            {typeof v === 'number' ? v.toLocaleString() : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Data table ────────────────────────────────────────────────────────────────

function DataTable({ headers, rows, compact }: {
  headers: string[]; rows: (string | number)[][]; compact?: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: T.dark }}>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-white whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? T.light50 : 'white' }}>
              {row.map((cell, ci) => (
                <td key={ci} className={`px-3 text-slate-700 ${compact ? 'py-1.5' : 'py-2'}`}>
                  {typeof cell === 'number' ? cell.toLocaleString() : String(cell ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Formula Analysis tab ─────────────────────────────────────────────────────

function FormulaRow({ cf, index }: { cf: import('../types/api').CalcFieldSummary; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden border mb-1.5"
      style={{ borderColor: cf.is_lod ? '#FED7AA' : cf.is_table_calc ? '#BAE6FD' : '#E2E8F0' }}>
      <button type="button" onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
        style={{ background: index % 2 === 0 ? '#FAFAFA' : 'white' }}>
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: cf.is_lod ? T.primary : cf.is_table_calc ? '#0284C7' : '#64748B' }} />
          <span className="text-xs font-bold text-slate-800 truncate">{cf.name}</span>
          {cf.is_lod && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded"
              style={{ background: '#FFF7ED', color: T.primary, border: `1px solid #FED7AA` }}>LOD {cf.lod_type}</span>
          )}
          {cf.is_table_calc && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded"
              style={{ background: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD' }}>
              {cf.table_calc_type || 'TABLE CALC'}</span>
          )}
          {cf.nested_lod_count > 1 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded"
              style={{ background: '#FFF1F2', color: '#BE123C', border: '1px solid #FECDD3' }}>NESTED</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-slate-400 font-medium">{cf.role} · {cf.datatype}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t" style={{ borderColor: '#E2E8F0', background: '#F8FAFC' }}>
          <pre className="text-[11px] text-slate-700 font-mono whitespace-pre-wrap break-all leading-relaxed rounded-lg px-3 py-2"
            style={{ background: '#1E293B', color: '#94A3B8', border: '1px solid #334155' }}>
            <span style={{ color: cf.is_lod ? '#FB923C' : cf.is_table_calc ? '#38BDF8' : '#A3E635' }}>
              {cf.formula}
            </span>
          </pre>
          {cf.dependencies.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-[10px] text-slate-500 font-medium mr-1">Refs:</span>
              {cf.dependencies.slice(0, 10).map((d, i) => (
                <span key={i} className="px-1.5 py-0.5 text-[10px] rounded font-medium"
                  style={{ background: T.light100, color: T.dark }}>[{d}]</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function WorkbookAnalysisCard({ da }: { da: WorkbookDeepAnalysis; index: number }) {
  const [section, setSection] = useState<'calcs' | 'filters' | 'params' | 'structure'>('calcs')
  const level = da.refined_complexity_level || 'Simple'
  const cfg = COMPLEXITY_CONFIG[level as keyof typeof COMPLEXITY_CONFIG] || COMPLEXITY_CONFIG.Simple

  const sectionTabs = [
    { id: 'calcs' as const,     label: `Calcs (${da.total_calc_fields})`,   show: da.total_calc_fields > 0 },
    { id: 'filters' as const,   label: `Filters (${da.total_filter_count})`, show: da.total_filter_count > 0 },
    { id: 'params' as const,    label: `Params (${da.total_parameter_count})`, show: da.total_parameter_count > 0 },
    { id: 'structure' as const, label: 'Structure', show: true },
  ]

  return (
    <div className="rounded-2xl border overflow-hidden mb-4" style={{ borderColor: cfg.border, background: 'white', boxShadow: T.card }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ background: `linear-gradient(135deg, ${T.dark} 0%, #2C4D8A 100%)` }}>
        <div className="flex items-center gap-3 min-w-0">
          <FlaskConical className="h-4 w-4 flex-shrink-0 text-white opacity-80" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{da.workbook_name}</p>
            <p className="text-[10px] text-blue-200 mt-0.5">
              {da.raw_worksheet_count} sheets · {da.total_calc_fields} calcs · {da.total_lod_count} LODs · {da.total_table_calc_count} table calcs
            </p>
          </div>
        </div>
        <span className="flex-shrink-0 px-3 py-1 text-xs font-bold rounded-full"
          style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
          {level}
          {da.refined_total_score !== undefined && ` (${da.refined_total_score})`}
        </span>
      </div>

      {/* Quick stats row */}
      <div className="px-5 py-3 flex flex-wrap gap-4 border-b" style={{ borderColor: '#F1F5F9', background: T.light50 }}>
        {[
          { label: 'LOD', value: da.total_lod_count, color: T.primary, warn: da.total_lod_count > 0 },
          { label: 'Table Calcs', value: da.total_table_calc_count, color: '#0284C7', warn: da.total_table_calc_count > 0 },
          { label: 'Parameters', value: da.total_parameter_count, color: T.teal, warn: false },
          { label: 'Dimensions', value: da.total_dimensions, color: '#64748B', warn: false },
          { label: 'Measures', value: da.total_measures, color: '#64748B', warn: false },
          { label: 'Extensions', value: da.total_extensions, color: '#DC2626', warn: da.total_extensions > 0 },
          { label: 'Actions', value: da.filter_action_count + da.set_action_count + da.parameter_action_count + da.url_action_count, color: '#7C3AED', warn: da.has_set_actions },
          { label: 'Sets', value: da.sets.length, color: '#D97706', warn: da.has_set_actions },
        ].filter(s => s.value > 0).map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-[10px] text-slate-500">{s.label}</span>
            <span className="text-xs font-bold tabular-nums" style={{ color: s.warn ? s.color : '#334155' }}>{s.value}</span>
          </div>
        ))}
        {da.has_viz_in_tooltip && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: '#7C3AED' }} />
            <span className="text-[10px] font-bold" style={{ color: '#7C3AED' }}>Viz-in-Tooltip</span>
          </div>
        )}
        {da.has_custom_sql && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: '#DC2626' }} />
            <span className="text-[10px] font-bold text-red-600">Custom SQL</span>
          </div>
        )}
        {da.parse_errors.length > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] text-amber-600 font-medium">Parse errors: {da.parse_errors.length}</span>
          </div>
        )}
      </div>

      {/* Sub-tab navigation */}
      <div className="px-5 pt-3 pb-0 flex gap-1">
        {sectionTabs.filter(t => t.show).map(t => (
          <button key={t.id} type="button" onClick={() => setSection(t.id)}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors"
            style={section === t.id
              ? { background: T.dark, color: 'white' }
              : { background: '#F1F5F9', color: '#64748B' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="p-4">
        {/* Calculated fields */}
        {section === 'calcs' && (
          <div>
            {da.calc_fields.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-4">No calculated fields found</p>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[10px] text-slate-400 font-medium">
                    {da.lod_expressions.length > 0 && `${da.lod_expressions.length} LOD  ·  `}
                    {da.table_calcs.length > 0 && `${da.table_calcs.length} Table Calcs  ·  `}
                    {da.total_calc_fields - da.lod_expressions.length - da.table_calcs.length > 0 &&
                      `${da.total_calc_fields - da.lod_expressions.length - da.table_calcs.length} Standard`}
                  </span>
                </div>
                {da.calc_fields.slice(0, 50).map((cf, i) => (
                  <FormulaRow key={i} cf={cf} index={i} />
                ))}
                {da.calc_fields.length > 50 && (
                  <p className="text-xs text-slate-400 text-center pt-2">+ {da.calc_fields.length - 50} more calculated fields</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        {section === 'filters' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
              {[
                { label: 'Extract', value: da.extract_filter_count, color: '#7C3AED' },
                { label: 'Datasource', value: da.datasource_filter_count, color: T.dark },
                { label: 'Context', value: da.context_filter_count, color: T.primary },
                { label: 'Dimension', value: da.dimension_filter_count, color: '#0284C7' },
                { label: 'Measure', value: da.measure_filter_count, color: T.teal },
              ].map((f, i) => (
                <div key={i} className="px-3 py-2 rounded-xl text-center"
                  style={{ background: T.light50, border: `1px solid ${T.light200}` }}>
                  <div className="text-base font-black tabular-nums" style={{ color: f.color }}>{f.value}</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parameters */}
        {section === 'params' && (
          <div className="space-y-2">
            {da.parameters.slice(0, 30).map((p, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl"
                style={{ background: i % 2 === 0 ? T.light50 : 'white', border: `1px solid ${T.light200}` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Target className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.primary }} />
                  <span className="text-xs font-bold text-slate-800 truncate">{p.caption || p.name}</span>
                  <span className="text-[10px] text-slate-400">{p.datatype}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {p.allowable_values_type !== 'all' && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded font-medium"
                      style={{ background: T.light100, color: T.dark }}>{p.allowable_values_type}</span>
                  )}
                  {p.current_value && (
                    <span className="text-[10px] text-slate-500 font-mono">{p.current_value}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Structure */}
        {section === 'structure' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Dashboards', value: da.total_dashboards, icon: Layers, sub: da.has_floating_objects ? 'floating objects' : da.has_device_layouts ? 'device layouts' : '' },
              { label: 'Actions', value: da.actions.length, icon: Zap, sub: [da.has_set_actions && 'set actions', da.has_parameter_actions && 'param actions'].filter(Boolean).join(', ') },
              { label: 'Sets', value: da.sets.length, icon: Globe, sub: da.combined_set_count > 0 ? `${da.combined_set_count} combined` : '' },
              { label: 'Hierarchies', value: da.hierarchy_count, icon: Layers, sub: '' },
              { label: 'Groups', value: da.group_count, icon: Users, sub: '' },
              { label: 'Stories', value: da.story_count, icon: BookOpen, sub: da.story_count > 0 ? `${da.story_point_count} story points` : '' },
              { label: 'Extensions', value: da.total_extensions, icon: Code2, sub: da.total_extensions > 0 ? 'requires AppSource review' : '' },
              { label: 'Mark Types', value: da.unique_mark_types.length, icon: BarChart3, sub: da.unique_mark_types.slice(0, 3).join(', ') },
              { label: 'Sorts', value: da.sort_count, icon: Activity, sub: da.custom_sort_count > 0 ? `${da.custom_sort_count} custom` : '' },
            ].map((s, i) => (
              <div key={i} className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: T.light50, border: `1px solid ${T.light200}` }}>
                <s.icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: T.primary }} />
                <div className="min-w-0">
                  <div className="text-lg font-black tabular-nums" style={{ color: T.dark }}>{s.value}</div>
                  <div className="text-[11px] font-semibold text-slate-700">{s.label}</div>
                  {s.sub && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{s.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DeepAnalysisTab({ analyses }: { analyses: WorkbookDeepAnalysis[] }) {
  const [filter, setFilter] = useState<string>('all')
  const levels = ['all', 'Simple', 'Moderate', 'Complex', 'Very Complex']

  const filtered = filter === 'all'
    ? analyses
    : analyses.filter(a => (a.refined_complexity_level || 'Simple') === filter)

  const totals = {
    calcs: analyses.reduce((s, a) => s + a.total_calc_fields, 0),
    lods: analyses.reduce((s, a) => s + a.total_lod_count, 0),
    tableCalcs: analyses.reduce((s, a) => s + a.total_table_calc_count, 0),
    params: analyses.reduce((s, a) => s + a.total_parameter_count, 0),
    extensions: analyses.reduce((s, a) => s + a.total_extensions, 0),
    hasVIT: analyses.some(a => a.has_viz_in_tooltip),
    hasSQL: analyses.some(a => a.has_custom_sql),
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Workbooks Parsed', value: analyses.length, color: T.dark, icon: FlaskConical },
          { label: 'Calculated Fields', value: totals.calcs, color: T.primary, icon: Code2 },
          { label: 'LOD Expressions', value: totals.lods, color: '#C2410C', icon: Zap, warn: totals.lods > 0 },
          { label: 'Table Calcs', value: totals.tableCalcs, color: '#0284C7', icon: Activity, warn: totals.tableCalcs > 0 },
          { label: 'Parameters', value: totals.params, color: T.teal, icon: Target },
          { label: 'Extensions', value: totals.extensions, color: '#DC2626', icon: Globe, warn: totals.extensions > 0 },
          { label: 'Viz-in-Tooltip', value: totals.hasVIT ? 'Yes' : 'No', color: totals.hasVIT ? '#7C3AED' : '#22C55E', icon: Layers },
          { label: 'Custom SQL', value: totals.hasSQL ? 'Yes' : 'No', color: totals.hasSQL ? '#DC2626' : '#22C55E', icon: Database },
        ].map((stat, i) => (
          <div key={i} className="rounded-2xl p-4 flex items-start gap-3"
            style={{ background: 'white', border: `1px solid ${T.light200}`, boxShadow: T.card }}>
            <stat.icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: stat.color }} />
            <div>
              <div className="text-xl font-black tabular-nums" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-[11px] text-slate-500 font-medium mt-0.5">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 font-medium">Filter by complexity:</span>
        {levels.map(l => (
          <button key={l} type="button" onClick={() => setFilter(l)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors"
            style={filter === l
              ? { background: T.dark, color: 'white' }
              : { background: T.light50, color: '#64748B', border: `1px solid ${T.light200}` }}>
            {l === 'all' ? `All (${analyses.length})` : `${l} (${analyses.filter(a => (a.refined_complexity_level || 'Simple') === l).length})`}
          </button>
        ))}
      </div>

      {/* Per-workbook analysis cards */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-8">No workbooks match the selected filter</p>
      ) : (
        filtered.map((da, i) => (
          <WorkbookAnalysisCard key={da.workbook_name + i} da={da} index={i} />
        ))
      )}
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange, hasMigration, hasDeepAnalysis }: {
  active: Tab; onChange: (t: Tab) => void; hasMigration: boolean; hasDeepAnalysis: boolean
}) {
  const tabs: { id: Tab; label: string; icon: React.ElementType; special?: boolean }[] = [
    { id: 'overview',    label: 'Overview',    icon: Activity },
    { id: 'migration',   label: 'Migration',   icon: TrendingUp, special: true },
    { id: 'workbooks',   label: 'Workbooks',   icon: BarChart3 },
    { id: 'datasources', label: 'Data Sources', icon: Database },
    { id: 'users',       label: 'Users',       icon: Users },
    { id: 'quality',     label: 'Quality',     icon: Shield },
    { id: 'analysis',    label: 'Formula Analysis', icon: FlaskConical, special: true },
  ]
  return (
    <div className="flex items-center gap-1 p-1 rounded-2xl border border-slate-200/80 flex-wrap"
      style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)', boxShadow: T.shadow }}>
      {tabs.filter(t => {
        if (t.id === 'migration' && !hasMigration) return false
        if (t.id === 'analysis' && !hasDeepAnalysis) return false
        return true
      }).map(tab => {
        const isActive = active === tab.id
        return (
          <button key={tab.id} type="button" onClick={() => onChange(tab.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150"
            style={isActive
              ? {
                  background: tab.id === 'migration' || tab.id === 'analysis'
                    ? `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`
                    : `linear-gradient(135deg, ${T.dark} 0%, #2C4D8A 100%)`,
                  color: 'white',
                  boxShadow: tab.id === 'migration' || tab.id === 'analysis' ? T.shadowBtn : `0 2px 8px ${T.glowD}`,
                }
              : { color: '#64748B', background: 'transparent' }}>
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Migration complexity bar ──────────────────────────────────────────────────

function ComplexityBar({ mf }: { mf: MigrationFeasibilityReport }) {
  const total = mf.total_workbooks_assessed || 1
  const segments = [
    { label: 'Simple',       value: mf.simple_workbooks,       color: '#22C55E', width: (mf.simple_workbooks / total) * 100 },
    { label: 'Moderate',     value: mf.moderate_workbooks,     color: '#F59E0B', width: (mf.moderate_workbooks / total) * 100 },
    { label: 'Complex',      value: mf.complex_workbooks,      color: '#F97316', width: (mf.complex_workbooks / total) * 100 },
    { label: 'Very Complex', value: mf.very_complex_workbooks, color: '#F43F5E', width: (mf.very_complex_workbooks / total) * 100 },
  ]
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
        {segments.filter(s => s.value > 0).map((s, i) => (
          <div key={i} className="h-full transition-all duration-700 rounded-sm"
            style={{ width: `${s.width}%`, background: s.color, minWidth: s.value > 0 ? '4px' : '0' }}
            title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-xs text-slate-600 font-medium">{s.label}</span>
            <span className="text-xs font-bold" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Migration workbook score row ──────────────────────────────────────────────

function WorkbookScoreRow({ score, index }: { score: WorkbookMigrationScore; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = COMPLEXITY_CONFIG[score.complexity_level] || COMPLEXITY_CONFIG.Simple
  const pct = Math.min((score.total_score / 80) * 100, 100)

  return (
    <div className="rounded-xl overflow-hidden border"
      style={{ borderColor: cfg.border, background: cfg.bg }}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}>
        <div className="shrink-0 h-6 w-6 rounded-lg flex items-center justify-center text-xs font-bold text-white"
          style={{ background: cfg.dot }}>{index + 1}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{score.workbook_name}</p>
          <p className="text-xs text-slate-500">{score.project_name}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:block w-20">
            <div className="h-1.5 rounded-full bg-white/60 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: cfg.dot }} />
            </div>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'white', color: cfg.text, border: `1px solid ${cfg.border}` }}>
            {score.complexity_level}
          </span>
          <span className="text-xs font-mono font-bold" style={{ color: cfg.text }}>
            {score.total_score}/80
          </span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
            : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: cfg.border }}>
          <div className="grid grid-cols-4 gap-2 mt-3 mb-3">
            {[
              { label: 'Data Src', value: score.data_source_complexity },
              { label: 'Calc Fields', value: score.calc_field_complexity },
              { label: 'Table Calcs', value: score.table_calc_complexity },
              { label: 'Actions', value: score.dashboard_action_complexity },
              { label: 'RLS', value: score.rls_complexity },
              { label: 'Extensions', value: score.extension_complexity },
              { label: 'Viz Type', value: score.viz_type_complexity },
              { label: 'Parameters', value: score.parameter_complexity },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg p-2 text-center"
                style={{ background: 'rgba(255,255,255,0.6)' }}>
                <p className="text-base font-black" style={{ color: cfg.dot }}>{value}</p>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">{label}</p>
              </div>
            ))}
          </div>
          {score.migration_blockers.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-bold text-red-700 mb-1">Blockers</p>
              {score.migration_blockers.map((b, i) => (
                <div key={i} className="flex gap-1.5 text-xs text-red-700 mb-0.5">
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          )}
          {score.migration_warnings.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-bold text-amber-700 mb-1">Warnings</p>
              {score.migration_warnings.map((w, i) => (
                <div key={i} className="flex gap-1.5 text-xs text-amber-700 mb-0.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
          {score.pbi_equivalent_notes.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-600 mb-1">Power BI Equivalents</p>
              {score.pbi_equivalent_notes.slice(0, 3).map((n, i) => (
                <div key={i} className="flex gap-1.5 text-xs text-slate-600 mb-0.5">
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
                  <span>{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Feature mapping row ───────────────────────────────────────────────────────

function FeatureMappingTable({ mapping }: { mapping: { tableau: string; power_bi: string; feasibility: string; notes: string }[] }) {
  const feasColor = (f: string) => f === 'Direct' ? '#22C55E' : f === 'Moderate' ? '#F59E0B' : '#F43F5E'
  const feasBg    = (f: string) => f === 'Direct' ? '#F0FDF4' : f === 'Moderate' ? '#FFFBEB' : '#FFF1F2'
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: T.dark }}>
            {['Tableau Concept', 'Power BI Equivalent', 'Feasibility', 'Notes'].map((h, i) => (
              <th key={i} className="px-3 py-2.5 text-left font-semibold text-white whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mapping.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? T.light50 : 'white' }}>
              <td className="px-3 py-2 font-medium text-slate-800">{row.tableau}</td>
              <td className="px-3 py-2 text-blue-700 font-medium">{row.power_bi}</td>
              <td className="px-3 py-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: feasBg(row.feasibility), color: feasColor(row.feasibility) }}>
                  {row.feasibility}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-600 max-w-xs">{row.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Download button ───────────────────────────────────────────────────────────

function DownloadBtn({ label, icon: Icon, onClick, loading, variant = 'primary' }: {
  label: string; icon: React.ElementType; onClick: () => void; loading: boolean; variant?: 'primary' | 'secondary'
}) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-50"
      style={variant === 'primary'
        ? { background: `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`, color: 'white', boxShadow: T.shadowBtn }
        : { background: 'white', color: T.dark, border: `1.5px solid ${T.light200}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TableauSessionDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate  = useNavigate()

  const [status,          setStatus]          = useState('pending')
  const [progressMessage, setProgressMessage] = useState('')
  const [error,           setError]           = useState('')
  const [results,         setResults]         = useState<TableauAssessmentResult | null>(null)
  const [label,           setLabel]           = useState('')
  const [loadError,       setLoadError]       = useState('')
  const [dlExcel,         setDlExcel]         = useState(false)
  const [dlWord,          setDlWord]          = useState(false)
  const [dlAiWord,        setDlAiWord]        = useState(false)
  const [activeTab,       setActiveTab]       = useState<Tab>('overview')

  const headerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = headerRef.current; if (!el) return
    el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 280ms ease, transform 280ms ease'
      el.style.opacity = '1'; el.style.transform = 'translateY(0)'
    })
  }, [])

  const loadStatus = useCallback(async () => {
    if (!jobId) return
    try {
      const { data } = await api.tableauGetJobStatus(jobId)
      setStatus(data.status)
      setProgressMessage(data.progress_message || '')
      if (data.error) setError(data.error)
      if (data.status === 'completed' && !results) {
        const { data: res } = await api.tableauGetJobResults(jobId)
        setResults(res)
        setLabel(res.label || '')
      }
    } catch (err) {
      setLoadError(getApiErrorMessage(err))
    }
  }, [jobId, results])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => {
    if (status === 'completed' || status === 'failed') return
    const interval = setInterval(loadStatus, 2500)
    return () => clearInterval(interval)
  }, [status, loadStatus])

  const handleDownloadExcel = async () => {
    if (!jobId) return; setDlExcel(true)
    try { await api.tableauDownloadExcelReport(jobId, label) } catch { }
    finally { setDlExcel(false) }
  }

  const handleDownloadWord = async () => {
    if (!jobId) return; setDlWord(true)
    try { await api.tableauDownloadWordReport(jobId, label) } catch { }
    finally { setDlWord(false) }
  }

  const handleDownloadAiWord = async () => {
    if (!jobId) return; setDlAiWord(true)
    try { await api.tableauRegenerateWordReport(jobId, label) } catch { }
    finally { setDlAiWord(false) }
  }

  const si  = results?.server_info
  const ws  = results?.workbook_summary
  const ds  = results?.datasource_summary
  const up  = results?.user_profile
  const eh  = results?.extract_health
  const dq  = results?.data_quality
  const mf  = results?.migration_feasibility
  const hasMigration = !!mf
  const deepAnalyses = results?.workbook_deep_analysis ?? []
  const hasDeepAnalysis = deepAnalyses.length > 0

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div ref={headerRef}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/tableau/sessions')}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 transition-all duration-150"
              style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.light200 }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '' }}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{
                background: '#F8FAFF',
                border: '1px solid #C5D5EC',
                boxShadow: `0 4px 14px ${T.glow}`,
              }}>
              <TableauLogo size={32} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                {si?.site_name || label || `Assessment ${jobId?.slice(0, 8)}`}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background: status === 'completed' ? T.light100 : status === 'failed' ? '#FEE2E2' : status === 'running' ? '#DBEAFE' : '#F1F5F9',
                    color: status === 'completed' ? T.dark : status === 'failed' ? '#991B1B' : status === 'running' ? '#1E40AF' : '#64748B',
                  }}>
                  {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                  {status === 'failed' && <XCircle className="h-3 w-3" />}
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
                {si?.server_url && (
                  <span className="text-xs text-slate-400 truncate max-w-[200px]">{si.server_url}</span>
                )}
                {mf && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      background: FEASIBILITY_CONFIG[mf.overall_feasibility]?.bg,
                      color: FEASIBILITY_CONFIG[mf.overall_feasibility]?.text,
                    }}>
                    <Target className="h-3 w-3" />
                    Migration: {mf.overall_feasibility} Feasibility
                  </span>
                )}
              </div>
            </div>
          </div>

          {status === 'completed' && (
            <div className="flex items-center gap-2 flex-wrap">
              <DownloadBtn label="Excel" icon={FileSpreadsheet} onClick={handleDownloadExcel} loading={dlExcel} variant="secondary" />
              <DownloadBtn label="Word Report" icon={BookOpen} onClick={handleDownloadWord} loading={dlWord} variant="secondary" />
              <DownloadBtn label="AI Migration Report" icon={Sparkles} onClick={handleDownloadAiWord} loading={dlAiWord} variant="primary" />
            </div>
          )}
        </div>
      </div>

      {/* Initial spinner */}
      {!loadError && status === 'pending' && !progressMessage && !results && (
        <Loader3D message="Fetching assessment…" />
      )}

      {/* Load error */}
      {loadError && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      )}

      {/* Progress terminal */}
      {(status === 'running' || status === 'pending' || (status === 'failed' && !results)) && (
        <AssessmentTerminal status={status} progressMessage={progressMessage} error={error} />
      )}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {results && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard label="Workbooks"    value={ws?.total_workbooks ?? 0}     sub={`${ws?.total_views ?? 0} views`}               icon={BarChart3}  accent  index={0} />
            <KPICard label="Data Sources" value={ds?.total_datasources ?? 0}   sub={`${ds?.certified_datasources ?? 0} certified`} icon={Database}         index={1} />
            <KPICard label="Users"        value={up?.total_users ?? 0}          sub={`${up?.creator_users ?? 0} creators`}          icon={Users}            index={2} />
            <KPICard label="Projects"     value={results.projects?.length ?? 0} sub="workspaces"                                   icon={Layers}           index={3} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard label="Sheets"      value={ws?.total_sheets ?? 0}       sub="published sheets"     icon={FileText}  index={4} />
            <KPICard label="Dashboards"  value={ws?.total_dashboards ?? 0}   sub="interactive"          icon={BarChart3} index={5} />
            <KPICard label="Prep Flows"  value={results.flows?.length ?? 0}  sub="→ Dataflow Gen2"      icon={Zap}       index={6} />
            <KPICard label="Failed Jobs" value={eh?.failed_jobs ?? 0}        sub="extract failures"     icon={AlertTriangle} warn={(eh?.failed_jobs ?? 0) > 0} index={7} />
          </div>

          {/* Migration summary card (pinned, always visible) */}
          {mf && (
            <div className="rounded-2xl border overflow-hidden"
              style={{
                borderColor: T.light200,
                boxShadow: `0 0 0 1px ${T.light200}, 0 4px 24px ${T.glow}`,
                background: `linear-gradient(135deg, ${T.light50} 0%, white 60%)`,
              }}>
              <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: T.light200 }}>
                <div className="h-9 w-9 rounded-xl flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${T.primary} 0%, ${T.accent} 100%)`, boxShadow: T.shadowBtn }}>
                  <TrendingUp className="h-4.5 w-4.5 text-white" style={{ width: '18px', height: '18px' }} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Power BI Migration Feasibility</h2>
                  <p className="text-xs text-slate-500">
                    {mf.total_workbooks_assessed} workbooks scored · {mf.estimated_migration_weeks} weeks estimated
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-medium">Overall</p>
                    <p className="text-sm font-black" style={{ color: FEASIBILITY_CONFIG[mf.overall_feasibility]?.color }}>
                      {mf.overall_feasibility}
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4">
                <ComplexityBar mf={mf} />
                {mf.migration_blockers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {mf.migration_blockers.map((b, i) => (
                      <span key={i} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                        style={{ background: '#FFF1F2', color: '#9F1239', border: '1px solid #FECDD3' }}>
                        <AlertTriangle className="h-3 w-3" />{b.slice(0, 60)}{b.length > 60 ? '…' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab navigation */}
          <TabBar active={activeTab} onChange={setActiveTab} hasMigration={hasMigration} hasDeepAnalysis={hasDeepAnalysis} />

          {/* ── Overview tab ─────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {si && (
                <SectionCard title="Server Information" icon={Globe} defaultOpen>
                  <KVTable rows={[
                    ['Server URL', si.server_url],
                    ['Site Name', si.site_name],
                    ['Server Version', si.server_version],
                    ['Site ID', si.site_id || '—'],
                  ]} />
                </SectionCard>
              )}

              {ws && (
                <SectionCard title="Workbook Summary" icon={BarChart3} defaultOpen>
                  <KVTable rows={[
                    ['Total Workbooks', ws.total_workbooks],
                    ['Total Views', ws.total_views],
                    ['Total Sheets', ws.total_sheets],
                    ['Total Dashboards', ws.total_dashboards],
                    ['Workbooks with Extracts', ws.workbooks_with_extracts],
                    ['Avg Views per Workbook', ws.avg_views_per_workbook.toFixed(1)],
                  ]} />
                </SectionCard>
              )}

              {ds && (
                <SectionCard title="Data Source Summary" icon={Database} defaultOpen>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                    {[
                      { label: 'Total', value: ds.total_datasources },
                      { label: 'Published', value: ds.published_datasources },
                      { label: 'Certified', value: ds.certified_datasources },
                      { label: 'With Extracts', value: ds.extract_datasources },
                      { label: 'Live', value: ds.live_datasources },
                      { label: 'Embedded', value: ds.embedded_datasources },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl px-3 py-2.5 text-center"
                        style={{ background: T.light50, border: `1px solid ${T.light200}` }}>
                        <p className="text-xl font-black tabular-nums" style={{ color: T.primary }}>{value.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</p>
                      </div>
                    ))}
                  </div>
                  {ds.connection_types.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">Connection Types Detected</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ds.connection_types.map(ct => (
                          <span key={ct} className="text-xs px-2.5 py-1 rounded-full font-medium"
                            style={{ background: T.light100, color: T.dark, border: `1px solid ${T.light200}` }}>
                            {ct}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </SectionCard>
              )}

              {eh && (
                <SectionCard title="Extract Refresh Health" icon={RefreshCw}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Total Schedules', value: eh.total_schedules, warn: false },
                      { label: 'Active', value: eh.active_schedules, warn: false },
                      { label: 'Suspended', value: eh.suspended_schedules, warn: eh.suspended_schedules > 0 },
                      { label: 'Total Jobs', value: eh.total_refresh_jobs, warn: false },
                      { label: 'Successful', value: eh.successful_jobs, warn: false },
                      { label: 'Failed', value: eh.failed_jobs, warn: eh.failed_jobs > 0 },
                      { label: 'Cancelled', value: eh.cancelled_jobs, warn: false },
                      { label: 'Stale Sources', value: eh.stale_datasources, warn: eh.stale_datasources > 0 },
                    ].map(({ label, value, warn }) => (
                      <div key={label} className="rounded-xl px-3 py-2.5 text-center"
                        style={{ background: warn && value > 0 ? '#FFF5F5' : T.light50, border: `1px solid ${warn && value > 0 ? '#FECACA' : T.light200}` }}>
                        <p className="text-xl font-black tabular-nums"
                          style={{ color: warn && value > 0 ? '#DC2626' : T.primary }}>{value.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {/* ── Migration tab ─────────────────────────────────────────────── */}
          {activeTab === 'migration' && mf && (
            <div className="space-y-4">
              {/* Feature detection flags */}
              <SectionCard title="Features Detected in Environment" icon={Info} defaultOpen>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: 'Tableau Prep Flows', value: mf.has_prep_flows, note: '→ Dataflow Gen2' },
                    { label: 'Row-Level Security', value: mf.has_rls, note: '→ Power BI RLS roles' },
                    { label: 'Custom SQL', value: mf.has_custom_sql, note: '→ Power Query / DirectQuery' },
                    { label: 'Extensions', value: mf.has_tableau_extensions, note: '→ AppSource custom visuals' },
                    { label: 'Viz-in-Tooltip', value: mf.has_viz_in_tooltip, note: '→ Report page tooltip' },
                    { label: 'Parameter Actions', value: mf.has_parameter_actions, note: '→ Field parameters' },
                  ].map(({ label, value, note }) => (
                    <div key={label} className="rounded-xl px-3 py-2.5"
                      style={{ background: T.light50, border: `1px solid ${T.light200}` }}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-semibold text-slate-700">{label}</span>
                        {value
                          ? <CheckCircle2 className="h-4 w-4" style={{ color: T.primary }} />
                          : <div className="h-4 w-4 rounded-full border-2 border-slate-300" />}
                      </div>
                      <span className="text-[10px] text-slate-500">{note}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1.5">Migratable Connections</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mf.migratable_connections.length > 0
                        ? mf.migratable_connections.map(c => (
                            <span key={c} className="text-xs px-2.5 py-1 rounded-full font-medium"
                              style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>{c}</span>
                          ))
                        : <span className="text-xs text-slate-400">None identified</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1.5">Complex Connections</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mf.complex_connections.length > 0
                        ? mf.complex_connections.map(c => (
                            <span key={c} className="text-xs px-2.5 py-1 rounded-full font-medium"
                              style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>{c}</span>
                          ))
                        : <span className="text-xs text-slate-400">None identified</span>}
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Workbook scores */}
              <SectionCard title="Workbook Migration Scores" icon={Target} badge={mf.workbook_scores.length} accent defaultOpen>
                <div className="mb-4">
                  <ComplexityBar mf={mf} />
                </div>
                <div className="space-y-2">
                  {mf.workbook_scores.map((score, i) => (
                    <WorkbookScoreRow key={score.workbook_name} score={score} index={i} />
                  ))}
                </div>
              </SectionCard>

              {/* Feature mapping */}
              {mf.feature_mapping.length > 0 && (
                <SectionCard title="Tableau → Power BI Feature Mapping" icon={ArrowRight} badge={mf.feature_mapping.length}>
                  <div className="mb-3 flex gap-3">
                    {[
                      { label: 'Direct', color: '#22C55E', bg: '#F0FDF4' },
                      { label: 'Moderate', color: '#F59E0B', bg: '#FFFBEB' },
                      { label: 'Complex', color: '#F43F5E', bg: '#FFF1F2' },
                    ].map(({ label, color, bg }) => (
                      <span key={label} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold"
                        style={{ background: bg, color }}>
                        <div className="h-2 w-2 rounded-full" style={{ background: color }} />
                        {label}
                      </span>
                    ))}
                  </div>
                  <FeatureMappingTable mapping={mf.feature_mapping} />
                </SectionCard>
              )}

              {/* Recommended migration order */}
              {mf.recommended_migration_order.length > 0 && (
                <SectionCard title="Recommended Migration Order" icon={Layers}>
                  <p className="text-xs text-slate-500 mb-3">
                    Start with Simple workbooks to establish patterns, then Moderate, then Complex with dedicated sprints.
                  </p>
                  <div className="space-y-1.5">
                    {mf.recommended_migration_order.map((name, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                        style={{ background: i % 2 === 0 ? T.light50 : 'white', border: `1px solid ${T.light200}` }}>
                        <span className="text-xs font-black tabular-nums text-slate-400 w-5 text-right">{i + 1}</span>
                        <span className="text-xs font-medium text-slate-700">{name}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400 ml-auto" />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {/* ── Workbooks tab ──────────────────────────────────────────────── */}
          {activeTab === 'workbooks' && (
            <div className="space-y-4">
              <SectionCard title={`Workbooks (${results.workbooks?.length ?? 0})`} icon={BarChart3} defaultOpen>
                {results.workbooks && results.workbooks.length > 0 ? (
                  <>
                    <DataTable
                      compact
                      headers={['Name', 'Project', 'Owner', 'Views', 'Size MB', 'Tags']}
                      rows={results.workbooks.slice(0, 100).map(wb => [
                        wb.name, wb.project_name, wb.owner_name, wb.view_count, wb.size_mb.toFixed(1), wb.tag_count,
                      ])}
                    />
                    {results.workbooks.length > 100 && (
                      <p className="text-xs text-slate-400 mt-2 text-center">
                        Showing 100 of {results.workbooks.length}
                      </p>
                    )}
                  </>
                ) : <p className="text-xs text-slate-400">No workbooks found.</p>}
              </SectionCard>

              {results.views && results.views.length > 0 && (
                <SectionCard title={`Views (${results.views.length})`} icon={FileText}>
                  <DataTable
                    compact
                    headers={['View Name', 'Workbook', 'Owner', 'Type', 'Total Views']}
                    rows={results.views.slice(0, 50).map(v => [
                      v.name, v.workbook_name, v.owner_name, v.view_type || 'sheet', v.total_views,
                    ])}
                  />
                </SectionCard>
              )}

              {results.projects && results.projects.length > 0 && (
                <SectionCard title={`Projects (${results.projects.length})`} icon={Layers}>
                  <DataTable
                    compact
                    headers={['Project Name', 'Content Permissions', 'Description']}
                    rows={results.projects.slice(0, 50).map(p => [
                      p.name, p.content_permissions, p.description || '—',
                    ])}
                  />
                </SectionCard>
              )}

              {results.flows && results.flows.length > 0 && (
                <SectionCard title={`Prep Flows (${results.flows.length})`} icon={Zap} accent>
                  <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: T.light100, border: `1px solid ${T.light200}` }}>
                    <ArrowRight className="h-4 w-4 shrink-0" style={{ color: T.primary }} />
                    <p className="text-xs font-medium text-slate-700">
                      Prep Flows migrate to <strong>Dataflow Gen2</strong> on Microsoft Fabric.
                      Power Query M handles clean steps; joins and aggregates map to Dataflow Gen2 directly.
                    </p>
                  </div>
                  <DataTable
                    compact
                    headers={['Flow Name', 'Project', 'Owner', 'Updated']}
                    rows={results.flows.slice(0, 30).map(f => [
                      f.name, f.project_name, f.owner_name, f.updated_at || '—',
                    ])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ── Data Sources tab ────────────────────────────────────────────── */}
          {activeTab === 'datasources' && (
            <div className="space-y-4">
              <SectionCard title={`Data Sources (${results.datasources?.length ?? 0})`} icon={Database} defaultOpen>
                {ds && (
                  <div className="flex gap-6 mb-4">
                    <DonutChart
                      size={120}
                      label={`${ds.total_datasources}`}
                      data={[
                        { label: 'Published', value: ds.published_datasources, color: T.primary },
                        { label: 'Embedded', value: ds.embedded_datasources, color: T.dark },
                      ]}
                    />
                    <div className="flex flex-col justify-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ background: T.primary }} />
                        <span className="text-xs text-slate-600">Published: <strong>{ds.published_datasources}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ background: T.dark }} />
                        <span className="text-xs text-slate-600">Embedded: <strong>{ds.embedded_datasources}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#22C55E' }} />
                        <span className="text-xs text-slate-600">Certified: <strong>{ds.certified_datasources}</strong></span>
                      </div>
                    </div>
                  </div>
                )}
                {results.datasources && results.datasources.length > 0 ? (
                  <DataTable
                    compact
                    headers={['Name', 'Project', 'Type', 'Connection', 'Extract', 'Certified', 'Size MB']}
                    rows={results.datasources.slice(0, 100).map(d => [
                      d.name, d.project_name, d.datasource_type,
                      d.connection_type || '—',
                      d.has_extracts ? 'Yes' : 'No',
                      d.is_certified ? 'Yes' : 'No',
                      d.size_mb.toFixed(1),
                    ])}
                  />
                ) : <p className="text-xs text-slate-400">No data sources found.</p>}
              </SectionCard>
            </div>
          )}

          {/* ── Users tab ─────────────────────────────────────────────────── */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {up && (
                <SectionCard title="User Role Distribution" icon={Users} defaultOpen>
                  <div className="flex gap-6 mb-4">
                    <DonutChart
                      size={130}
                      label={`${up.total_users}`}
                      data={[
                        { label: 'Creators', value: up.creator_users, color: T.primary },
                        { label: 'Explorers', value: up.explorer_users, color: T.dark },
                        { label: 'Viewers', value: up.viewer_users, color: '#94A3B8' },
                        { label: 'Admins', value: up.admin_users, color: '#F59E0B' },
                        { label: 'Unlicensed', value: up.unlicensed_users, color: '#E2E8F0' },
                      ]}
                    />
                    <div className="flex flex-col justify-center gap-2">
                      {[
                        { label: 'Creators', value: up.creator_users, color: T.primary },
                        { label: 'Explorers', value: up.explorer_users, color: T.dark },
                        { label: 'Viewers', value: up.viewer_users, color: '#94A3B8' },
                        { label: 'Admins', value: up.admin_users, color: '#F59E0B' },
                        { label: 'Unlicensed', value: up.unlicensed_users, color: '#E2E8F0' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                          <span className="text-xs text-slate-600">{label}:</span>
                          <span className="text-xs font-bold text-slate-800">{value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: T.light100, border: `1px solid ${T.light200}` }}>
                    <ArrowRight className="h-4 w-4 shrink-0" style={{ color: T.primary }} />
                    <p className="text-xs font-medium text-slate-700">
                      Power BI equivalent: Creators → <strong>Pro/PPU license</strong>,
                      Explorers → <strong>Pro viewer</strong>,
                      Viewers → <strong>Free viewer (Premium)</strong>,
                      Admins → <strong>Workspace Admin</strong>.
                    </p>
                  </div>
                </SectionCard>
              )}

              {results.groups && results.groups.length > 0 && (
                <SectionCard title={`Groups (${results.groups.length})`} icon={Users}>
                  <DataTable
                    compact
                    headers={['Group Name', 'Domain', 'Members']}
                    rows={results.groups.slice(0, 50).map(g => [g.name, g.domain_name || '—', g.member_count])}
                  />
                </SectionCard>
              )}

              {results.users_list && results.users_list.length > 0 && (
                <SectionCard title={`User Roster (${results.users_list.length})`} icon={Users}>
                  <DataTable
                    compact
                    headers={['Username', 'Email', 'Role', 'Site Role']}
                    rows={results.users_list.slice(0, 50).map(u => [
                      u.name || u.username || '—',
                      u.email || '—',
                      u.role || '—',
                      u.site_role || '—',
                    ])}
                  />
                  {results.users_list.length > 50 && (
                    <p className="text-xs text-slate-400 mt-2 text-center">Showing 50 of {results.users_list.length}</p>
                  )}
                </SectionCard>
              )}
            </div>
          )}

          {/* ── Quality tab ───────────────────────────────────────────────── */}
          {activeTab === 'quality' && dq && (
            <div className="space-y-4">
              <SectionCard title="Data Quality Flags" icon={Shield} defaultOpen>
                <div className="space-y-2">
                  {[
                    { label: 'Failed Extract Jobs',                value: dq.failed_extract_jobs,                severity: 'high' },
                    { label: 'Stale Extracts (>7 days)',           value: dq.stale_extracts_over_7_days,         severity: 'high' },
                    { label: 'Workbooks with No Views',            value: dq.workbooks_with_no_views,            severity: 'medium' },
                    { label: 'Uncertified Published Data Sources', value: dq.uncertified_published_datasources,  severity: 'low' },
                    { label: 'Users with No Recent Activity',      value: dq.users_with_no_activity,             severity: 'low' },
                  ].map(({ label, value, severity }) => {
                    const sevColor  = { high: '#DC2626', medium: '#D97706', low: '#059669' }[severity]
                    const sevBg     = { high: '#FFF5F5', medium: '#FFFBEB', low: '#F0FDF4' }[severity]
                    const sevBorder = { high: '#FECACA', medium: '#FDE68A', low: '#BBF7D0' }[severity]
                    return (
                      <div key={label} className="flex items-center justify-between px-4 py-3 rounded-xl"
                        style={{ background: value > 0 ? sevBg : T.light50, border: `1px solid ${value > 0 ? sevBorder : T.light200}` }}>
                        <span className="text-xs font-medium text-slate-700">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black tabular-nums"
                            style={{ color: value > 0 ? sevColor : T.primary }}>{value.toLocaleString()}</span>
                          {value === 0
                            ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: T.primary }} />
                            : <AlertTriangle className="h-3.5 w-3.5" style={{ color: sevColor }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </SectionCard>

              {results.permissions && results.permissions.length > 0 && (
                <SectionCard title={`Permissions Sample (${results.permissions.length})`} icon={Shield}>
                  <DataTable
                    compact
                    headers={['Workbook / Source', 'Grantee', 'Type', 'Capability', 'Mode']}
                    rows={results.permissions.slice(0, 30).map(p => [
                      p.workbook_or_datasource_name, p.grantee_name, p.grantee_type,
                      p.capability_name, p.capability_mode,
                    ])}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* ── Formula Analysis tab ─────────────────────────────────────── */}
          {activeTab === 'analysis' && hasDeepAnalysis && (
            <DeepAnalysisTab analyses={deepAnalyses} />
          )}

          {/* ── Download footer ────────────────────────────────────────────── */}
          <div className="rounded-2xl border overflow-hidden p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{ background: `linear-gradient(135deg, ${T.light50} 0%, white 100%)`, borderColor: T.light200, boxShadow: T.shadow }}>
            <div>
              <p className="text-sm font-bold text-slate-800">Download Reports</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Excel: 12-sheet inventory · Word: static report · AI Report: migration analysis with Power BI mapping
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <DownloadBtn label="Excel (.xlsx)" icon={FileSpreadsheet} onClick={handleDownloadExcel} loading={dlExcel} variant="secondary" />
              <DownloadBtn label="Word (.docx)"  icon={BookOpen}        onClick={handleDownloadWord}  loading={dlWord}  variant="secondary" />
              <DownloadBtn label="AI Migration Report" icon={Sparkles} onClick={handleDownloadAiWord} loading={dlAiWord} variant="primary" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
