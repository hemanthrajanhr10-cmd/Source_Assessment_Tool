import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Snowflake, CheckCircle2, XCircle, Loader2, ArrowLeft,
  FileSpreadsheet, BookOpen, Database, Zap, Shield, Users,
  BarChart3, Layers, Server, DollarSign, Activity, Lock,
  HardDrive, Globe, AlertTriangle, Settings, GitMerge,
  TrendingUp, Eye, Cpu, Bell, Link2, Tag,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { SnowflakeLogo } from '../components/ui/SourceLogos'
import type { SnowflakeJobStatusResponse, SnowflakeAssessmentResult } from '../types/api'

// ── Ocean design tokens ───────────────────────────────────────────────────────

const D = {
  bg:          '#EFF6FF',
  surface:     '#FFFFFF',
  surface2:    '#F8FAFF',
  surface3:    '#EFF6FF',
  border:      '#C5D5EC',
  borderFaint: '#DDE8F5',
  amber:       '#29B5E8',
  amberDim:    '#0099CC',
  amberGlow:   'rgba(41,181,232,0.12)',
  amberFaint:  'rgba(41,181,232,0.07)',
  textPrimary: '#0D1117',
  textSecond:  '#404555',
  textMuted:   '#767A8C',
  green:       '#059669',
  greenDim:    'rgba(5,150,105,0.10)',
  red:         '#DC2626',
  redDim:      'rgba(220,38,38,0.08)',
  blue:        '#0056B3',
  blueDim:     'rgba(0,86,179,0.10)',
  purple:      '#7C3AED',
  purpleDim:   'rgba(124,58,237,0.10)',
  orange:      '#EA580C',
  orangeDim:   'rgba(234,88,12,0.10)',
  teal:        '#0D9488',
  tealDim:     'rgba(13,148,136,0.10)',
  shadowCard:  '0 1px 3px rgba(0,86,179,0.04), 0 4px 16px rgba(0,86,179,0.06)',
  shadowHover: '0 4px 12px rgba(0,86,179,0.08), 0 16px 40px rgba(0,86,179,0.10)',
  fontSyne:    'inherit',
  fontDM:      'inherit',
  fontMono:    '"JetBrains Mono", "Fira Code", monospace',
}

// ── Assessment steps (22 steps matching backend) ──────────────────────────────

const STEPS = [
  'Verifying account connection',
  'Fetching account metadata',
  'Enumerating warehouses',
  'Enumerating databases',
  'Enumerating schemas',
  'Enumerating tables & views',
  'Inventorying platform objects',
  'Enumerating users',
  'Enumerating roles',
  'Assessing security posture',
  'Fetching login history',
  'Fetching access history',
  'Enumerating integrations',
  'Fetching governance policies',
  'Fetching alerts',
  'Fetching replication groups',
  'Fetching query performance metrics',
  'Fetching storage usage & trends',
  'Fetching credit usage & trends',
  'Fetching operational metrics',
  'Generating Excel report',
  'Generating Word report',
]

// ── Utility formatters ────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`
  if (b >= 1e9)  return `${(b / 1e9).toFixed(2)} GB`
  if (b >= 1e6)  return `${(b / 1e6).toFixed(2)} MB`
  if (b >= 1e3)  return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

function fmtNum(n: number): string {
  return n.toLocaleString()
}

// ── SVG Donut Chart ───────────────────────────────────────────────────────────

function DonutChart({ data, size = 140, label }: {
  data: { label: string; value: number; color: string }[]
  size?: number
  label?: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <span style={{ fontSize: 11, color: D.textMuted }}>No data</span>
    </div>
  )
  const r = size / 2 - 14
  const cx = size / 2, cy = size / 2
  const ir = r * 0.58
  let angle = -90

  const arcs = data.filter(d => d.value > 0).map(d => {
    const pct   = d.value / total
    const sweep = pct * 360
    const start = angle
    const end   = angle + sweep
    angle = end
    const toRad = (a: number) => (a * Math.PI) / 180
    const x1 = cx + r  * Math.cos(toRad(start)), y1 = cy + r  * Math.sin(toRad(start))
    const x2 = cx + r  * Math.cos(toRad(end)),   y2 = cy + r  * Math.sin(toRad(end))
    const ix1 = cx + ir * Math.cos(toRad(start)), iy1 = cy + ir * Math.sin(toRad(start))
    const ix2 = cx + ir * Math.cos(toRad(end)),   iy2 = cy + ir * Math.sin(toRad(end))
    const large = sweep > 180 ? 1 : 0
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`
    return { ...d, path }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((a, i) => (
        <path key={i} d={a.path} fill={a.color} stroke="#FFFFFF" strokeWidth="2" />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
        fontSize="15" fontWeight="800" fill={D.textPrimary} fontFamily={D.fontMono}>{fmtNum(total)}</text>
      {label && (
        <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle"
          fontSize="8" fontWeight="600" fill={D.textMuted} fontFamily={D.fontDM}>{label}</text>
      )}
    </svg>
  )
}

// ── Horizontal bar chart ──────────────────────────────────────────────────────

function HBarChart({ data, color = D.amber }: {
  data: { label: string; value: number; sub?: string }[]
  color?: string
}) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span
            className="shrink-0 text-right truncate"
            style={{ width: 110, fontSize: 11, color: D.textSecond, fontFamily: D.fontDM }}
          >
            {d.label}
          </span>
          <div className="flex-1 relative h-5 rounded overflow-hidden" style={{ background: D.borderFaint }}>
            <div
              className="absolute inset-y-0 left-0 rounded transition-all duration-700"
              style={{ width: `${(d.value / max) * 100}%`, background: color, opacity: 0.85 }}
            />
            <span
              className="absolute inset-y-0 right-1.5 flex items-center"
              style={{ fontSize: 10, fontFamily: D.fontMono, color: D.textPrimary, fontWeight: 600 }}
            >
              {d.sub || fmtNum(d.value)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPI({
  icon: Icon, label, value, sub, accent, warn, info,
}: {
  icon: React.ElementType; label: string; value: string | number
  sub?: string; accent?: boolean; warn?: boolean; info?: boolean
}) {
  const [hov, setHov] = useState(false)
  const iconColor = warn ? D.red : accent ? D.amber : info ? D.blue : D.textSecond
  const iconBg    = warn ? D.redDim : accent ? D.amberFaint : info ? D.blueDim : D.borderFaint
  const valColor  = warn ? D.red : accent ? D.amber : D.textPrimary

  return (
    <div
      style={{
        background: hov ? D.surface3 : D.surface2,
        border: `1px solid ${hov ? D.border : D.borderFaint}`,
        borderRadius: 12,
        padding: '14px 16px',
        boxShadow: hov ? D.shadowHover : D.shadowCard,
        transform: hov ? 'translateY(-1px)' : '',
        transition: 'all 0.2s ease',
        cursor: 'default',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
      }}>
        <Icon style={{ width: 15, height: 15, color: iconColor }} />
      </div>
      <p style={{ fontSize: 10, fontFamily: D.fontDM, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: D.textMuted, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 20, fontFamily: D.fontMono, fontWeight: 800, color: valColor, lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 10, fontFamily: D.fontDM, color: D.textMuted, marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',     label: 'Overview',    icon: Activity },
  { id: 'compute',      label: 'Compute',     icon: Cpu },
  { id: 'data',         label: 'Data',        icon: Database },
  { id: 'security',     label: 'Security',    icon: Shield },
  { id: 'performance',  label: 'Performance', icon: Zap },
  { id: 'cost',         label: 'Cost',        icon: DollarSign },
  { id: 'governance',   label: 'Governance',  icon: Tag },
  { id: 'operations',   label: 'Operations',  icon: Settings },
]

function TabBar({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}`, gap: 0, overflowX: 'auto' }}>
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '12px 18px', fontSize: 12, fontFamily: D.fontDM, fontWeight: 600,
              color: isActive ? D.amber : D.textMuted,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: isActive ? `2px solid ${D.amber}` : '2px solid transparent',
              transition: 'all 0.15s ease', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = D.textSecond }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = D.textMuted }}
          >
            <Icon style={{ width: 13, height: 13 }} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHead({ icon: Icon, title, sub }: {
  icon: React.ElementType; title: string; sub?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, background: D.amberFaint,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon style={{ width: 14, height: 14, color: D.amber }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontFamily: D.fontSyne, fontWeight: 700, color: D.textPrimary }}>{title}</p>
        {sub && <p style={{ fontSize: 11, fontFamily: D.fontDM, color: D.textMuted }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: 14, padding: 20, boxShadow: D.shadowCard, ...style
    }}>
      {children}
    </div>
  )
}

// ── Stat table ────────────────────────────────────────────────────────────────

function StatTable({ rows }: { rows: [string, string | number][] }) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${D.borderFaint}` }}>
      {rows.map(([k, v], i) => (
        <div
          key={k}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '9px 14px', fontSize: 12, fontFamily: D.fontDM,
            background: i % 2 === 0 ? D.surface2 : D.surface,
            borderBottom: i < rows.length - 1 ? `1px solid ${D.borderFaint}` : 'none',
          }}
        >
          <span style={{ color: D.textSecond }}>{k}</span>
          <span style={{ fontFamily: D.fontMono, fontWeight: 600, color: D.textPrimary }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ── Pill badge ────────────────────────────────────────────────────────────────

function Pill({ label, color = D.amberFaint, textColor = D.amber }: {
  label: string; color?: string; textColor?: string
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: 20, fontSize: 11, fontFamily: D.fontDM, fontWeight: 600,
      background: color, color: textColor, border: `1px solid ${textColor}22`,
    }}>
      {label}
    </span>
  )
}

// ── Progress terminal ─────────────────────────────────────────────────────────

function AssessmentTerminal({ status, progressMessage, error }: {
  status: string; progressMessage?: string; error?: string
}) {
  const stepIdx = progressMessage
    ? STEPS.findIndex(s => progressMessage.toLowerCase().includes(s.toLowerCase().split(' ').slice(0, 2).join(' ')))
    : -1
  const completed = status === 'completed' ? STEPS.length : Math.max(stepIdx, 0)
  const progress = Math.min((completed / STEPS.length) * 100, 100)

  return (
    <Card>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: status === 'completed' ? D.green : status === 'failed' ? D.red : status === 'running' ? D.amber : D.textMuted,
            boxShadow: status === 'running' ? `0 0 8px ${D.amber}` : 'none',
          }} />
          <span style={{ fontSize: 13, fontFamily: D.fontSyne, fontWeight: 700, color: D.textPrimary }}>
            Assessment Progress
          </span>
          {status === 'running' && <Loader2 style={{ width: 14, height: 14, color: D.amber, animation: 'spin 1s linear infinite' }} />}
        </div>
        <span style={{
          fontSize: 11, fontFamily: D.fontMono, fontWeight: 600,
          color: status === 'completed' ? D.green : status === 'running' ? D.amber : D.textMuted,
          background: status === 'completed' ? D.greenDim : status === 'running' ? D.amberFaint : D.borderFaint,
          padding: '3px 10px', borderRadius: 20,
        }}>
          {completed}/{STEPS.length} steps
        </span>
      </div>

      {/* progress bar */}
      <div style={{ height: 4, borderRadius: 4, background: D.borderFaint, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4,
          width: `${status === 'completed' ? 100 : progress}%`,
          background: status === 'failed'
            ? `linear-gradient(90deg, ${D.red}, #F87171)`
            : `linear-gradient(90deg, ${D.amberDim}, ${D.amber})`,
          boxShadow: status !== 'failed' ? `0 0 8px ${D.amberGlow}` : 'none',
          transition: 'width 0.7s ease',
        }} />
      </div>

      {/* steps grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
        {STEPS.map((step, i) => {
          const isDone    = status === 'completed' || i < completed
          const isCurrent = status === 'running' && i === completed
          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? D.amberFaint : isCurrent ? D.borderFaint : 'transparent',
                border: `1.5px solid ${isDone ? D.amber : isCurrent ? D.amberDim : D.border}`,
              }}>
                {isDone
                  ? <CheckCircle2 style={{ width: 10, height: 10, color: D.amber }} />
                  : isCurrent
                    ? <Loader2 style={{ width: 10, height: 10, color: D.amberDim, animation: 'spin 1s linear infinite' }} />
                    : <span style={{ fontSize: 8, fontFamily: D.fontMono, color: D.textMuted }}>{i + 1}</span>
                }
              </div>
              <span style={{
                fontSize: 11, fontFamily: D.fontDM,
                color: isDone ? D.textSecond : isCurrent ? D.amber : D.textMuted,
                fontWeight: isCurrent ? 600 : isDone ? 500 : 400,
              }}>
                {step}
              </span>
            </div>
          )
        })}
      </div>

      {error && (
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 10, fontSize: 12,
          fontFamily: D.fontDM, background: D.redDim, border: `1px solid ${D.red}33`,
          color: D.red, display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <XCircle style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
          {error}
        </div>
      )}
    </Card>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ result }: { result: SnowflakeAssessmentResult }) {
  const ai = result.account_info
  const wm = result.warehouse_metrics
  const ds = result.database_summary
  const up = result.user_profile
  const cm = result.cost_metrics
  const sm = result.storage_metrics
  const qm = result.query_metrics
  const lh = result.login_history

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* hero KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPI icon={Server}      label="Account"      value={ai?.account_name || 'N/A'} accent />
        <KPI icon={Globe}       label="Region"       value={ai?.region || 'N/A'} />
        <KPI icon={Snowflake}   label="Edition"      value={ai?.edition || 'N/A'} />
        <KPI icon={Zap}         label="Warehouses"   value={wm?.total_warehouses ?? 0} />
        <KPI icon={Database}    label="Databases"    value={ds?.total_databases ?? 0} />
        <KPI icon={Layers}      label="Total Tables" value={fmtNum(ds?.total_tables ?? 0)} />
        <KPI icon={Users}       label="Total Users"  value={up?.total_users ?? 0} />
        <KPI icon={HardDrive}   label="Storage"      value={fmtBytes(sm?.total_bytes ?? 0)} />
      </div>

      {/* account details + warehouse distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <SectionHead icon={Server} title="Account Details" />
          <StatTable rows={[
            ['Organization',      ai?.organization_name || 'N/A'],
            ['Account Locator',   ai?.account_locator || 'N/A'],
            ['Cloud Provider',    ai?.cloud_provider || 'N/A'],
            ['Snowflake Version', ai?.snowflake_version || 'N/A'],
            ['Current User',      ai?.current_user || 'N/A'],
            ['Current Role',      ai?.current_role || 'N/A'],
            ['Active Warehouse',  ai?.current_warehouse || 'N/A'],
            ['Data Retention',    `${ai?.default_data_retention_days ?? 1} day(s)`],
          ]} />
        </Card>

        <Card>
          <SectionHead icon={Zap} title="Warehouse Distribution" />
          {wm && Object.keys(wm.warehouses_by_size).length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <DonutChart
                size={130}
                label="total"
                data={Object.entries(wm.warehouses_by_size).map(([size, cnt], i) => ({
                  label: size, value: cnt,
                  color: ['#0056B3','#0084D4','#38A8F5','#29B5E8','#10b981','#6366f1'][i % 6],
                }))}
              />
              <div style={{ flex: 1 }}>
                {Object.entries(wm.warehouses_by_size).map(([size, cnt], i) => (
                  <div key={size} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: ['#0056B3','#0084D4','#38A8F5','#29B5E8','#10b981','#6366f1'][i % 6],
                    }} />
                    <span style={{ fontSize: 11, fontFamily: D.fontDM, color: D.textSecond, flex: 1 }}>{size}</span>
                    <span style={{ fontSize: 12, fontFamily: D.fontMono, fontWeight: 700, color: D.textPrimary }}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: D.textMuted, fontFamily: D.fontDM }}>No warehouse data.</p>
          )}
        </Card>
      </div>

      {/* query + login summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <SectionHead icon={Activity} title="Query Activity" sub="Last 7 days" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <KPI icon={BarChart3} label="Total Queries"   value={fmtNum(qm?.total_queries_last_7d ?? 0)} accent />
            <KPI icon={XCircle}   label="Failed Queries"  value={fmtNum(qm?.failed_queries_last_7d ?? 0)} warn={!!qm && qm.failed_queries_last_7d > 0} />
          </div>
          <StatTable rows={[
            ['Avg Latency',  `${Math.round(qm?.avg_execution_ms ?? 0).toLocaleString()} ms`],
            ['P95 Latency',  `${Math.round(qm?.p95_execution_ms ?? 0).toLocaleString()} ms`],
            ['Bytes Scanned', fmtBytes(qm?.bytes_scanned_total ?? 0)],
            ['Partition Scan %', `${(qm?.partitions_scanned_pct ?? 0).toFixed(1)}%`],
          ]} />
        </Card>

        <Card>
          <SectionHead icon={Users} title="Login Activity" sub="Last 30 days" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <KPI icon={Users}  label="Total Logins"  value={fmtNum(lh?.total_logins_30d ?? 0)} accent />
            <KPI icon={XCircle} label="Failed Logins" value={fmtNum(lh?.failed_logins_30d ?? 0)} warn={!!lh && lh.failed_logins_30d > 0} />
          </div>
          <StatTable rows={[
            ['Unique Users', fmtNum(lh?.unique_users_30d ?? 0)],
            ['Credit Usage (30d)', `${cm?.credits_used_last_30d?.toFixed(2) ?? 0} credits`],
            ['Compute Credits', `${cm?.compute_credits?.toFixed(2) ?? 0}`],
            ['Cloud Svc Credits', `${cm?.cloud_services_credits?.toFixed(2) ?? 0}`],
          ]} />
        </Card>
      </div>
    </div>
  )
}

// ── Compute tab ───────────────────────────────────────────────────────────────

function ComputeTab({ result }: { result: SnowflakeAssessmentResult }) {
  const wm = result.warehouse_metrics
  const warehouses = result.warehouses ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {wm && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KPI icon={Zap}         label="Total"        value={wm.total_warehouses} accent />
          <KPI icon={CheckCircle2} label="Active"      value={wm.active_warehouses} />
          <KPI icon={Activity}    label="Suspended"    value={wm.suspended_warehouses} />
          <KPI icon={Layers}      label="Multi-Cluster" value={wm.multi_cluster_warehouses} />
        </div>
      )}

      {warehouses.length > 0 && (
        <Card>
          <SectionHead icon={Zap} title="Warehouse Inventory" sub={`${warehouses.length} warehouses`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.fontDM }}>
              <thead>
                <tr style={{ background: D.surface3 }}>
                  {['Name','State','Size','Type','Auto-Suspend','Scaling Policy','Running','Queued','Owner'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10,
                      fontFamily: D.fontDM, fontWeight: 700, color: D.textMuted,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      borderBottom: `1px solid ${D.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w, i) => (
                  <tr key={w.name} style={{ background: i % 2 === 0 ? D.surface : D.surface2 }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: D.textPrimary, fontFamily: D.fontMono }}>{w.name}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <Pill
                        label={w.state}
                        color={w.state.toUpperCase() === 'STARTED' ? D.greenDim : D.borderFaint}
                        textColor={w.state.toUpperCase() === 'STARTED' ? D.green : D.textMuted}
                      />
                    </td>
                    <td style={{ padding: '9px 12px', color: D.textSecond }}>{w.size}</td>
                    <td style={{ padding: '9px 12px', color: D.textSecond }}>{w.wh_type}</td>
                    <td style={{ padding: '9px 12px', fontFamily: D.fontMono, color: D.textSecond }}>{w.auto_suspend}s</td>
                    <td style={{ padding: '9px 12px', color: D.textSecond }}>{w.scaling_policy || 'N/A'}</td>
                    <td style={{ padding: '9px 12px', fontFamily: D.fontMono, color: D.textPrimary }}>{w.running}</td>
                    <td style={{ padding: '9px 12px', fontFamily: D.fontMono, color: w.queued > 0 ? D.orange : D.textPrimary }}>{w.queued}</td>
                    <td style={{ padding: '9px 12px', color: D.textSecond }}>{w.owner || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Data tab ──────────────────────────────────────────────────────────────────

function DataTab({ result }: { result: SnowflakeAssessmentResult }) {
  const ds = result.database_summary
  const oi = result.object_inventory
  const databases = result.databases ?? []

  const objectItems = oi ? [
    { label: 'Stages',              value: oi.stages },
    { label: 'Pipes',               value: oi.pipes },
    { label: 'Tasks',               value: oi.tasks },
    { label: 'Streams',             value: oi.streams },
    { label: 'Procedures',          value: oi.procedures },
    { label: 'Functions',           value: oi.functions },
    { label: 'Sequences',           value: oi.sequences },
    { label: 'File Formats',        value: oi.file_formats },
    { label: 'Dynamic Tables',      value: oi.dynamic_tables },
    { label: 'Shares (Out)',        value: oi.shares_outbound },
    { label: 'Shares (In)',         value: oi.shares_inbound },
    { label: 'Resource Monitors',   value: oi.resource_monitors },
    { label: 'Network Policies',    value: oi.network_policies },
    { label: 'Masking Policies',    value: oi.masking_policies },
    { label: 'Row Access Policies', value: oi.row_access_policies },
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {ds && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KPI icon={Database}  label="Databases"      value={ds.total_databases} accent />
          <KPI icon={Layers}    label="Schemas"         value={fmtNum(ds.total_schemas)} />
          <KPI icon={BarChart3} label="Base Tables"     value={fmtNum(ds.total_tables)} />
          <KPI icon={Eye}       label="Views"           value={fmtNum(ds.total_views)} />
          <KPI icon={Globe}     label="External Tables" value={fmtNum(ds.total_external_tables)} />
          <KPI icon={Zap}       label="Mat. Views"      value={fmtNum(ds.total_materialized_views)} />
          <KPI icon={HardDrive} label="Total Size"      value={fmtBytes(ds.total_size_bytes)} info />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* databases list */}
        {databases.length > 0 && (
          <Card>
            <SectionHead icon={Database} title="Databases" sub={`${databases.length} listed`} />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.fontDM }}>
                <thead>
                  <tr style={{ background: D.surface3 }}>
                    {['Name','Owner','Retention','Transient','Created'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10,
                        fontWeight: 700, color: D.textMuted, textTransform: 'uppercase',
                        letterSpacing: '0.06em', borderBottom: `1px solid ${D.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {databases.map((db, i) => (
                    <tr key={db.name} style={{ background: i % 2 === 0 ? D.surface : D.surface2 }}>
                      <td style={{ padding: '7px 10px', fontWeight: 700, color: D.textPrimary, fontFamily: D.fontMono }}>{db.name}</td>
                      <td style={{ padding: '7px 10px', color: D.textSecond }}>{db.owner || 'N/A'}</td>
                      <td style={{ padding: '7px 10px', fontFamily: D.fontMono, color: D.textSecond }}>{db.retention_time}d</td>
                      <td style={{ padding: '7px 10px' }}>
                        <Pill
                          label={db.is_transient ? 'Yes' : 'No'}
                          color={db.is_transient ? D.orangeDim : D.borderFaint}
                          textColor={db.is_transient ? D.orange : D.textMuted}
                        />
                      </td>
                      <td style={{ padding: '7px 10px', color: D.textMuted, fontSize: 10 }}>{db.created_on?.slice(0, 10) || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* object inventory */}
        {objectItems.length > 0 && (
          <Card>
            <SectionHead icon={Layers} title="Platform Objects" sub="Inventory" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {objectItems.map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 12px', borderRadius: 8,
                  background: D.surface2, border: `1px solid ${D.borderFaint}`,
                }}>
                  <span style={{ fontSize: 11, fontFamily: D.fontDM, color: D.textSecond }}>{label}</span>
                  <span style={{ fontSize: 13, fontFamily: D.fontMono, fontWeight: 700, color: D.textPrimary }}>{value}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Security tab ──────────────────────────────────────────────────────────────

function SecurityTab({ result }: { result: SnowflakeAssessmentResult }) {
  const up  = result.user_profile
  const sp  = result.security_posture
  const lh  = result.login_history
  const ah  = result.access_history

  const clientData = lh && Object.keys(lh.client_types).length > 0
    ? Object.entries(lh.client_types).map(([label, value]) => ({ label, value }))
    : []

  const failReasonData = lh && Object.keys(lh.failed_reasons).length > 0
    ? Object.entries(lh.failed_reasons).map(([label, value]) => ({ label, value }))
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* users overview */}
      {up && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KPI icon={Users}  label="Total Users"   value={up.total_users} accent />
          <KPI icon={Lock}   label="No MFA"         value={up.users_without_mfa} warn={up.users_without_mfa > 0} />
          <KPI icon={Shield} label="Admin Users"    value={up.admin_users} />
          <KPI icon={Server} label="Service Accts"  value={up.service_accounts} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {up && (
          <Card>
            <SectionHead icon={Users} title="User Profile" />
            <StatTable rows={[
              ['Total Users',       up.total_users],
              ['Disabled Users',    up.disabled_users],
              ['Users Without MFA', up.users_without_mfa],
              ['Admin Users',       up.admin_users],
              ['Service Accounts',  up.service_accounts],
              ['Total Roles',       up.total_roles],
              ['Custom Roles',      up.custom_roles],
              ['System Roles',      up.system_roles],
            ]} />
          </Card>
        )}

        {sp && (
          <Card>
            <SectionHead icon={Shield} title="Security Posture" />
            <StatTable rows={[
              ['Network Policies',          sp.network_policies_count],
              ['Masking Policies',          sp.masking_policies_count],
              ['Row Access Policies',       sp.row_access_policies_count],
              ['Resource Monitors',         sp.resource_monitors_count],
              ['Users Without MFA',         sp.users_without_mfa],
              ['Users (PUBLIC default)',    sp.users_with_default_role_public],
              ['Data Shares Total',         sp.shares_total],
            ]} />
          </Card>
        )}
      </div>

      {/* login history */}
      {lh && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card>
            <SectionHead icon={Activity} title="Login Activity" sub="Last 30 days" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <KPI icon={Users}  label="Total Logins"  value={fmtNum(lh.total_logins_30d)} accent />
              <KPI icon={XCircle} label="Failed Logins" value={fmtNum(lh.failed_logins_30d)} warn={lh.failed_logins_30d > 0} />
            </div>
            <StatTable rows={[['Unique Users', fmtNum(lh.unique_users_30d)]]} />
            {clientData.length > 0 && (
              <>
                <p style={{ fontSize: 10, fontFamily: D.fontDM, fontWeight: 700, color: D.textMuted,
                  textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 8px' }}>
                  Client Types
                </p>
                <HBarChart data={clientData} color={D.blue} />
              </>
            )}
          </Card>

          <Card>
            <SectionHead icon={AlertTriangle} title="Login Failures" sub="Failure reasons" />
            {failReasonData.length > 0 ? (
              <HBarChart data={failReasonData} color={D.red} />
            ) : (
              <p style={{ fontSize: 12, color: D.textMuted, fontFamily: D.fontDM }}>No failure data.</p>
            )}
            {ah && (
              <div style={{ marginTop: 16 }}>
                <SectionHead icon={Eye} title="Access History" sub="Last 30 days" />
                <StatTable rows={[
                  ['Total Access Events',    fmtNum(ah.total_access_events_30d)],
                  ['Distinct Objects',       fmtNum(ah.distinct_objects_accessed)],
                ]} />
                {ah.top_users_by_access.length > 0 && (
                  <>
                    <p style={{ fontSize: 10, fontFamily: D.fontDM, fontWeight: 700, color: D.textMuted,
                      textTransform: 'uppercase', letterSpacing: '0.08em', margin: '12px 0 8px' }}>
                      Top Users by Access
                    </p>
                    <HBarChart
                      data={ah.top_users_by_access.slice(0, 8).map(u => ({
                        label: String(u.user_name ?? u.user ?? 'Unknown'),
                        value: Number(u.access_count ?? u.count ?? 0),
                      }))}
                      color={D.purple}
                    />
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

// ── Performance tab ───────────────────────────────────────────────────────────

function PerformanceTab({ result }: { result: SnowflakeAssessmentResult }) {
  const qm = result.query_metrics

  if (!qm) return <p style={{ color: D.textMuted, fontFamily: D.fontDM }}>No query performance data available.</p>

  const queryTypeData = Object.entries(qm.query_types ?? {}).map(([label, value]) => ({ label, value }))
  const errorTypeData = Object.entries(qm.query_error_types ?? {}).map(([label, value]) => ({ label, value }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPI icon={BarChart3} label="Total Queries"   value={fmtNum(qm.total_queries_last_7d)} accent />
        <KPI icon={XCircle}   label="Failed Queries"  value={fmtNum(qm.failed_queries_last_7d)} warn={qm.failed_queries_last_7d > 0} />
        <KPI icon={Activity}  label="Avg Latency"     value={`${Math.round(qm.avg_execution_ms).toLocaleString()} ms`} />
        <KPI icon={Zap}       label="P95 Latency"     value={`${Math.round(qm.p95_execution_ms).toLocaleString()} ms`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <SectionHead icon={HardDrive} title="Data Scan Metrics" />
          <StatTable rows={[
            ['Bytes Scanned',           fmtBytes(qm.bytes_scanned_total)],
            ['Spilled to Local',        fmtBytes(qm.bytes_spilled_local)],
            ['Spilled to Remote',       fmtBytes(qm.bytes_spilled_remote)],
            ['Partition Scan %',        `${qm.partitions_scanned_pct.toFixed(1)}%`],
          ]} />
        </Card>

        <Card>
          <SectionHead icon={BarChart3} title="Query Types" sub="By count" />
          {queryTypeData.length > 0 ? (
            <HBarChart data={queryTypeData} color={D.teal} />
          ) : (
            <p style={{ fontSize: 12, color: D.textMuted, fontFamily: D.fontDM }}>No query type data.</p>
          )}
        </Card>
      </div>

      {qm.most_expensive_queries.length > 0 && (
        <Card>
          <SectionHead icon={Zap} title="Slowest Queries" sub="Top 10 by execution time" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {qm.most_expensive_queries.slice(0, 10).map((q, i) => (
              <div key={i} style={{
                padding: '12px 14px', borderRadius: 10,
                background: D.surface2, border: `1px solid ${D.borderFaint}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontFamily: D.fontMono, fontWeight: 800, color: D.amber }}>
                      {Number(q.elapsed_ms) >= 1000
                        ? `${(Number(q.elapsed_ms) / 1000).toFixed(1)}s`
                        : `${Math.round(Number(q.elapsed_ms))}ms`}
                    </span>
                    <Pill label={String(q.query_type ?? 'QUERY')} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: D.fontDM, color: D.textMuted }}>
                    {String(q.warehouse ?? '')} · {String(q.user ?? '')}
                  </span>
                </div>
                <p style={{
                  fontSize: 10, fontFamily: D.fontMono, color: D.textSecond,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {String(q.query_text ?? '').slice(0, 180)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {errorTypeData.length > 0 && (
        <Card>
          <SectionHead icon={AlertTriangle} title="Query Error Types" />
          <HBarChart data={errorTypeData} color={D.red} />
        </Card>
      )}
    </div>
  )
}

// ── Cost tab ──────────────────────────────────────────────────────────────────

function CostTab({ result }: { result: SnowflakeAssessmentResult }) {
  const cm = result.cost_metrics
  const sm = result.storage_metrics

  if (!cm && !sm) return <p style={{ color: D.textMuted, fontFamily: D.fontDM }}>No cost data available.</p>

  const whData = (cm?.top_warehouses_by_credit ?? []).map(w => ({
    label: String(w.name ?? ''),
    value: Number(w.credits ?? 0),
    sub: `${Number(w.credits ?? 0).toFixed(2)} cr`,
  }))

  const svcData = (cm?.by_service_type ?? []).map(s => ({
    label: String(s.service_type ?? s.type ?? ''),
    value: Number(s.credits ?? 0),
    sub: `${Number(s.credits ?? 0).toFixed(2)} cr`,
  }))

  const trendData = (cm?.daily_trend ?? []).slice(-14)
  const storageTrend = (sm?.trend ?? []).slice(-14)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {cm && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <KPI icon={DollarSign} label="Total Credits (30d)"    value={cm.credits_used_last_30d.toFixed(2)} accent />
          <KPI icon={Zap}        label="Compute Credits"         value={cm.compute_credits.toFixed(2)} />
          <KPI icon={Globe}      label="Cloud Svc Credits"       value={cm.cloud_services_credits.toFixed(2)} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {whData.length > 0 && (
          <Card>
            <SectionHead icon={Zap} title="Top Warehouses by Credit" sub="Last 30 days" />
            <HBarChart data={whData} color={D.amber} />
          </Card>
        )}

        {svcData.length > 0 && (
          <Card>
            <SectionHead icon={Settings} title="Credits by Service Type" sub="Last 30 days" />
            <HBarChart data={svcData} color={D.purple} />
          </Card>
        )}
      </div>

      {sm && sm.total_bytes > 0 && (
        <Card>
          <SectionHead icon={HardDrive} title="Storage Breakdown" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <KPI icon={HardDrive} label="Total"       value={fmtBytes(sm.total_bytes)} accent />
            <KPI icon={Database}  label="Table Data"  value={fmtBytes(sm.storage_bytes)} />
            <KPI icon={Layers}    label="Stage Data"  value={fmtBytes(sm.stage_bytes)} />
            <KPI icon={Shield}    label="Fail-Safe"   value={fmtBytes(sm.failsafe_bytes)} />
          </div>
          {storageTrend.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontFamily: D.fontDM, fontWeight: 700, color: D.textMuted,
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                30-Day Storage Trend (sampled)
              </p>
              <HBarChart
                data={storageTrend.map(d => ({
                  label: String(d.date ?? '').slice(5),
                  value: Number(d.storage_bytes ?? 0),
                  sub: fmtBytes(Number(d.storage_bytes ?? 0)),
                }))}
                color={D.teal}
              />
            </>
          )}
        </Card>
      )}

      {trendData.length > 0 && (
        <Card>
          <SectionHead icon={TrendingUp} title="Daily Credit Trend" sub="Last 14 days" />
          <HBarChart
            data={trendData.map(d => ({
              label: String(d.date ?? '').slice(5),
              value: Number(d.credits ?? 0),
              sub: `${Number(d.credits ?? 0).toFixed(2)}`,
            }))}
            color={D.amber}
          />
        </Card>
      )}
    </div>
  )
}

// ── Governance tab ────────────────────────────────────────────────────────────

function GovernanceTab({ result }: { result: SnowflakeAssessmentResult }) {
  const gov  = result.governance
  const intg = result.integrations
  const rep  = result.replication
  const al   = result.alerts

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* governance policies */}
      {gov && (
        <Card>
          <SectionHead icon={Tag} title="Governance Policies" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <KPI icon={Lock}   label="Projection Policies"    value={gov.projection_policies} />
            <KPI icon={Layers} label="Aggregation Policies"   value={gov.aggregation_policies} />
            <KPI icon={Shield} label="Auth Policies"          value={gov.authentication_policies} />
            <KPI icon={Lock}   label="Password Policies"      value={gov.password_policies} />
            <KPI icon={Users}  label="Session Policies"       value={gov.session_policies} />
            <KPI icon={Tag}    label="Total Tags"             value={gov.total_tags} accent />
          </div>
          {gov.tags.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontFamily: D.fontDM, fontWeight: 700, color: D.textMuted,
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Tags
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {gov.tags.slice(0, 30).map((t, i) => (
                  <Pill
                    key={i}
                    label={`${t.database_name ?? ''}.${t.name ?? t.tag_name ?? ''}`}
                    color={D.amberFaint}
                    textColor={D.amberDim}
                  />
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* integrations */}
      {intg && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card>
            <SectionHead icon={Link2} title="Integrations" sub="By category" />
            <StatTable rows={[
              ['Storage Integrations',      intg.storage_integrations.length],
              ['Notification Integrations', intg.notification_integrations.length],
              ['Security Integrations',     intg.security_integrations.length],
              ['API Integrations',          intg.api_integrations.length],
              ['Catalog Integrations',      intg.catalog_integrations.length],
            ]} />
          </Card>

          {/* alerts */}
          {al && (
            <Card>
              <SectionHead icon={Bell} title="Alerts" sub={`${al.total_alerts} total`} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <KPI icon={Bell}        label="Total Alerts"   value={al.total_alerts} />
                <KPI icon={CheckCircle2} label="Enabled"       value={al.enabled_alerts} accent />
              </div>
              {al.alerts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {al.alerts.slice(0, 8).map((a, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 12px', borderRadius: 8,
                      background: D.surface2, border: `1px solid ${D.borderFaint}`,
                    }}>
                      <span style={{ fontSize: 11, fontFamily: D.fontMono, color: D.textPrimary }}>{String(a.name ?? '')}</span>
                      <Pill
                        label={String(a.state ?? 'UNKNOWN')}
                        color={String(a.state ?? '') === 'started' ? D.greenDim : D.borderFaint}
                        textColor={String(a.state ?? '') === 'started' ? D.green : D.textMuted}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* replication */}
      {rep && (
        <Card>
          <SectionHead icon={GitMerge} title="Replication" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
            <KPI icon={GitMerge} label="Replication Groups"  value={rep.replication_groups} />
            <KPI icon={Activity} label="Failover Groups"     value={rep.failover_groups} />
            <KPI icon={Database} label="Replicated DBs"      value={rep.replicated_databases.length} accent />
          </div>
          {rep.replicated_databases.length > 0 && (
            <StatTable
              rows={rep.replicated_databases.slice(0, 10).map(d => [
                String(d.name ?? d.database_name ?? ''),
                String(d.replication_allowed_to_accounts ?? d.region ?? '—'),
              ] as [string, string])}
            />
          )}
        </Card>
      )}

      {/* integrations detail */}
      {intg && [
        { title: 'Storage Integrations',      items: intg.storage_integrations },
        { title: 'Security Integrations',     items: intg.security_integrations },
        { title: 'API Integrations',          items: intg.api_integrations },
        { title: 'Notification Integrations', items: intg.notification_integrations },
      ].filter(g => g.items.length > 0).map(group => (
        <Card key={group.title}>
          <SectionHead icon={Link2} title={group.title} sub={`${group.items.length} item(s)`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.items.map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 12px', borderRadius: 8,
                background: D.surface2, border: `1px solid ${D.borderFaint}`,
              }}>
                <span style={{ fontSize: 11, fontFamily: D.fontMono, color: D.textPrimary }}>
                  {String(item.name ?? '')}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Pill label={String(item.type ?? item.integration_type ?? '—')} />
                  <Pill
                    label={String(item.enabled ?? item.status ?? 'unknown')}
                    color={String(item.enabled) === 'true' || String(item.status) === 'ENABLED' ? D.greenDim : D.borderFaint}
                    textColor={String(item.enabled) === 'true' || String(item.status) === 'ENABLED' ? D.green : D.textMuted}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Operations tab ────────────────────────────────────────────────────────────

function OperationsTab({ result }: { result: SnowflakeAssessmentResult }) {
  const om = result.operational_metrics

  if (!om) return <p style={{ color: D.textMuted, fontFamily: D.fontDM }}>No operational metrics available.</p>

  const transferData = Object.entries(om.data_transfer_by_cloud ?? {}).map(([label, value]) => ({
    label, value: Number(value), sub: fmtBytes(Number(value)),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPI icon={Zap}      label="Auto-Cluster Credits"    value={om.auto_clustering_credits.toFixed(3)} accent />
        <KPI icon={Database} label="Bytes Reclustered"       value={fmtBytes(om.auto_clustering_bytes_reclustered)} />
        <KPI icon={Layers}   label="Tables Clustered"        value={fmtNum(om.auto_clustering_tables)} />
        <KPI icon={Activity} label="Snowpipe Files (30d)"    value={fmtNum(om.pipe_files_inserted)} />
        <KPI icon={HardDrive} label="Snowpipe Bytes (30d)"   value={fmtBytes(om.pipe_bytes_inserted)} />
        <KPI icon={DollarSign} label="Pipe Credits (30d)"    value={om.pipe_credits.toFixed(3)} />
        <KPI icon={Zap}      label="Search Opt Credits"      value={om.search_opt_credits.toFixed(3)} />
        <KPI icon={Eye}      label="MV Refresh Credits"      value={om.mv_refresh_credits.toFixed(3)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <SectionHead icon={Settings} title="Task Runs" sub="Last 7 days" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <KPI icon={BarChart3}    label="Total Runs"    value={fmtNum(om.task_runs_7d)} accent />
            <KPI icon={CheckCircle2} label="Succeeded"     value={fmtNum(om.task_succeeded_7d)} />
          </div>
          <StatTable rows={[
            ['Failed Tasks',    fmtNum(om.task_failed_7d)],
            ['Success Rate',    om.task_runs_7d > 0
              ? `${((om.task_succeeded_7d / om.task_runs_7d) * 100).toFixed(1)}%`
              : 'N/A'],
            ['Auto-Cluster Credits', om.auto_clustering_credits.toFixed(4)],
            ['Search Opt Credits',   om.search_opt_credits.toFixed(4)],
            ['MV Refresh Credits',   om.mv_refresh_credits.toFixed(4)],
          ]} />
          {om.task_failed_7d > 0 && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 8,
              background: D.redDim, border: `1px solid ${D.red}33`,
              fontSize: 11, fontFamily: D.fontDM, color: D.red,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0 }} />
              {om.task_failed_7d} task run(s) failed in the last 7 days
            </div>
          )}
        </Card>

        <Card>
          <SectionHead icon={Globe} title="Data Transfer" sub="Last 30 days" />
          <div style={{ marginBottom: 14 }}>
            <KPI icon={HardDrive} label="Total Transferred" value={fmtBytes(om.data_transfer_bytes)} accent />
          </div>
          {transferData.length > 0 ? (
            <>
              <p style={{ fontSize: 10, fontFamily: D.fontDM, fontWeight: 700, color: D.textMuted,
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                By Target Cloud
              </p>
              <HBarChart data={transferData} color={D.teal} />
            </>
          ) : (
            <p style={{ fontSize: 12, color: D.textMuted, fontFamily: D.fontDM }}>No data transfer recorded.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

// ── Full results dashboard ────────────────────────────────────────────────────

function ResultsDashboard({ result, onDownloadExcel, onDownloadWord, downloading }: {
  result: SnowflakeAssessmentResult
  onDownloadExcel: () => void
  onDownloadWord: () => void
  downloading: 'excel' | 'word' | null
}) {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div>
      {/* tab bar */}
      <div style={{ background: D.surface, borderRadius: '14px 14px 0 0', border: `1px solid ${D.border}`,
        borderBottom: 'none', padding: '0 4px' }}>
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>

      {/* tab content */}
      <div style={{
        background: D.surface, borderRadius: '0 0 14px 14px',
        border: `1px solid ${D.border}`, borderTop: 'none',
        padding: 24, minHeight: 400,
      }}>
        {activeTab === 'overview'    && <OverviewTab    result={result} />}
        {activeTab === 'compute'     && <ComputeTab     result={result} />}
        {activeTab === 'data'        && <DataTab        result={result} />}
        {activeTab === 'security'    && <SecurityTab    result={result} />}
        {activeTab === 'performance' && <PerformanceTab result={result} />}
        {activeTab === 'cost'        && <CostTab        result={result} />}
        {activeTab === 'governance'  && <GovernanceTab  result={result} />}
        {activeTab === 'operations'  && <OperationsTab  result={result} />}
      </div>

      {/* download bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <button
          onClick={onDownloadExcel}
          disabled={downloading === 'excel'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 10, fontSize: 13,
            fontFamily: D.fontDM, fontWeight: 600, cursor: 'pointer',
            background: `linear-gradient(135deg, ${D.amberDim}, ${D.amber})`,
            color: '#ffffff', border: 'none',
            boxShadow: `0 2px 12px ${D.amberGlow}`,
            opacity: downloading === 'excel' ? 0.6 : 1,
          }}
        >
          {downloading === 'excel'
            ? <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />
            : <FileSpreadsheet style={{ width: 15, height: 15 }} />}
          Download Excel
        </button>
        <button
          onClick={onDownloadWord}
          disabled={downloading === 'word'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 10, fontSize: 13,
            fontFamily: D.fontDM, fontWeight: 600, cursor: 'pointer',
            background: D.surface2, color: D.textSecond,
            border: `1px solid ${D.border}`, boxShadow: D.shadowCard,
            opacity: downloading === 'word' ? 0.6 : 1,
          }}
        >
          {downloading === 'word'
            ? <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />
            : <BookOpen style={{ width: 15, height: 15, color: D.amber }} />}
          Download Word
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SnowflakeSessionDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [jobStatus, setJobStatus] = useState<SnowflakeJobStatusResponse | null>(null)
  const [result, setResult] = useState<SnowflakeAssessmentResult | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<'excel' | 'word' | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!jobId) return
    try {
      const r = await api.snowflakeJobStatus(jobId)
      setJobStatus(r.data)
      if (r.data.status === 'completed' && !result) {
        const res = await api.snowflakeJobResults(jobId)
        setResult(res.data)
      }
      if (r.data.status === 'completed' || r.data.status === 'failed') {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    } catch (err) {
      setPageError(getApiErrorMessage(err))
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [jobId, result])

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, 2500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchStatus])

  async function handleDownload(type: 'excel' | 'word') {
    if (!jobId) return
    setDownloading(type)
    try {
      if (type === 'excel') await api.snowflakeDownloadExcel(jobId)
      else await api.snowflakeDownloadWord(jobId)
    } catch { /* non-fatal */ }
    finally { setDownloading(null) }
  }

  const isRunning = jobStatus?.status === 'running' || jobStatus?.status === 'pending'

  return (
    <div style={{ minHeight: '100vh', background: D.bg }}>

      {/* hero header */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEEFF 100%)',
        borderBottom: `1px solid ${D.border}`,
      }}>
        {/* ambient glow */}
        <div style={{
          position: 'absolute', width: 600, height: 600,
          top: -300, right: -150, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(41,181,232,0.06) 0%, transparent 65%)',
        }} />

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
          <button
            onClick={() => navigate('/snowflake/sessions')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontFamily: D.fontDM, fontWeight: 600,
              color: D.textMuted, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = D.amber }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = D.textMuted }}
          >
            <ArrowLeft style={{ width: 13, height: 13 }} />
            All Snowflake Assessments
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(135deg, #29B5E8 0%, #0099CC 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: D.shadowCard,
              }}>
                <SnowflakeLogo size={26} />
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontFamily: D.fontSyne, fontWeight: 800,
                  color: D.textPrimary, margin: 0 }}>
                  {jobStatus?.label || 'Snowflake Assessment'}
                </h1>
                <p style={{ fontSize: 12, fontFamily: D.fontMono, color: D.textMuted, marginTop: 3 }}>
                  Job {jobId?.slice(0, 8)}
                  {result?.account_info?.account_name && ` · ${result.account_info.account_name}`}
                  {result?.assessed_at && ` · ${result.assessed_at.slice(0, 16).replace('T', ' ')}`}
                </p>
              </div>
            </div>

            {jobStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 10, flexShrink: 0,
                fontSize: 13, fontFamily: D.fontDM, fontWeight: 700,
                background: jobStatus.status === 'completed' ? D.greenDim
                  : jobStatus.status === 'failed' ? D.redDim
                  : D.amberFaint,
                color: jobStatus.status === 'completed' ? D.green
                  : jobStatus.status === 'failed' ? D.red
                  : D.amber,
                border: `1px solid ${jobStatus.status === 'completed' ? D.green : jobStatus.status === 'failed' ? D.red : D.amber}33`,
              }}>
                {jobStatus.status === 'completed' && <CheckCircle2 style={{ width: 15, height: 15 }} />}
                {jobStatus.status === 'failed'    && <XCircle      style={{ width: 15, height: 15 }} />}
                {isRunning                         && <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />}
                {jobStatus.status.charAt(0).toUpperCase() + jobStatus.status.slice(1)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* body */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {pageError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            borderRadius: 10, fontSize: 13, fontFamily: D.fontDM,
            background: D.redDim, border: `1px solid ${D.red}33`, color: D.red,
          }}>
            <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} />
            {pageError}
          </div>
        )}

        {!result && (
          <AssessmentTerminal
            status={jobStatus?.status || 'pending'}
            progressMessage={jobStatus?.progress_message ?? undefined}
            error={jobStatus?.error ?? undefined}
          />
        )}

        {result && (
          <ResultsDashboard
            result={result}
            onDownloadExcel={() => handleDownload('excel')}
            onDownloadWord={() => handleDownload('word')}
            downloading={downloading}
          />
        )}
      </div>
    </div>
  )
}
