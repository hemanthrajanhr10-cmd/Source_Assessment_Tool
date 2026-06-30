import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, FileSpreadsheet, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Info,
  Cpu, Database, Layers, Activity, Shield,
  FlaskConical, BarChart3, Server, Users, Lock,
  HardDrive, GitBranch, Package, Zap, TrendingUp,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { DatabricksIconLogo } from '../components/ui/SourceLogos'
import type {
  DatabricksAssessmentResult,
  DatabricksCluster,
  DatabricksWarehouse,
  DatabricksCatalog,
  DatabricksJob,
  DatabricksUser,
  DatabricksCheckResult,
} from '../types/api'

// ── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:          '#FFF7F5',
  surface:     '#FFFFFF',
  surface2:    '#FFF7F5',
  border:      '#FFCEC4',
  borderFaint: '#FFE5DF',
  brand:       '#FF3621',
  brandMid:    '#FC5C35',
  brandGlow:   'rgba(255,54,33,0.10)',
  brandFaint:  'rgba(255,54,33,0.05)',
  textPrimary: '#0D1117',
  textSecond:  '#404555',
  textMuted:   '#767A8C',
  green:       '#059669',
  greenBg:     'rgba(5,150,105,0.08)',
  amber:       '#D97706',
  amberBg:     'rgba(217,119,6,0.08)',
  red:         '#DC2626',
  redBg:       'rgba(220,38,38,0.07)',
  blue:        '#2563EB',
  blueBg:      'rgba(37,99,235,0.07)',
  purple:      '#7C3AED',
  purpleBg:    'rgba(124,58,237,0.07)',
  shadow:      '0 1px 3px rgba(255,54,33,0.04), 0 4px 16px rgba(255,54,33,0.06)',
  mono:        '"JetBrains Mono","Fira Code",monospace',
}

// ── 5 Fabric-parity tabs ──────────────────────────────────────────────────────
type TabKey = 'overview' | 'compute' | 'data-platform' | 'governance' | 'jobs-ml'

const TABS: { key: TabKey; label: string; Icon: React.ElementType; sub: string }[] = [
  { key: 'overview',       label: 'Overview',          Icon: BarChart3,   sub: 'Score · Health · Findings' },
  { key: 'compute',        label: 'Compute',           Icon: Cpu,         sub: 'Clusters · SQL Warehouses' },
  { key: 'data-platform',  label: 'Data Platform',     Icon: Layers,      sub: 'Unity Catalog · Catalogs · Storage' },
  { key: 'governance',     label: 'Governance & Security', Icon: Shield,  sub: 'Users · IAM · Policies · Checks' },
  { key: 'jobs-ml',        label: 'Jobs & AI',         Icon: FlaskConical,sub: 'Lakeflow · DLT · MLflow · Serving' },
]

// ── Utilities ─────────────────────────────────────────────────────────────────
const fmtN    = (n?: number | null) => n == null ? '—' : n.toLocaleString()
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}
const trunc = (s: string, n = 70) => s.length > n ? s.slice(0, n) + '…' : s

function guessProgress(msg?: string | null): number {
  if (!msg) return 0
  const m = msg.match(/Step (\d+)\/(\d+)/)
  return m ? Math.round(parseInt(m[1]) / parseInt(m[2]) * 100) : 5
}

// ── SVG Donut Chart ───────────────────────────────────────────────────────────
function DonutChart({ data, size = 140, label }: {
  data: { label: string; value: number; color: string }[]
  size?: number
  label?: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 11, color: D.textMuted }}>No data</span>
    </div>
  )
  const r = size / 2 - 8, ir = r * 0.58
  const cx = size / 2, cy = size / 2
  let angle = -90
  const toRad = (a: number) => (a * Math.PI) / 180
  const arcs = data.filter(d => d.value > 0).map(d => {
    const sweep = (d.value / total) * 360
    const s = angle, e = angle + sweep; angle = e
    const x1 = cx + r * Math.cos(toRad(s)),   y1 = cy + r * Math.sin(toRad(s))
    const x2 = cx + r * Math.cos(toRad(e)),   y2 = cy + r * Math.sin(toRad(e))
    const ix1 = cx + ir * Math.cos(toRad(s)), iy1 = cy + ir * Math.sin(toRad(s))
    const ix2 = cx + ir * Math.cos(toRad(e)), iy2 = cy + ir * Math.sin(toRad(e))
    return { ...d, path: `M${x1} ${y1} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2} L${ix2} ${iy2} A${ir} ${ir} 0 ${sweep > 180 ? 1 : 0} 0 ${ix1} ${iy1}Z` }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} stroke="#fff" strokeWidth="2" />)}
      <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="800" fill={D.textPrimary}>{total.toLocaleString()}</text>
      {label && <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="600" fill={D.textMuted}>{label}</text>}
    </svg>
  )
}

// ── Legend row for donut ──────────────────────────────────────────────────────
function Legend({ data }: { data: { label: string; value: number; color: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
          <span style={{ flex: 1, color: D.textMuted }}>{d.label}</span>
          <span style={{ fontWeight: 700, color: D.textPrimary, fontFamily: D.mono }}>{d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ── Horizontal bar chart ──────────────────────────────────────────────────────
function HBar({ data, labelW = 130 }: { data: { label: string; value: number; color: string }[]; labelW?: number }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: labelW, fontSize: 10, color: D.textMuted, textAlign: 'right', flexShrink: 0 }}>{d.label}</span>
          <div style={{ flex: 1, height: 8, background: D.borderFaint, borderRadius: 4, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{ height: '100%', background: d.color, borderRadius: 4 }}
            />
          </div>
          <span style={{ width: 36, fontSize: 11, fontWeight: 700, color: D.textPrimary, textAlign: 'right', fontFamily: D.mono }}>{d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; Icon: React.ElementType }> = {
    pass: { bg: D.greenBg,  color: D.green,    Icon: CheckCircle2  },
    warn: { bg: D.amberBg,  color: D.amber,    Icon: AlertTriangle },
    fail: { bg: D.redBg,    color: D.red,      Icon: XCircle       },
    info: { bg: D.blueBg,   color: D.blue,     Icon: Info          },
    'n/a':{ bg: D.surface2, color: D.textMuted, Icon: Info         },
  }
  const c = cfg[status.toLowerCase()] ?? cfg['n/a']
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, fontWeight:700,
      padding:'2px 7px', borderRadius:6, textTransform:'uppercase', letterSpacing:'0.06em',
      color:c.color, background:c.bg, border:`1px solid ${c.color}33` }}>
      <c.Icon style={{ width:9, height:9 }} />{status}
    </span>
  )
}

// ── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ risk }: { risk: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    critical: { bg: D.redBg,    color: D.red        },
    high:     { bg: D.amberBg,  color: D.amber       },
    medium:   { bg: D.blueBg,   color: D.blue        },
    low:      { bg: D.greenBg,  color: D.green       },
    none:     { bg: D.surface2, color: D.textMuted   },
  }
  const c = cfg[risk.toLowerCase()] ?? cfg.none
  return (
    <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:6,
      textTransform:'uppercase', letterSpacing:'0.06em',
      color:c.color, background:c.bg, border:`1px solid ${c.color}33` }}>
      {risk}
    </span>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ Icon, label, value, sub, accent = D.brand }: {
  Icon: React.ElementType; label: string; value: string | number; sub?: string; accent?: string
}) {
  return (
    <div style={{ padding:'14px 16px', borderRadius:12, background:D.surface, border:`1px solid ${D.border}`, boxShadow:D.shadow }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <div style={{ width:28, height:28, borderRadius:7, flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:`${accent}18`, border:`1px solid ${accent}33` }}>
          <Icon style={{ width:13, height:13, color:accent }} />
        </div>
        <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:D.textMuted }}>{label}</span>
      </div>
      <p style={{ fontSize:22, fontWeight:800, color:D.textPrimary, lineHeight:1 }}>{value}</p>
      {sub && <p style={{ fontSize:10, color:D.textMuted, marginTop:3 }}>{sub}</p>}
    </div>
  )
}

// ── Health tile ───────────────────────────────────────────────────────────────
function HealthTile({ label, status, detail }: { label: string; status: 'good'|'warn'|'crit'|'info'; detail: string }) {
  const cfg = {
    good: { color: D.green,  bg: D.greenBg,   Icon: CheckCircle2,  text: 'OK'       },
    warn: { color: D.amber,  bg: D.amberBg,   Icon: AlertTriangle, text: 'WARN'     },
    crit: { color: D.red,    bg: D.redBg,     Icon: XCircle,       text: 'CRITICAL' },
    info: { color: D.brand,  bg: D.brandGlow, Icon: Info,          text: 'INFO'     },
  }[status]
  return (
    <div style={{ padding:'12px 14px', borderRadius:10, background:cfg.bg, border:`1px solid ${cfg.color}33` }}>
      <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
        <cfg.Icon style={{ width:11, height:11, color:cfg.color }} />
        <span style={{ fontSize:8, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:cfg.color }}>{cfg.text}</span>
      </div>
      <p style={{ fontSize:11, fontWeight:700, color:D.textPrimary, marginBottom:2 }}>{label}</p>
      <p style={{ fontSize:10, color:D.textMuted }}>{detail}</p>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ title, Icon, count, accent = D.brand, children }: {
  title: string; Icon: React.ElementType; count?: number; accent?: string; children: React.ReactNode
}) {
  return (
    <div style={{ background:D.surface, border:`1px solid ${D.border}`, borderRadius:14, overflow:'hidden', boxShadow:D.shadow }}>
      <div style={{ padding:'11px 18px', borderBottom:`1px solid ${D.borderFaint}`,
        background:`linear-gradient(135deg,${D.surface2},${D.surface})`,
        display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:26, height:26, borderRadius:7, flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:`linear-gradient(135deg,${accent},${accent}cc)` }}>
          <Icon style={{ width:12, height:12, color:'#fff' }} />
        </div>
        <span style={{ fontSize:13, fontWeight:700, color:D.textPrimary, flex:1 }}>{title}</span>
        {count !== undefined && (
          <span style={{ fontSize:11, fontWeight:700, color:accent,
            background:`${accent}18`, border:`1px solid ${accent}33`, padding:'1px 8px', borderRadius:6 }}>
            {count.toLocaleString()}
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}

// ── KV grid ───────────────────────────────────────────────────────────────────
function KV({ rows }: { rows: [string, string | number | boolean | undefined | null][] }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 20px', padding:'14px 18px' }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline',
          paddingBottom:5, borderBottom:`1px solid ${D.borderFaint}` }}>
          <span style={{ fontSize:11, color:D.textMuted }}>{k}</span>
          <span style={{ fontSize:11, color:D.textPrimary, fontWeight:600, fontFamily:D.mono,
            textAlign:'right', maxWidth:'55%', wordBreak:'break-word' }}>
            {v == null || v === '' ? '—' : String(v)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Expandable check row ──────────────────────────────────────────────────────
function CheckRow({ ch, alt }: { ch: DatabricksCheckResult; alt: boolean }) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!(ch.details || ch.recommendation)
  return (
    <>
      <tr onClick={() => hasDetail && setOpen(o => !o)}
        style={{ background: alt ? D.surface2 : D.surface, borderBottom:`1px solid ${D.borderFaint}`,
          cursor: hasDetail ? 'pointer' : 'default' }}>
        <td style={{ padding:'8px 12px', fontSize:11, fontWeight:600, color:D.textMuted, whiteSpace:'nowrap' }}>{ch.domain}</td>
        <td style={{ padding:'8px 12px', fontSize:12, color:D.textPrimary, fontWeight:500 }}>{ch.check}</td>
        <td style={{ padding:'8px 12px' }}><StatusChip status={ch.status} /></td>
        <td style={{ padding:'8px 12px' }}><RiskBadge risk={ch.risk} /></td>
        <td style={{ padding:'8px 12px', fontSize:11, color:D.textMuted, textAlign:'right', fontFamily:D.mono }}>{ch.count != null ? fmtN(ch.count) : '—'}</td>
        <td style={{ padding:'8px 12px', width:20 }}>
          {hasDetail && (open ? <ChevronUp style={{ width:12, height:12, color:D.textMuted }} /> : <ChevronDown style={{ width:12, height:12, color:D.textMuted }} />)}
        </td>
      </tr>
      {open && hasDetail && (
        <tr style={{ background:D.brandFaint, borderBottom:`1px solid ${D.borderFaint}` }}>
          <td colSpan={6} style={{ padding:'10px 16px 12px 36px' }}>
            {ch.details && <p style={{ fontSize:11, color:D.textSecond, marginBottom: ch.recommendation ? 6 : 0 }}>{ch.details}</p>}
            {ch.recommendation && <p style={{ fontSize:11, color:D.brand, fontWeight:600 }}>→ {ch.recommendation}</p>}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Expandable cluster row ────────────────────────────────────────────────────
function ClusterRow({ c, alt }: { c: DatabricksCluster; alt: boolean }) {
  const [open, setOpen] = useState(false)
  const noAutoterm = (c.autotermination_minutes ?? 0) === 0 && c.cluster_source !== 'JOB'
  const isLegacy   = c.spark_version && /^[789]\./.test(c.spark_version)
  return (
    <>
      <tr onClick={() => setOpen(o => !o)} style={{ cursor:'pointer', background: alt ? D.surface2 : D.surface, borderBottom:`1px solid ${D.borderFaint}` }}>
        <td style={{ padding:'9px 12px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:D.textPrimary, fontFamily:D.mono }}>{c.cluster_name || c.cluster_id}</div>
          <div style={{ fontSize:10, color:D.textMuted, marginTop:1 }}>{c.cluster_source || ''}</div>
        </td>
        <td style={{ padding:'9px 12px' }}>
          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:5, fontWeight:600,
            background: c.state === 'RUNNING' ? D.greenBg : D.surface2,
            color: c.state === 'RUNNING' ? D.green : D.textMuted,
            border:`1px solid ${c.state === 'RUNNING' ? D.green+'44' : D.borderFaint}` }}>
            {c.state || '—'}
          </span>
        </td>
        <td style={{ padding:'9px 12px', fontSize:11, color:D.textMuted, fontFamily:D.mono }}>{c.spark_version ? trunc(c.spark_version, 30) : '—'}</td>
        <td style={{ padding:'9px 12px', textAlign:'center' }}>
          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:5,
            color: noAutoterm ? D.red : D.green, background: noAutoterm ? D.redBg : D.greenBg,
            border:`1px solid ${noAutoterm ? D.red+'44' : D.green+'44'}` }}>
            {noAutoterm ? '∞ RISK' : `${c.autotermination_minutes}m`}
          </span>
        </td>
        <td style={{ padding:'9px 12px', textAlign:'center' }}>
          {c.runtime_engine === 'PHOTON'
            ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, color:D.blue, background:D.blueBg, border:`1px solid ${D.blue}33` }}>⚡ PHOTON</span>
            : <span style={{ fontSize:10, color:D.textMuted }}>Standard</span>}
        </td>
        <td style={{ padding:'9px 12px', textAlign:'center' }}>
          {isLegacy && <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:5, color:D.amber, background:D.amberBg, border:`1px solid ${D.amber}44` }}>LEGACY</span>}
        </td>
        <td style={{ padding:'9px 12px', width:20 }}>
          {open ? <ChevronUp style={{ width:12, height:12, color:D.textMuted }} /> : <ChevronDown style={{ width:12, height:12, color:D.textMuted }} />}
        </td>
      </tr>
      {open && (
        <tr style={{ background:D.brandFaint, borderBottom:`1px solid ${D.borderFaint}` }}>
          <td colSpan={7} style={{ padding:'10px 18px 12px 32px' }}>
            <div style={{ display:'flex', gap:24, flexWrap:'wrap', fontSize:11, color:D.textSecond }}>
              <span><strong>Cluster ID:</strong> <code style={{ fontFamily:D.mono, fontSize:10 }}>{c.cluster_id}</code></span>
              <span><strong>Node Type:</strong> {c.node_type_id || '—'}</span>
              <span><strong>Workers:</strong> {c.num_workers != null ? c.num_workers : c.autoscale_min != null ? `${c.autoscale_min}–${c.autoscale_max} (autoscale)` : '—'}</span>
              <span><strong>Creator:</strong> {c.creator_user_name || '—'}</span>
              <span><strong>Policy:</strong> {c.policy_id ? trunc(c.policy_id, 24) : '(none)'}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Expandable job row ────────────────────────────────────────────────────────
function JobRow({ j, alt }: { j: DatabricksJob; alt: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr onClick={() => setOpen(o => !o)} style={{ cursor:'pointer', background: alt ? D.surface2 : D.surface, borderBottom:`1px solid ${D.borderFaint}` }}>
        <td style={{ padding:'9px 12px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:D.textPrimary, fontFamily:D.mono }}>{j.name || String(j.job_id)}</div>
          <div style={{ fontSize:10, color:D.textMuted, marginTop:1 }}>{j.creator_user_name || ''}</div>
        </td>
        <td style={{ padding:'9px 12px', fontSize:11, color:D.textMuted, fontFamily:D.mono }}>{j.schedule || 'Manual / Triggered'}</td>
        <td style={{ padding:'9px 12px', textAlign:'center', fontSize:12, color:D.textPrimary, fontWeight:600 }}>{j.task_count}</td>
        <td style={{ padding:'9px 12px', textAlign:'center' }}>
          {j.uses_all_purpose_compute
            ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, color:D.amber, background:D.amberBg, border:`1px solid ${D.amber}44` }}>⚠ All-Purpose</span>
            : <span style={{ fontSize:10, fontWeight:600, color:D.green }}>Job Cluster</span>}
        </td>
        <td style={{ padding:'9px 12px', textAlign:'center' }}>
          {j.last_run_status === 'FAILED'
            ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, color:D.red, background:D.redBg, border:`1px solid ${D.red}44` }}>FAILED</span>
            : j.last_run_status
              ? <span style={{ fontSize:10, fontWeight:600, color:D.green }}>{j.last_run_status}</span>
              : <span style={{ fontSize:10, color:D.textMuted }}>—</span>}
        </td>
        <td style={{ padding:'9px 12px', width:20 }}>
          {open ? <ChevronUp style={{ width:12, height:12, color:D.textMuted }} /> : <ChevronDown style={{ width:12, height:12, color:D.textMuted }} />}
        </td>
      </tr>
      {open && (
        <tr style={{ background:D.brandFaint, borderBottom:`1px solid ${D.borderFaint}` }}>
          <td colSpan={6} style={{ padding:'10px 18px 12px 32px' }}>
            <div style={{ display:'flex', gap:24, flexWrap:'wrap', fontSize:11, color:D.textSecond }}>
              <span><strong>Job ID:</strong> {j.job_id}</span>
              <span><strong>Job Clusters:</strong> {j.job_cluster_count}</span>
              <span><strong>Created:</strong> {j.created_time ? fmtDate(j.created_time) : '—'}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Inline table ──────────────────────────────────────────────────────────────
function InlineTable({ cols, rows }: { cols: string[]; rows: (string | number | boolean | null | undefined)[][] }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ background:D.surface2 }}>
            {cols.map(h => (
              <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:9, fontWeight:700,
                color:D.textMuted, textTransform:'uppercase', letterSpacing:'0.06em',
                borderBottom:`1px solid ${D.borderFaint}`, whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} style={{ padding:24, textAlign:'center', color:D.textMuted }}>No data</td></tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? D.surface2 : D.surface, borderBottom:`1px solid ${D.borderFaint}` }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding:'7px 12px', color: j === 0 ? D.textPrimary : D.textSecond,
                  fontFamily: j === 0 ? D.mono : 'inherit', fontWeight: j === 0 ? 600 : 400,
                  whiteSpace: j <= 1 ? 'nowrap' : 'normal' }}>
                  {cell == null || cell === '' ? '—' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DatabricksSessionDetailPage() {
  const { jobId }  = useParams<{ jobId: string }>()
  const navigate   = useNavigate()
  const [tab, setTab]           = useState<TabKey>('overview')
  const [checkFilter, setCheckFilter] = useState<string>('all')
  const [clusterFilter, setClusterFilter] = useState<string>('all')
  const pollCount = useRef(0)

  // ── Status polling ────────────────────────────────────────────────────────
  const { data: status, error: statusErr } = useQuery({
    queryKey: ['db-status', jobId],
    queryFn:  async () => { const r = await api.databricksGetJobStatus(jobId!); return r.data },
    enabled:  !!jobId,
    refetchInterval: (q) => {
      const s = q.state.data?.status
      if (s === 'completed' || s === 'failed') return false
      pollCount.current++; return 3000
    },
  })

  // ── Results (once complete) ───────────────────────────────────────────────
  const { data: result, error: resultErr } = useQuery({
    queryKey: ['db-result', jobId],
    queryFn:  async () => { const r = await api.databricksGetJobResults(jobId!); return r.data as DatabricksAssessmentResult },
    enabled:  !!jobId && status?.status === 'completed',
    staleTime: Infinity,
  })

  const jobStatus = status?.status ?? 'pending'
  const progress  = jobStatus === 'completed' ? 100 : jobStatus === 'failed' ? 0 : guessProgress(status?.progress_message)
  const loadErr   = statusErr ? getApiErrorMessage(statusErr) : resultErr ? getApiErrorMessage(resultErr) : null

  const wi  = result?.workspace_info
  const cs  = result?.cluster_summary
  const ws  = result?.warehouse_summary
  const uc  = result?.unity_catalog
  const js  = result?.job_summary
  const sec = result?.security_summary
  const int = result?.integration_summary
  const ml  = result?.mlflow_summary

  // ── Health tiles (persistent across tabs) ─────────────────────────────────
  const healthTiles = result ? [
    { label:'Auto-Terminate',      status:((cs?.clusters_without_autoterminate??0)===0?'good':(cs?.clusters_without_autoterminate??0)<=2?'warn':'crit') as 'good'|'warn'|'crit', detail:`${fmtN(cs?.clusters_without_autoterminate)} cluster(s) missing` },
    { label:'Unity Catalog',       status:(uc?.metastore_id?'good':'crit') as 'good'|'crit', detail: uc?.metastore_id ? `${fmtN(uc.catalog_count)} catalogs · ${fmtN(uc.table_count)} tables` : 'No metastore attached' },
    { label:'IP Access Lists',     status:((sec?.ip_access_list_count??0)>0?'good':'warn') as 'good'|'warn', detail:(sec?.ip_access_list_count??0)>0?`${fmtN(sec?.ip_access_list_count)} list(s) active`:'Workspace open to all IPs' },
    { label:'Workspace Admins',    status:((sec?.workspace_admins??0)<=5?'good':(sec?.workspace_admins??0)<=10?'warn':'crit') as 'good'|'warn'|'crit', detail:`${fmtN(sec?.workspace_admins)} admin(s) of ${fmtN(sec?.total_users)} users` },
    { label:'SQL Warehouse Stop',  status:((ws?.warehouses_without_auto_stop??0)===0?'good':'warn') as 'good'|'warn', detail:`${fmtN(ws?.warehouses_without_auto_stop)} warehouse(s) missing auto-stop` },
    { label:'DBFS Legacy Mounts',  status:((int?.dbfs_mount_count??0)===0?'good':'warn') as 'good'|'warn', detail:`${fmtN(int?.dbfs_mount_count)} /mnt mount(s) — migrate to UC` },
  ] : []

  // ── Checks ────────────────────────────────────────────────────────────────
  const allChecks    = result?.checks ?? []
  const checkDomains = ['all', ...Array.from(new Set(allChecks.map(c => c.domain)))]
  const visChecks    = checkFilter === 'all' ? allChecks : allChecks.filter(c => c.domain === checkFilter)
  const failChecks   = allChecks.filter(c => c.status === 'fail' || c.status === 'warn')

  // ── Clusters filtered ─────────────────────────────────────────────────────
  const allClusters = result?.clusters ?? []
  const visClusters = clusterFilter === 'all'      ? allClusters
    : clusterFilter === 'running'                  ? allClusters.filter(c => c.state === 'RUNNING')
    : clusterFilter === 'no-autoterm'              ? allClusters.filter(c => (c.autotermination_minutes ?? 0) === 0 && c.cluster_source !== 'JOB')
    : clusterFilter === 'photon'                   ? allClusters.filter(c => c.runtime_engine === 'PHOTON')
    : allClusters

  return (
    <div style={{ minHeight:'100vh', background:D.bg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background:`linear-gradient(135deg,${D.bg} 0%,#FFDED7 100%)`, borderBottom:`1px solid ${D.border}` }}>
        <div style={{ maxWidth:1340, margin:'0 auto', padding:'20px 32px' }}>
          <button onClick={() => navigate('/databricks/sessions')}
            style={{ display:'flex', alignItems:'center', gap:5, marginBottom:12,
              fontSize:12, color:D.brand, background:'none', border:'none', cursor:'pointer', padding:0 }}>
            <ArrowLeft style={{ width:13, height:13 }} /> Back to assessments
          </button>

          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:54, height:54, borderRadius:15, flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                background:`linear-gradient(135deg,${D.brand},${D.brandMid})`,
                boxShadow:`0 6px 20px ${D.brandGlow}` }}>
                <DatabricksIconLogo size={32} />
              </div>
              <div>
                <h1 style={{ fontSize:21, fontWeight:800, color:D.textPrimary, margin:0 }}>
                  {status?.label || 'Databricks Assessment'}
                </h1>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4, flexWrap:'wrap' }}>
                  {(status?.workspace_url || result?.workspace_url) && (
                    <span style={{ fontSize:11, color:D.textMuted, fontFamily:D.mono, display:'flex', alignItems:'center', gap:4 }}>
                      <Server style={{ width:10, height:10 }} />
                      {(status?.workspace_url || result?.workspace_url)!.replace('https://', '')}
                    </span>
                  )}
                  {wi?.cloud && (
                    <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:6, letterSpacing:'0.06em',
                      color: wi.cloud==='azure'?D.blue : wi.cloud==='gcp'?D.green : D.amber,
                      background: wi.cloud==='azure'?D.blueBg : wi.cloud==='gcp'?D.greenBg : D.amberBg }}>
                      {wi.cloud.toUpperCase()}
                    </span>
                  )}
                  {wi?.region && <span style={{ fontSize:11, color:D.textMuted }}>{wi.region}</span>}
                  {result?.assessment_timestamp && (
                    <span style={{ fontSize:10, color:D.textMuted }}>
                      Assessed {fmtDate(result.assessment_timestamp)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {result && (
                <button onClick={() => api.databricksDownloadExcel(jobId!, status?.label || undefined)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
                    borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer',
                    background:`linear-gradient(135deg,${D.brand},${D.brandMid})`,
                    color:'#fff', border:'none', boxShadow:`0 2px 10px ${D.brandGlow}` }}>
                  <FileSpreadsheet style={{ width:14, height:14 }} /> Export Excel
                </button>
              )}
              {jobStatus === 'completed' && (
                <span style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:8,
                  color:D.green, background:D.greenBg, border:`1px solid ${D.green}44` }}>✓ Completed</span>
              )}
              {jobStatus === 'failed' && (
                <span style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:8,
                  color:D.red, background:D.redBg, border:`1px solid ${D.red}44` }}>Failed</span>
              )}
              {(jobStatus === 'running' || jobStatus === 'pending') && (
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:10,
                  background:D.brandGlow, border:`1px solid ${D.brand}33`, color:D.brand, fontSize:12, fontWeight:700 }}>
                  <Loader2 style={{ width:13, height:13, animation:'spin 1s linear infinite' }} />
                  {jobStatus === 'running' ? 'Running…' : 'Queued'}
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {(jobStatus === 'running' || jobStatus === 'pending') && (
            <div style={{ marginTop:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:11, color:D.textMuted }}>{status?.progress_message || 'Initialising…'}</span>
                <span style={{ fontSize:11, color:D.brand, fontWeight:700 }}>{progress}%</span>
              </div>
              <div style={{ height:5, borderRadius:5, background:D.borderFaint, overflow:'hidden' }}>
                <motion.div animate={{ scaleX: progress / 100 }} transition={{ duration:0.5, ease:'easeOut' }}
                  style={{ height:'100%', borderRadius:5, transformOrigin:'left',
                    background:`linear-gradient(90deg,${D.brand},${D.brandMid})` }} />
              </div>
            </div>
          )}
          {(loadErr || (jobStatus === 'failed' && status?.error)) && (
            <div style={{ marginTop:10, padding:'10px 14px', borderRadius:10, fontSize:12,
              background:D.redBg, border:`1px solid ${D.red}33`, color:D.red }}>
              {loadErr || status?.error}
            </div>
          )}
        </div>
      </div>

      {/* Running spinner */}
      {!result && (jobStatus === 'pending' || jobStatus === 'running') && (
        <div style={{ maxWidth:1340, margin:'60px auto', padding:'0 32px', textAlign:'center' }}>
          <Loader2 style={{ width:40, height:40, color:D.brand, animation:'spin 1s linear infinite', margin:'0 auto 14px' }} />
          <p style={{ color:D.textMuted, fontSize:13 }}>{status?.progress_message || 'Assessment running…'}</p>
        </div>
      )}

      {result && (
        <div style={{ maxWidth:1340, margin:'0 auto', padding:'0 32px 56px' }}>

          {/* ── Assessment overview banner ──────────────────────────────────── */}
          <div style={{ marginTop:24, marginBottom:20, padding:'18px 24px', borderRadius:16,
            background:`linear-gradient(135deg,${D.brand} 0%,${D.brandMid} 100%)`,
            boxShadow:`0 6px 24px ${D.brandGlow}`, color:'#fff',
            display:'flex', alignItems:'center', justifyContent:'space-between', gap:24, flexWrap:'wrap' }}>
            <div>
              <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.10em', opacity:0.75, marginBottom:4 }}>Assessment Overview</p>
              <p style={{ fontSize:20, fontWeight:800 }}>
                {wi?.workspace_name || 'Workspace'} Assessed
              </p>
              <p style={{ fontSize:12, opacity:0.8, marginTop:2 }}>
                {fmtN(cs?.total_clusters)} clusters · {fmtN(ws?.total_warehouses)} warehouses · {fmtN(uc?.catalog_count ?? 0)} catalogs · {fmtN(sec?.total_users)} users
              </p>
            </div>
            <div style={{ display:'flex', gap:32 }}>
              <div style={{ textAlign:'right' }}>
                <p style={{ fontSize:10, fontWeight:600, opacity:0.75, letterSpacing:'0.08em', textTransform:'uppercase' }}>Total Checks</p>
                <p style={{ fontSize:32, fontWeight:900, lineHeight:1 }}>{fmtN(result.total_checks)}</p>
              </div>
              <div style={{ textAlign:'right' }}>
                <p style={{ fontSize:10, fontWeight:600, opacity:0.75, letterSpacing:'0.08em', textTransform:'uppercase' }}>Score</p>
                <p style={{ fontSize:32, fontWeight:900, lineHeight:1 }}>{result.overall_score?.toFixed(0) ?? '—'}%</p>
              </div>
            </div>
          </div>

          {/* ── Health scorecard row ────────────────────────────────────────── */}
          <div style={{ marginBottom:20 }}>
            <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.10em', color:D.textMuted, marginBottom:10 }}>Health Scorecard</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
              {healthTiles.map(t => <HealthTile key={t.label} {...t} />)}
            </div>
          </div>

          {/* ── Score bar ──────────────────────────────────────────────────── */}
          {result.overall_score != null && (
            <div style={{ marginBottom:20, padding:'16px 22px', borderRadius:14, background:D.surface,
              border:`1px solid ${D.border}`, display:'flex', alignItems:'center', gap:22, boxShadow:D.shadow }}>
              <div style={{ minWidth:72 }}>
                <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:D.textMuted, marginBottom:4 }}>Overall Score</p>
                <p style={{ fontSize:36, fontWeight:900, lineHeight:1,
                  color: result.overall_score>=80 ? D.green : result.overall_score>=60 ? D.amber : D.red }}>
                  {result.overall_score.toFixed(0)}<span style={{ fontSize:18 }}>%</span>
                </p>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}>
                  <span style={{ fontSize:11, color:D.textMuted }}>{fmtN(result.passed_checks)} / {fmtN(result.total_checks)} checks passed</span>
                  <span style={{ fontSize:11 }}>
                    {(result.critical_findings??0)>0 && <span style={{ color:D.red, fontWeight:700 }}>{result.critical_findings} critical  </span>}
                    {(result.high_findings??0)>0 && <span style={{ color:D.amber, fontWeight:600 }}>{result.high_findings} high</span>}
                    {(result.critical_findings??0)===0 && (result.high_findings??0)===0 && <span style={{ color:D.green, fontWeight:600 }}>No critical / high findings</span>}
                  </span>
                </div>
                <div style={{ height:10, borderRadius:8, background:D.borderFaint, overflow:'hidden' }}>
                  <motion.div initial={{ width:0 }} animate={{ width:`${result.overall_score}%` }} transition={{ duration:0.8, ease:'easeOut' }}
                    style={{ height:'100%', borderRadius:8,
                      background: result.overall_score>=80 ? `linear-gradient(90deg,${D.green},#34d399)`
                        : result.overall_score>=60 ? `linear-gradient(90deg,${D.amber},#fbbf24)`
                        : `linear-gradient(90deg,${D.red},#f87171)` }} />
                </div>
              </div>
              <DonutChart size={88} label="checks" data={[
                { label:'Pass', value: result.passed_checks??0, color:D.green },
                { label:'Warn', value: result.warnings??0,      color:D.amber },
                { label:'Fail', value:(result.critical_findings??0)+(result.high_findings??0), color:D.red },
              ]} />
              {result.duration_seconds != null && (
                <div style={{ textAlign:'right' }}>
                  <p style={{ fontSize:10, color:D.textMuted }}>Duration</p>
                  <p style={{ fontSize:15, fontWeight:700, color:D.textPrimary, fontFamily:D.mono }}>{result.duration_seconds.toFixed(1)}s</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tab bar ────────────────────────────────────────────────────── */}
          <div style={{ display:'flex', gap:2, borderBottom:`2px solid ${D.borderFaint}`, marginBottom:24, overflowX:'auto' }}>
            {TABS.map(({ key, label, Icon, sub }) => (
              <button key={key} onClick={() => setTab(key)}
                style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2,
                  padding:'10px 18px', fontSize:13, fontWeight: tab===key ? 700 : 500, whiteSpace:'nowrap',
                  color: tab===key ? D.brand : D.textMuted, background:'none', border:'none',
                  borderBottom: tab===key ? `2px solid ${D.brand}` : '2px solid transparent',
                  marginBottom:-2, cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Icon style={{ width:14, height:14 }} />{label}
                </div>
                <span style={{ fontSize:9, fontWeight:500, color: tab===key ? `${D.brand}99` : D.textMuted, letterSpacing:'0.02em' }}>{sub}</span>
              </button>
            ))}
          </div>

          {/* ════════════════════════════════════════════════════════════════
              TAB PANELS
          ════════════════════════════════════════════════════════════════ */}
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.18 }}>

              {/* ══════════════════════════════════════════
                  TAB 1 — OVERVIEW
              ══════════════════════════════════════════ */}
              {tab === 'overview' && (
                <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

                  {/* Top stat strip */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
                    <StatCard Icon={Cpu}          label="Clusters"          value={fmtN(cs?.total_clusters)}                    sub={`${fmtN(cs?.running_clusters)} running`} />
                    <StatCard Icon={Database}     label="SQL Warehouses"    value={fmtN(ws?.total_warehouses)}                  sub={`${fmtN(ws?.serverless_warehouses)} serverless`} />
                    <StatCard Icon={Layers}       label="UC Catalogs"       value={fmtN(uc?.catalog_count)}                     sub={uc ? `${fmtN(uc.table_count)} tables` : 'UC not enabled'} />
                    <StatCard Icon={Activity}     label="Jobs"              value={fmtN(js?.total_jobs)}                        sub={`${fmtN(js?.dlt_pipelines)} DLT pipelines`} />
                    <StatCard Icon={Users}        label="Users"             value={fmtN(sec?.total_users)}                      sub={`${fmtN(sec?.admin_users)} admins`} />
                  </div>

                  {/* 3-column chart row */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
                    {cs && (
                      <SectionCard title="Cluster States" Icon={Cpu}>
                        <div style={{ display:'flex', alignItems:'center', gap:18, padding:'16px 18px' }}>
                          <DonutChart size={120} label="clusters" data={[
                            { label:'Running',    value: cs.running_clusters,    color:D.green },
                            { label:'Terminated', value: cs.terminated_clusters, color:D.textMuted },
                            { label:'Photon',     value: cs.photon_enabled_clusters, color:D.blue },
                          ]} />
                          <Legend data={[
                            { label:'Running',    value: cs.running_clusters,              color:D.green },
                            { label:'Terminated', value: cs.terminated_clusters,            color:D.textMuted },
                            { label:'Photon',     value: cs.photon_enabled_clusters,        color:D.blue },
                            { label:'No Policy',  value: cs.total_clusters - cs.policy_compliant_clusters, color:D.amber },
                          ]} />
                        </div>
                      </SectionCard>
                    )}
                    {sec && (
                      <SectionCard title="Identity Distribution" Icon={Users}>
                        <div style={{ padding:'16px 18px' }}>
                          <HBar labelW={110} data={[
                            { label:'Total Users',     value: sec.total_users,              color:D.brand },
                            { label:'Active',          value: sec.active_users,             color:D.green },
                            { label:'Admins',          value: sec.admin_users,              color: sec.admin_users>5 ? D.red : D.amber },
                            { label:'Svc Principals',  value: sec.service_principal_count,  color:D.blue },
                            { label:'Groups',          value: sec.group_count,              color:D.purple },
                          ]} />
                        </div>
                      </SectionCard>
                    )}
                    {ml && (
                      <SectionCard title="ML & AI Assets" Icon={FlaskConical}>
                        <div style={{ display:'flex', alignItems:'center', gap:18, padding:'16px 18px' }}>
                          <DonutChart size={120} label="endpoints" data={[
                            { label:'Ready',    value: ml.running_endpoints,                                         color:D.green },
                            { label:'Stopped',  value: ml.model_serving_endpoint_count - ml.running_endpoints,      color:D.textMuted },
                          ]} />
                          <Legend data={[
                            { label:'Experiments', value: ml.experiment_count,            color:D.brand },
                            { label:'Models',      value: ml.registered_model_count,       color:D.brandMid },
                            { label:'Endpoints',   value: ml.model_serving_endpoint_count, color:D.blue },
                            { label:'Vector Idx',  value: ml.vector_search_index_count,    color:D.green },
                          ]} />
                        </div>
                      </SectionCard>
                    )}
                  </div>

                  {/* Workspace info + jobs KV */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                    {wi && (
                      <SectionCard title="Workspace Information" Icon={Server}>
                        <KV rows={[
                          ['Workspace Name',   wi.workspace_name],
                          ['Deployment Name',  wi.deployment_name],
                          ['Cloud Provider',   wi.cloud?.toUpperCase()],
                          ['Region',           wi.region],
                          ['Metastore ID',     wi.metastore_id],
                          ['Assessed',         fmtDate(result.assessment_timestamp)],
                        ]} />
                      </SectionCard>
                    )}
                    {js && (
                      <SectionCard title="Job Orchestration" Icon={Activity}>
                        <KV rows={[
                          ['Total Jobs',             js.total_jobs],
                          ['Scheduled Jobs',         js.scheduled_jobs],
                          ['Multi-Task Jobs',        js.multi_task_jobs],
                          ['Using All-Purpose Compute', js.jobs_using_all_purpose_compute],
                          ['Recent Failures',        js.jobs_with_failures_last_7d],
                          ['DLT / Lakeflow Pipelines', js.dlt_pipelines],
                        ]} />
                      </SectionCard>
                    )}
                  </div>

                  {/* Findings needing attention */}
                  {failChecks.length > 0 && (
                    <SectionCard title={`Findings Requiring Attention`} Icon={AlertTriangle} count={failChecks.length} accent={D.red}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:D.surface2 }}>
                            {['Domain','Check','Status','Risk','Recommendation'].map(h => (
                              <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:9, fontWeight:700,
                                color:D.textMuted, textTransform:'uppercase', letterSpacing:'0.06em',
                                borderBottom:`1px solid ${D.borderFaint}`, whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {failChecks.map((ch, i) => (
                            <tr key={i} style={{ background: i%2 ? D.surface2 : D.surface, borderBottom:`1px solid ${D.borderFaint}` }}>
                              <td style={{ padding:'7px 12px', fontSize:11, color:D.textMuted }}>{ch.domain}</td>
                              <td style={{ padding:'7px 12px', fontSize:12, color:D.textPrimary, fontWeight:500 }}>{ch.check}</td>
                              <td style={{ padding:'7px 12px' }}><StatusChip status={ch.status} /></td>
                              <td style={{ padding:'7px 12px' }}><RiskBadge risk={ch.risk} /></td>
                              <td style={{ padding:'7px 12px', fontSize:11, color:D.brand, maxWidth:260 }}>{ch.recommendation ? trunc(ch.recommendation, 80) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </SectionCard>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════════
                  TAB 2 — COMPUTE
                  (Clusters + SQL Warehouses deep-dive)
              ══════════════════════════════════════════ */}
              {tab === 'compute' && (
                <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

                  {/* Cluster summary charts */}
                  {cs && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                      <SectionCard title="Cluster State Distribution" Icon={Cpu}>
                        <div style={{ display:'flex', alignItems:'center', gap:20, padding:'16px 18px' }}>
                          <DonutChart size={130} label="clusters" data={[
                            { label:'Running',    value: cs.running_clusters,    color:D.green },
                            { label:'Terminated', value: cs.terminated_clusters, color:'#CBD5E1' },
                            { label:'Other',      value: Math.max(0, cs.total_clusters - cs.running_clusters - cs.terminated_clusters), color:D.textMuted },
                          ]} />
                          <div style={{ flex:1 }}>
                            <Legend data={[
                              { label:'Running',             value: cs.running_clusters,              color:D.green   },
                              { label:'Terminated',          value: cs.terminated_clusters,            color:'#CBD5E1' },
                              { label:'Photon-Enabled',      value: cs.photon_enabled_clusters,        color:D.blue    },
                              { label:'Policy-Compliant',    value: cs.policy_compliant_clusters,      color:D.green   },
                              { label:'No Auto-Terminate',   value: cs.clusters_without_autoterminate, color:D.red     },
                              { label:'Single-Node',         value: cs.single_node_clusters,           color:D.amber   },
                            ]} />
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="Cluster Type Breakdown" Icon={BarChart3}>
                        <div style={{ padding:'16px 18px' }}>
                          <HBar labelW={140} data={[
                            { label:'All-Purpose',       value: cs.all_purpose_clusters,      color:D.brand   },
                            { label:'Job Clusters',      value: cs.job_clusters,              color:D.blue    },
                            { label:'Single-Node',       value: cs.single_node_clusters,      color:D.amber   },
                            { label:'Photon-Enabled',    value: cs.photon_enabled_clusters,   color:'#2563EB' },
                            { label:'No Auto-Terminate', value: cs.clusters_without_autoterminate, color:D.red },
                            { label:'Legacy Runtime',    value: cs.legacy_runtime_clusters,   color:'#9333ea' },
                          ]} />
                        </div>
                      </SectionCard>
                    </div>
                  )}

                  {/* Cluster filter pills */}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {[
                      { key:'all',         label:`All (${allClusters.length})` },
                      { key:'running',     label:`Running (${allClusters.filter(c=>c.state==='RUNNING').length})` },
                      { key:'no-autoterm', label:`No Auto-Terminate (${allClusters.filter(c=>(c.autotermination_minutes??0)===0&&c.cluster_source!=='JOB').length})` },
                      { key:'photon',      label:`Photon (${allClusters.filter(c=>c.runtime_engine==='PHOTON').length})` },
                    ].map(p => (
                      <button key={p.key} onClick={() => setClusterFilter(p.key)}
                        style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight: clusterFilter===p.key ? 700 : 500,
                          cursor:'pointer', border:`1px solid ${clusterFilter===p.key ? D.brand : D.border}`,
                          color: clusterFilter===p.key ? D.brand : D.textMuted,
                          background: clusterFilter===p.key ? D.brandGlow : D.surface }}>
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Cluster inventory table */}
                  <SectionCard title="Cluster Inventory" Icon={Cpu} count={visClusters.length}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:D.surface2 }}>
                          {['Cluster / Source','State','Runtime','Auto-Terminate','Engine','Runtime',''].map(h => (
                            <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:9, fontWeight:700,
                              color:D.textMuted, textTransform:'uppercase', letterSpacing:'0.06em',
                              borderBottom:`1px solid ${D.borderFaint}`, whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visClusters.map((c: DatabricksCluster, i) => (
                          <ClusterRow key={c.cluster_id} c={c} alt={i%2===1} />
                        ))}
                        {visClusters.length === 0 && (
                          <tr><td colSpan={7} style={{ padding:24, textAlign:'center', color:D.textMuted }}>No clusters match this filter</td></tr>
                        )}
                      </tbody>
                    </table>
                  </SectionCard>

                  {/* SQL Warehouse section */}
                  {ws && (
                    <>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                        <SectionCard title="SQL Warehouse Distribution" Icon={Database}>
                          <div style={{ display:'flex', alignItems:'center', gap:20, padding:'16px 18px' }}>
                            <DonutChart size={130} label="warehouses" data={[
                              { label:'Serverless', value: ws.serverless_warehouses,  color:D.green },
                              { label:'Classic',    value: ws.classic_warehouses,     color:D.amber },
                              { label:'Other',      value: Math.max(0, ws.total_warehouses - ws.serverless_warehouses - ws.classic_warehouses), color:D.blue },
                            ]} />
                            <div style={{ flex:1 }}>
                              <Legend data={[
                                { label:'Serverless (recommended)', value: ws.serverless_warehouses,        color:D.green },
                                { label:'Classic',                  value: ws.classic_warehouses,           color:D.amber },
                                { label:'Running now',              value: ws.running_warehouses,           color:D.green },
                                { label:'No auto-stop',             value: ws.warehouses_without_auto_stop, color:D.red   },
                              ]} />
                            </div>
                          </div>
                        </SectionCard>
                        <SectionCard title="Warehouse Summary" Icon={Database}>
                          <KV rows={[
                            ['Total Warehouses',    ws.total_warehouses],
                            ['Currently Running',   ws.running_warehouses],
                            ['Serverless',          ws.serverless_warehouses],
                            ['Classic',             ws.classic_warehouses],
                            ['No Auto-Stop ⚠',      ws.warehouses_without_auto_stop],
                          ]} />
                        </SectionCard>
                      </div>
                      <SectionCard title="SQL Warehouse Inventory" Icon={Database} count={result.warehouses?.length}>
                        <InlineTable
                          cols={['Name','Type','Size','Min Clusters','Max Clusters','Auto-Stop (min)','State','Photon','Active Sessions','Creator']}
                          rows={(result.warehouses ?? []).map((w: DatabricksWarehouse) => [
                            w.name || w.id, w.warehouse_type, w.cluster_size,
                            w.min_num_clusters, w.max_num_clusters,
                            w.auto_stop_mins ?? '∞',
                            w.state,
                            w.enable_photon ? '⚡ Yes' : 'No',
                            w.num_active_sessions,
                            w.creator_name,
                          ])}
                        />
                      </SectionCard>
                    </>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════════
                  TAB 3 — DATA PLATFORM
                  (Unity Catalog · Catalogs · Storage · Integrations)
              ══════════════════════════════════════════ */}
              {tab === 'data-platform' && (
                <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

                  {uc ? (
                    <>
                      {/* UC overview banner */}
                      <div style={{ padding:'16px 22px', borderRadius:14, background:D.surface,
                        border:`1px solid ${D.border}`, boxShadow:D.shadow }}>
                        <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.10em', color:D.textMuted, marginBottom:10 }}>Unity Catalog — Metastore</p>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
                          {[
                            { label:'Catalogs',           value: uc.catalog_count,           color:D.brand,  Icon:Layers   },
                            { label:'Schemas (sampled)',   value: uc.schema_count,            color:D.blue,   Icon:Database },
                            { label:'Tables (sampled)',    value: uc.table_count,             color:D.green,  Icon:Package  },
                            { label:'External Locations', value: uc.external_location_count, color:D.amber,  Icon:HardDrive},
                            { label:'Storage Credentials',value: uc.storage_credential_count,color:D.purple, Icon:Lock     },
                            { label:'Volumes',            value: uc.volume_count,            color:D.blue,   Icon:HardDrive},
                            { label:'Views (sampled)',     value: uc.view_count,              color:D.textMuted, Icon:Database},
                            { label:'Delta Sharing',      value: uc.delta_sharing_enabled ? 'Enabled ✓' : 'Disabled', color: uc.delta_sharing_enabled ? D.green : D.textMuted, Icon:GitBranch },
                          ].map(({ label, value, color, Icon: I }) => (
                            <div key={label} style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                                display:'flex', alignItems:'center', justifyContent:'center', background:`${color}18` }}>
                                <I style={{ width:14, height:14, color }} />
                              </div>
                              <div>
                                <p style={{ fontSize:9, color:D.textMuted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</p>
                                <p style={{ fontSize:18, fontWeight:800, color:D.textPrimary }}>
                                  {typeof value === 'number' ? value.toLocaleString() : value}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Metastore details + visual */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                        <SectionCard title="Metastore Details" Icon={Server}>
                          <KV rows={[
                            ['Metastore Name',      uc.metastore_name],
                            ['Metastore ID',        uc.metastore_id ? trunc(uc.metastore_id, 32) : null],
                            ['Storage Root',        uc.storage_root ? trunc(uc.storage_root, 48) : null],
                            ['Delta Sharing',       uc.delta_sharing_enabled ? 'Enabled ✓' : 'Disabled'],
                            ['Sharing Recipients',  uc.data_sharing_recipient_count],
                            ['Cloud',               wi?.cloud?.toUpperCase()],
                          ]} />
                        </SectionCard>
                        <SectionCard title="Data Asset Distribution" Icon={BarChart3}>
                          <div style={{ padding:'16px 18px' }}>
                            <HBar labelW={150} data={[
                              { label:'Catalogs',            value: uc.catalog_count,            color:D.brand    },
                              { label:'Schemas (sampled)',    value: uc.schema_count,             color:D.blue     },
                              { label:'Tables (sampled)',     value: uc.table_count,              color:D.green    },
                              { label:'Views (sampled)',      value: uc.view_count,               color:D.textMuted},
                              { label:'Volumes',             value: uc.volume_count,             color:D.amber    },
                              { label:'Ext. Locations',      value: uc.external_location_count,  color:D.purple   },
                            ]} />
                          </div>
                        </SectionCard>
                      </div>

                      {/* Catalog inventory */}
                      {(result.catalogs ?? []).length > 0 && (
                        <SectionCard title="Catalog Inventory" Icon={Layers} count={result.catalogs.length}>
                          <InlineTable
                            cols={['Catalog Name','Type','Owner','Schemas','Tables','Storage Location','Created']}
                            rows={(result.catalogs ?? []).map((c: DatabricksCatalog) => [
                              c.name, c.catalog_type, c.owner,
                              c.schema_count, c.table_count,
                              c.storage_location ? trunc(c.storage_location, 48) : '—',
                              c.created_at ? fmtDate(c.created_at) : '—',
                            ])}
                          />
                        </SectionCard>
                      )}
                    </>
                  ) : (
                    <div style={{ padding:56, textAlign:'center' }}>
                      <AlertTriangle style={{ width:40, height:40, color:D.amber, margin:'0 auto 16px' }} />
                      <p style={{ fontSize:16, fontWeight:700, color:D.textPrimary, marginBottom:6 }}>Unity Catalog not enabled</p>
                      <p style={{ fontSize:13, color:D.textMuted, maxWidth:400, margin:'0 auto' }}>
                        No metastore is attached to this workspace. Adopting Unity Catalog provides centralised governance, column-level security, lineage tracking, and cross-workspace data sharing.
                      </p>
                    </div>
                  )}

                  {/* Storage & Integrations */}
                  {int && (
                    <>
                      <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:D.textMuted, marginTop:4 }}>Storage & Integrations</p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                        {[
                          { label:'External Locations',   value: int.external_location_count,  Icon:HardDrive, note:'UC-managed storage access',          good:true },
                          { label:'Storage Credentials',  value: int.storage_credential_count, Icon:Lock,      note:'Cloud auth for UC ext. locations',    good:true },
                          { label:'Git Credentials',      value: int.git_credential_count,     Icon:GitBranch, note:'Source control integrations',         good:true },
                          { label:'Secret Scopes',        value: int.secret_scope_count,       Icon:Lock,      note:'Vault-backed or native secrets',       good:(int.secret_scope_count??0)>0 },
                          { label:'Network Policies',     value: int.network_policy_count,     Icon:Shield,    note:'Egress / private connectivity',        good:true },
                          { label:'DBFS /mnt Mounts',     value: int.dbfs_mount_count,         Icon:HardDrive, note:'Legacy — migrate to UC ext. locations',good:(int.dbfs_mount_count??0)===0 },
                          { label:'Lakehouse Monitors',   value: int.lakehouse_monitor_count,  Icon:Activity,  note:'Data quality / drift monitoring',      good:true },
                          { label:'Delta Sharing',        value: int.delta_sharing_enabled ? 'On':'Off', Icon:GitBranch, note:'Open sharing across orgs', good:true },
                        ].map(({ label, value, Icon:I, note, good }) => (
                          <div key={label} style={{ padding:'13px 15px', borderRadius:12, background:D.surface,
                            border:`1px solid ${good ? D.border : D.amber+'66'}`, boxShadow:D.shadow,
                            display:'flex', alignItems:'flex-start', gap:11 }}>
                            <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              background: good ? D.brandGlow : D.amberBg }}>
                              <I style={{ width:14, height:14, color: good ? D.brand : D.amber }} />
                            </div>
                            <div>
                              <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:D.textMuted, marginBottom:2 }}>{label}</p>
                              <p style={{ fontSize:20, fontWeight:800, color:D.textPrimary, lineHeight:1, marginBottom:3 }}>
                                {typeof value === 'number' ? value.toLocaleString() : value}
                              </p>
                              <p style={{ fontSize:9, color:D.textMuted }}>{note}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* DBFS migration callout */}
                      {(int.dbfs_mount_count ?? 0) > 0 && (
                        <div style={{ padding:'14px 18px', borderRadius:12, background:D.amberBg,
                          border:`1px solid ${D.amber}44`, display:'flex', alignItems:'flex-start', gap:12 }}>
                          <AlertTriangle style={{ width:18, height:18, color:D.amber, flexShrink:0, marginTop:1 }} />
                          <div>
                            <p style={{ fontSize:12, fontWeight:700, color:D.amber, marginBottom:4 }}>
                              {int.dbfs_mount_count} DBFS /mnt mount(s) detected — migration recommended
                            </p>
                            <p style={{ fontSize:11, color:D.textSecond }}>
                              Legacy DBFS mounts bypass Unity Catalog governance. For each mount, create a UC External Location backed by the same cloud storage credential. This unlocks column-level security, lineage tracking, and centralised audit logging.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════════
                  TAB 4 — GOVERNANCE & SECURITY
                  (Users · IAM · Policies · All Checks)
              ══════════════════════════════════════════ */}
              {tab === 'governance' && (
                <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

                  {sec && (
                    <>
                      {/* Identity overview */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                        <SectionCard title="Identity Overview" Icon={Users}>
                          <div style={{ display:'flex', alignItems:'center', gap:20, padding:'16px 18px' }}>
                            <DonutChart size={130} label="users" data={[
                              { label:'Active',   value: sec.active_users,                    color:D.green },
                              { label:'Inactive', value: sec.total_users - sec.active_users,  color:'#CBD5E1' },
                              { label:'Admins',   value: sec.admin_users,                     color: sec.admin_users>5 ? D.red : D.amber },
                            ]} />
                            <div style={{ flex:1 }}>
                              <Legend data={[
                                { label:'Total Users',     value: sec.total_users,              color:D.brand  },
                                { label:'Active',          value: sec.active_users,             color:D.green  },
                                { label:'Inactive',        value: sec.total_users - sec.active_users, color:'#CBD5E1' },
                                { label:'Admins',          value: sec.admin_users,              color: sec.admin_users>5 ? D.red : D.amber },
                                { label:'Svc Principals',  value: sec.service_principal_count,  color:D.blue   },
                                { label:'Groups',          value: sec.group_count,              color:D.purple  },
                              ]} />
                            </div>
                          </div>
                        </SectionCard>

                        <SectionCard title="Security Controls" Icon={Shield}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:14 }}>
                            {[
                              { label:'IP Access Lists',     value: sec.ip_access_list_count,           good:(sec.ip_access_list_count??0)>0 },
                              { label:'Secret Scopes',       value: sec.secrets_scope_count,            good:true },
                              { label:'PAT Tokens Active',   value: sec.pat_count,                      good:true },
                              { label:'Token Lifetime Limit',value: sec.token_lifetime_configured ? 'Yes ✓' : 'No ✗', good:sec.token_lifetime_configured },
                              { label:'Unity Catalog',       value: sec.unity_catalog_enabled ? 'Enabled ✓' : 'Off ✗', good:sec.unity_catalog_enabled },
                              { label:'Audit Log',           value: sec.audit_log_configured ? 'Yes ✓' : 'Not detected', good:sec.audit_log_configured },
                            ].map(({ label, value, good }) => (
                              <div key={label} style={{ padding:'10px 12px', borderRadius:9,
                                border:`1px solid ${D.borderFaint}`, background: good ? D.greenBg : D.amberBg }}>
                                <p style={{ fontSize:9, color:D.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{label}</p>
                                <p style={{ fontSize:16, fontWeight:800, color: good ? D.green : D.amber }}>
                                  {typeof value === 'number' ? value.toLocaleString() : value}
                                </p>
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      </div>

                      {/* User inventory */}
                      <SectionCard title="User Inventory" Icon={Users} count={result.users?.length}>
                        <InlineTable
                          cols={['Username','Display Name','Active','Is Admin']}
                          rows={(result.users ?? []).map((u: DatabricksUser) => [
                            u.user_name, u.display_name,
                            u.active ? '✓ Yes' : '✗ No',
                            u.is_admin ? '⚠ Admin' : 'No',
                          ])}
                        />
                      </SectionCard>
                    </>
                  )}

                  {/* All checks by domain */}
                  <div>
                    <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:D.textMuted, marginBottom:10 }}>All Assessment Checks</p>
                    {/* Domain filter pills */}
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                      {checkDomains.map(d => (
                        <button key={d} onClick={() => setCheckFilter(d)}
                          style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight: checkFilter===d ? 700 : 500,
                            cursor:'pointer', border:`1px solid ${checkFilter===d ? D.brand : D.border}`,
                            color: checkFilter===d ? D.brand : D.textMuted,
                            background: checkFilter===d ? D.brandGlow : D.surface }}>
                          {d === 'all' ? `All (${allChecks.length})` : `${d} (${allChecks.filter(c=>c.domain===d).length})`}
                        </button>
                      ))}
                    </div>
                    <SectionCard title="Checks" Icon={AlertTriangle} count={visChecks.length}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:D.surface2 }}>
                            {['Domain','Check','Status','Risk','Count',''].map(h => (
                              <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:9, fontWeight:700,
                                color:D.textMuted, textTransform:'uppercase', letterSpacing:'0.06em',
                                borderBottom:`1px solid ${D.borderFaint}`, whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visChecks.map((ch, i) => <CheckRow key={i} ch={ch} alt={i%2===1} />)}
                          {visChecks.length === 0 && (
                            <tr><td colSpan={6} style={{ padding:24, textAlign:'center', color:D.textMuted }}>No checks for this domain</td></tr>
                          )}
                        </tbody>
                      </table>
                    </SectionCard>
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════
                  TAB 5 — JOBS & AI
                  (Lakeflow Jobs · DLT · MLflow · Serving Endpoints · Vector Search)
              ══════════════════════════════════════════ */}
              {tab === 'jobs-ml' && (
                <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

                  {/* Jobs overview charts */}
                  {js && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                      <SectionCard title="Job Orchestration Distribution" Icon={Activity}>
                        <div style={{ display:'flex', alignItems:'center', gap:20, padding:'16px 18px' }}>
                          <DonutChart size={130} label="jobs" data={[
                            { label:'Scheduled',    value: js.scheduled_jobs,    color:D.green  },
                            { label:'Manual/Triggered', value: js.total_jobs - js.scheduled_jobs, color:D.textMuted },
                            { label:'DLT Pipelines', value: js.dlt_pipelines,   color:D.brand  },
                          ]} />
                          <div style={{ flex:1 }}>
                            <Legend data={[
                              { label:'Total Jobs',         value: js.total_jobs,                      color:D.brand   },
                              { label:'Scheduled',          value: js.scheduled_jobs,                  color:D.green   },
                              { label:'Multi-Task',         value: js.multi_task_jobs,                 color:D.blue    },
                              { label:'All-Purpose Compute',value: js.jobs_using_all_purpose_compute,  color:D.amber   },
                              { label:'Recent Failures',    value: js.jobs_with_failures_last_7d,       color:D.red     },
                              { label:'DLT / Lakeflow',     value: js.dlt_pipelines,                   color:D.brand   },
                            ]} />
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="Job Risk Analysis" Icon={AlertTriangle} accent={D.amber}>
                        <div style={{ padding:'16px 18px' }}>
                          <HBar labelW={160} data={[
                            { label:'Using All-Purpose Compute', value: js.jobs_using_all_purpose_compute, color:D.amber },
                            { label:'Recent Failures',           value: js.jobs_with_failures_last_7d,     color:D.red   },
                            { label:'Multi-Task (complex)',      value: js.multi_task_jobs,                color:D.blue  },
                            { label:'DLT Pipelines',            value: js.dlt_pipelines,                  color:D.brand },
                          ]} />
                          {js.jobs_using_all_purpose_compute > 0 && (
                            <div style={{ marginTop:14, padding:'10px 12px', borderRadius:9,
                              background:D.amberBg, border:`1px solid ${D.amber}44` }}>
                              <p style={{ fontSize:11, color:D.amber, fontWeight:700 }}>
                                ⚠ {js.jobs_using_all_purpose_compute} job(s) use all-purpose compute
                              </p>
                              <p style={{ fontSize:10, color:D.textSecond, marginTop:3 }}>
                                Switch to dedicated job clusters to reduce cost and eliminate shared-resource contention.
                              </p>
                            </div>
                          )}
                        </div>
                      </SectionCard>
                    </div>
                  )}

                  {/* Jobs inventory */}
                  <SectionCard title="Lakeflow Job Inventory" Icon={Activity} count={result.jobs?.length}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:D.surface2 }}>
                          {['Job / Creator','Schedule','Tasks','Compute','Last Run',''].map(h => (
                            <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:9, fontWeight:700,
                              color:D.textMuted, textTransform:'uppercase', letterSpacing:'0.06em',
                              borderBottom:`1px solid ${D.borderFaint}`, whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(result.jobs ?? []).map((j: DatabricksJob, i) => (
                          <JobRow key={j.job_id} j={j} alt={i%2===1} />
                        ))}
                        {(result.jobs ?? []).length === 0 && (
                          <tr><td colSpan={6} style={{ padding:24, textAlign:'center', color:D.textMuted }}>No jobs found</td></tr>
                        )}
                      </tbody>
                    </table>
                  </SectionCard>

                  {/* MLflow & AI section */}
                  {ml && (
                    <>
                      <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:D.textMuted, marginTop:4 }}>MLflow & AI Platform</p>

                      {/* ML stat strip */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                        <StatCard Icon={FlaskConical} label="MLflow Experiments"    value={fmtN(ml.experiment_count)} />
                        <StatCard Icon={Package}      label="Registered Models"     value={fmtN(ml.registered_model_count)} />
                        <StatCard Icon={Zap}          label="Serving Endpoints"     value={fmtN(ml.model_serving_endpoint_count)} sub={`${fmtN(ml.running_endpoints)} ready`} />
                        <StatCard Icon={Database}     label="Vector Search Indexes" value={fmtN(ml.vector_search_index_count)} accent={D.blue} />
                        <StatCard Icon={Activity}     label="DLT Pipelines"         value={fmtN(ml.dlt_pipeline_count)} accent={D.brand} />
                        <StatCard Icon={TrendingUp}   label="Running Endpoints"     value={fmtN(ml.running_endpoints)} accent={ ml.running_endpoints > 0 ? D.green : D.textMuted } />
                      </div>

                      {/* ML charts */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                        <SectionCard title="Model Serving Endpoints" Icon={Zap}>
                          <div style={{ display:'flex', alignItems:'center', gap:20, padding:'16px 18px' }}>
                            <DonutChart size={130} label="endpoints" data={[
                              { label:'Ready',   value: ml.running_endpoints,                                         color:D.green },
                              { label:'Stopped', value: ml.model_serving_endpoint_count - ml.running_endpoints,       color:'#CBD5E1' },
                            ]} />
                            <div style={{ flex:1 }}>
                              <Legend data={[
                                { label:'Ready',          value: ml.running_endpoints,                                        color:D.green   },
                                { label:'Not Ready',      value: ml.model_serving_endpoint_count - ml.running_endpoints,      color:'#CBD5E1' },
                                { label:'Total',          value: ml.model_serving_endpoint_count,                             color:D.brand   },
                              ]} />
                              <div style={{ marginTop:12, padding:'8px 12px', borderRadius:8,
                                background: ml.running_endpoints > 0 ? D.greenBg : D.surface2,
                                border:`1px solid ${D.borderFaint}`, fontSize:11, color:D.textSecond }}>
                                {ml.running_endpoints === 0
                                  ? 'No serving endpoints currently deployed'
                                  : `${ml.running_endpoints} endpoint(s) serving live inference`}
                              </div>
                            </div>
                          </div>
                        </SectionCard>

                        <SectionCard title="ML Asset Distribution" Icon={TrendingUp}>
                          <div style={{ padding:'16px 18px' }}>
                            <HBar labelW={150} data={[
                              { label:'Experiments',      value: ml.experiment_count,             color:D.brand    },
                              { label:'Registered Models',value: ml.registered_model_count,       color:D.brandMid },
                              { label:'Serving Endpoints',value: ml.model_serving_endpoint_count, color:D.blue     },
                              { label:'Vector Indexes',   value: ml.vector_search_index_count,    color:D.green    },
                              { label:'DLT Pipelines',    value: ml.dlt_pipeline_count,           color:D.amber    },
                            ]} />
                          </div>
                        </SectionCard>
                      </div>
                    </>
                  )}
                </div>
              )}

            </motion.div>
          </AnimatePresence>

          {/* Footer */}
          <div style={{ fontSize:11, color:D.textMuted, display:'flex', gap:20, paddingTop:12, marginTop:8,
            borderTop:`1px solid ${D.borderFaint}` }}>
            {status?.created_at   && <span>Started: {fmtDate(status.created_at)}</span>}
            {status?.completed_at && <span>Completed: {fmtDate(status.completed_at)}</span>}
            {result.duration_seconds != null && <span>Duration: {result.duration_seconds.toFixed(1)}s</span>}
          </div>
        </div>
      )}
    </div>
  )
}
