import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Snowflake, CheckCircle2, XCircle, Loader2, ArrowLeft,
  FileSpreadsheet, BookOpen, ChevronDown, ChevronUp,
  Database, Zap, Shield, Users, BarChart3,
  Layers, AlertTriangle, Server, DollarSign,
  Activity, Lock, HardDrive, Globe,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { SnowflakeJobStatusResponse, SnowflakeAssessmentResult } from '../types/api'

// ── Ocean design tokens ───────────────────────────────────────────────────────

const T = {
  primary:    '#00B8E6',
  dark:       '#0A1628',
  mid:        '#0099CC',
  accent:     '#00D4FF',
  surface:    '#EBF4FF',
  light50:    '#F0F8FF',
  light100:   '#E0F2FF',
  ice:        '#B8D4E8',
  glow:       'rgba(0,184,230,0.15)',
  shadowCard: '0 2px 4px rgba(0,184,230,0.05), 0 8px 32px rgba(0,184,230,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowHover:'0 4px 12px rgba(0,184,230,0.10), 0 20px 48px rgba(0,184,230,0.12)',
  gradBtn:    'linear-gradient(135deg, #0099CC 0%, #00B8E6 60%, #00D4FF 100%)',
  gradHero:   'linear-gradient(135deg, #0A1628 0%, #0D2040 50%, #102848 100%)',
  gradSurface:'linear-gradient(180deg, #F0F8FF 0%, #E8F4FF 100%)',
}

// ── Assessment steps ──────────────────────────────────────────────────────────

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
  'Fetching query performance metrics',
  'Fetching storage usage',
  'Fetching warehouse credit metering',
  'Generating Excel report',
  'Generating Word report',
]

// ── Progress terminal ─────────────────────────────────────────────────────────

function AssessmentTerminal({ status, progressMessage, error }: {
  status: string; progressMessage?: string; error?: string
}) {
  const stepIdx = progressMessage
    ? STEPS.findIndex((s) => progressMessage.toLowerCase().includes(s.toLowerCase().split(' ')[0]))
    : -1
  const completed = status === 'completed' ? STEPS.length : Math.max(stepIdx, 0)
  const progress = Math.min((completed / STEPS.length) * 100, 100)

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.96)', border: `1px solid ${T.ice}`, boxShadow: T.shadowCard }}
    >
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b"
        style={{ borderColor: T.light100, background: `linear-gradient(135deg, ${T.light50} 0%, rgba(255,255,255,0) 100%)` }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: status === 'completed' ? '#10B981' : status === 'failed' ? '#EF4444' : status === 'running' ? T.primary : '#94A3B8',
              boxShadow: status === 'running' ? `0 0 8px ${T.primary}` : 'none',
              animation: status === 'running' ? 'pulse 2s infinite' : 'none',
            }}
          />
          <span className="text-sm font-bold" style={{ color: T.dark }}>Assessment Progress</span>
          {status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: T.primary }} />}
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: status === 'completed' ? 'rgba(236,253,245,0.9)' : status === 'failed' ? 'rgba(254,242,242,0.9)' : status === 'running' ? T.light100 : '#F1F5F9',
            color: status === 'completed' ? '#059669' : status === 'failed' ? '#DC2626' : status === 'running' ? T.mid : '#64748B',
          }}
        >
          {status === 'completed' ? `${STEPS.length}/${STEPS.length} steps` : `${completed}/${STEPS.length} steps`}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-4 pb-1">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: T.light100 }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${status === 'completed' ? 100 : progress}%`,
              background: status === 'failed'
                ? 'linear-gradient(90deg, #EF4444, #F87171)'
                : `linear-gradient(90deg, ${T.mid}, ${T.primary}, ${T.accent})`,
              boxShadow: status !== 'failed' ? `0 0 8px ${T.glow}` : 'none',
            }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="px-5 pb-5 pt-3">
        <div className="grid grid-cols-1 gap-1">
          {STEPS.map((step, i) => {
            const isDone = status === 'completed' || i < completed
            const isCurrent = status === 'running' && i === completed
            const isFuture = !isDone && !isCurrent
            return (
              <div key={step} className="flex items-center gap-2.5 py-0.5">
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: isDone ? T.gradBtn : isCurrent ? T.light100 : 'transparent',
                    border: `1.5px solid ${isDone ? T.primary : isCurrent ? T.primary : T.ice}`,
                    boxShadow: isDone ? `0 0 6px ${T.glow}` : 'none',
                  }}
                >
                  {isDone
                    ? <CheckCircle2 className="h-3 w-3 text-white" style={{ height: '10px', width: '10px' }} />
                    : isCurrent
                      ? <Loader2 className="h-3 w-3 animate-spin" style={{ color: T.primary, height: '10px', width: '10px' }} />
                      : <span className="text-[8px] font-mono font-bold" style={{ color: T.ice }}>{i + 1}</span>
                  }
                </div>
                <span
                  className="text-xs"
                  style={{
                    color: isDone ? T.mid : isCurrent ? T.primary : '#94A3B8',
                    fontWeight: isCurrent ? 600 : isDone ? 500 : 400,
                  }}
                >
                  {step}
                </span>
              </div>
            )
          })}
        </div>

        {error && (
          <div
            className="mt-4 flex items-start gap-2.5 p-3 rounded-xl text-xs"
            style={{ background: 'rgba(254,242,242,0.9)', border: '1px solid #FECACA', color: '#DC2626' }}
          >
            <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon, label, value, sub, accent = false, warn = false,
}: {
  icon: React.ElementType; label: string; value: string | number
  sub?: string; accent?: boolean; warn?: boolean
}) {
  const bg = warn ? 'rgba(255,249,240,0.95)' : accent ? T.light50 : 'rgba(255,255,255,0.97)'
  const border = warn ? '#FED7AA' : accent ? T.ice : '#E8F2FF'
  const iconBg = warn ? 'rgba(251,146,60,0.12)' : accent ? T.light100 : 'rgba(240,248,255,0.8)'
  const iconColor = warn ? '#FB923C' : accent ? T.primary : T.mid
  const valueColor = warn ? '#EA580C' : T.dark
  return (
    <div
      className="rounded-xl p-4 transition-all duration-200"
      style={{ background: bg, border: `1px solid ${border}`, boxShadow: T.shadowCard }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = T.shadowHover; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = T.shadowCard; e.currentTarget.style.transform = '' }}
    >
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center mb-3"
        style={{ background: iconBg }}
      >
        <Icon className="h-4 w-4" style={{ color: iconColor }} />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: '#94A3B8' }}>{label}</p>
      <p className="text-xl font-bold" style={{ color: valueColor }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: '#64748B' }}>{sub}</p>}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children, defaultOpen = true }: {
  icon: React.ElementType; title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.96)', border: `1px solid ${T.ice}`, boxShadow: T.shadowCard }}
    >
      <button
        className="w-full flex items-center justify-between px-5 py-4 transition-colors duration-150"
        style={{ borderBottom: open ? `1px solid ${T.light100}` : 'none' }}
        onClick={() => setOpen(!open)}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.light50 }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: T.light100 }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: T.primary }} />
          </div>
          <h3 className="text-sm font-bold" style={{ color: T.dark }}>{title}</h3>
        </div>
        {open ? <ChevronUp className="h-4 w-4" style={{ color: T.ice }} /> : <ChevronDown className="h-4 w-4" style={{ color: T.ice }} />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

// ── Simple KV table ───────────────────────────────────────────────────────────

function KVTable({ rows }: { rows: [string, string | number][] }) {
  return (
    <div className="space-y-0 overflow-hidden rounded-xl" style={{ border: `1px solid ${T.ice}` }}>
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className="flex items-center justify-between px-4 py-2.5 text-sm"
          style={{ background: i % 2 === 0 ? T.light50 : 'rgba(255,255,255,0.95)' }}
        >
          <span style={{ color: '#64748B' }}>{k}</span>
          <span className="font-semibold" style={{ color: T.dark }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ── Bytes formatter ───────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`
  if (b >= 1e9)  return `${(b / 1e9).toFixed(2)} GB`
  if (b >= 1e6)  return `${(b / 1e6).toFixed(2)} MB`
  if (b >= 1e3)  return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

// ── Results dashboard ─────────────────────────────────────────────────────────

function ResultsDashboard({ result, onDownloadExcel, onDownloadWord, downloading }: {
  result: SnowflakeAssessmentResult
  onDownloadExcel: () => void
  onDownloadWord: () => void
  downloading: 'excel' | 'word' | null
}) {
  const ai = result.account_info
  const wm = result.warehouse_metrics
  const ds = result.database_summary
  const oi = result.object_inventory
  const up = result.user_profile
  const sp = result.security_posture
  const qm = result.query_metrics
  const sm = result.storage_metrics
  const cm = result.cost_metrics

  return (
    <div className="space-y-5">
      {/* Download buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onDownloadExcel}
          disabled={downloading === 'excel'}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
          style={{ background: T.gradBtn, color: 'white', boxShadow: '0 2px 10px rgba(0,184,230,0.35)' }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,184,230,0.55)' }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,184,230,0.35)' }}
        >
          {downloading === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Download Excel
        </button>
        <button
          onClick={onDownloadWord}
          disabled={downloading === 'word'}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
          style={{ background: T.light100, color: T.dark, border: `1px solid ${T.ice}` }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.light50 }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.light100 }}
        >
          {downloading === 'word' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" style={{ color: T.primary }} />}
          Download Word
        </button>
      </div>

      {/* ── Account Info ─────────────────────────────────────────────────── */}
      {ai && (
        <Section icon={Globe} title="Account Information">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard icon={Server} label="Account" value={ai.account_name} accent />
            <MetricCard icon={Globe} label="Region" value={ai.region || 'N/A'} />
            <MetricCard icon={Shield} label="Role" value={ai.current_role || 'N/A'} />
            <MetricCard icon={Snowflake} label="Version" value={ai.snowflake_version || 'N/A'} />
          </div>
          <KVTable rows={[
            ['Organization', ai.organization_name || 'N/A'],
            ['Account Locator', ai.account_locator || 'N/A'],
            ['Authenticated User', ai.current_user || 'N/A'],
            ['Active Warehouse', ai.current_warehouse || 'N/A'],
          ]} />
        </Section>
      )}

      {/* ── Compute Warehouses ──────────────────────────────────────────── */}
      {wm && (
        <Section icon={Zap} title="Compute Warehouses">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard icon={Zap} label="Total" value={wm.total_warehouses} accent />
            <MetricCard icon={CheckCircle2} label="Active" value={wm.active_warehouses} />
            <MetricCard icon={Activity} label="Suspended" value={wm.suspended_warehouses} />
            <MetricCard icon={Layers} label="Multi-Cluster" value={wm.multi_cluster_warehouses} />
          </div>
          {Object.keys(wm.warehouses_by_size).length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>By Size</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(wm.warehouses_by_size).map(([size, count]) => (
                  <span
                    key={size}
                    className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: T.light100, color: T.dark, border: `1px solid ${T.ice}` }}
                  >
                    {size}: {count}
                  </span>
                ))}
              </div>
            </>
          )}
          {result.warehouses && result.warehouses.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: T.dark }}>
                    {['Name', 'State', 'Size', 'Type', 'Auto-Suspend', 'Running', 'Queued'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-white">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.warehouses.map((w, i) => (
                    <tr key={w.name} style={{ background: i % 2 === 0 ? T.light50 : 'white' }}>
                      <td className="px-3 py-2 font-semibold" style={{ color: T.dark }}>{w.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{
                            background: w.state.toUpperCase() === 'STARTED' ? 'rgba(236,253,245,0.9)' : 'rgba(241,245,249,0.9)',
                            color: w.state.toUpperCase() === 'STARTED' ? '#059669' : '#64748B',
                          }}
                        >
                          {w.state}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: '#64748B' }}>{w.size}</td>
                      <td className="px-3 py-2" style={{ color: '#64748B' }}>{w.wh_type}</td>
                      <td className="px-3 py-2" style={{ color: '#64748B' }}>{w.auto_suspend}s</td>
                      <td className="px-3 py-2" style={{ color: T.dark }}>{w.running}</td>
                      <td className="px-3 py-2" style={{ color: T.dark }}>{w.queued}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* ── Database Summary ─────────────────────────────────────────────── */}
      {ds && (
        <Section icon={Database} title="Database & Object Summary">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard icon={Database} label="Databases" value={ds.total_databases} accent />
            <MetricCard icon={Layers} label="Schemas" value={ds.total_schemas} />
            <MetricCard icon={BarChart3} label="Base Tables" value={ds.total_tables} />
            <MetricCard icon={Activity} label="Views" value={ds.total_views} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard icon={Globe} label="External Tables" value={ds.total_external_tables} />
            <MetricCard icon={Zap} label="Mat. Views" value={ds.total_materialized_views} />
            <MetricCard icon={HardDrive} label="Total Size" value={fmtBytes(ds.total_size_bytes)} accent />
          </div>
        </Section>
      )}

      {/* ── Object Inventory ─────────────────────────────────────────────── */}
      {oi && (
        <Section icon={Layers} title="Platform Object Inventory">
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {[
              { label: 'Stages', value: oi.stages },
              { label: 'Pipes', value: oi.pipes },
              { label: 'Tasks', value: oi.tasks },
              { label: 'Streams', value: oi.streams },
              { label: 'Procedures', value: oi.procedures },
              { label: 'Functions', value: oi.functions },
              { label: 'Sequences', value: oi.sequences },
              { label: 'File Formats', value: oi.file_formats },
              { label: 'Dynamic Tables', value: oi.dynamic_tables },
              { label: 'Shares (Out)', value: oi.shares_outbound },
              { label: 'Shares (In)', value: oi.shares_inbound },
              { label: 'Resource Monitors', value: oi.resource_monitors },
              { label: 'Network Policies', value: oi.network_policies },
              { label: 'Masking Policies', value: oi.masking_policies },
              { label: 'Row Access Policies', value: oi.row_access_policies },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl p-3 text-center"
                style={{ background: T.light50, border: `1px solid ${T.ice}` }}
              >
                <p className="text-lg font-bold" style={{ color: T.dark }}>{value}</p>
                <p className="text-[10px] leading-tight mt-0.5" style={{ color: '#64748B' }}>{label}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Users & Roles ─────────────────────────────────────────────────── */}
      {up && (
        <Section icon={Users} title="Users & Roles">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard icon={Users} label="Total Users" value={up.total_users} accent />
            <MetricCard icon={Lock} label="No MFA" value={up.users_without_mfa} warn={up.users_without_mfa > 0} />
            <MetricCard icon={Shield} label="Admin Users" value={up.admin_users} />
            <MetricCard icon={Layers} label="Total Roles" value={up.total_roles} />
          </div>
          <KVTable rows={[
            ['Disabled Users', up.disabled_users],
            ['Service Accounts', up.service_accounts],
            ['Custom Roles', up.custom_roles],
            ['System Roles', up.system_roles],
          ]} />
        </Section>
      )}

      {/* ── Security Posture ─────────────────────────────────────────────── */}
      {sp && (
        <Section icon={Shield} title="Security Posture">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard icon={Shield} label="Network Policies" value={sp.network_policies_count} accent={sp.network_policies_count > 0} />
            <MetricCard icon={Lock} label="Masking Policies" value={sp.masking_policies_count} accent={sp.masking_policies_count > 0} />
            <MetricCard icon={Users} label="No MFA" value={sp.users_without_mfa} warn={sp.users_without_mfa > 0} />
            <MetricCard icon={Activity} label="Data Shares" value={sp.shares_total} />
          </div>
          <KVTable rows={[
            ['Users with PUBLIC default role', sp.users_with_default_role_public],
            ['Row Access Policies', sp.row_access_policies_count],
            ['Resource Monitors', sp.resource_monitors_count],
          ]} />
        </Section>
      )}

      {/* ── Query Performance ─────────────────────────────────────────────── */}
      {qm && qm.total_queries_last_7d > 0 && (
        <Section icon={Activity} title="Query Performance (Last 7 Days)" defaultOpen={false}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard icon={BarChart3} label="Total Queries" value={qm.total_queries_last_7d.toLocaleString()} accent />
            <MetricCard icon={XCircle} label="Failed" value={qm.failed_queries_last_7d} warn={qm.failed_queries_last_7d > 0} />
            <MetricCard icon={Activity} label="Avg Latency" value={`${Math.round(qm.avg_execution_ms).toLocaleString()} ms`} />
            <MetricCard icon={Zap} label="P95 Latency" value={`${Math.round(qm.p95_execution_ms).toLocaleString()} ms`} />
          </div>
          <KVTable rows={[
            ['Bytes Scanned', fmtBytes(qm.bytes_scanned_total)],
            ['Spilled to Local Storage', fmtBytes(qm.bytes_spilled_local)],
            ['Spilled to Remote Storage', fmtBytes(qm.bytes_spilled_remote)],
          ]} />
          {qm.most_expensive_queries.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>Top Slow Queries</p>
              <div className="space-y-2">
                {qm.most_expensive_queries.slice(0, 5).map((q, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl text-xs"
                    style={{ background: T.light50, border: `1px solid ${T.ice}` }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold" style={{ color: T.dark }}>
                        {Math.round((q.elapsed_ms as number) / 1000)}s
                      </span>
                      <span style={{ color: '#64748B' }}>{q.warehouse as string} · {q.user as string}</span>
                    </div>
                    <p className="font-mono text-[10px] truncate" style={{ color: '#64748B' }}>
                      {(q.query_text as string).slice(0, 120)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── Storage ─────────────────────────────────────────────────────── */}
      {sm && sm.total_bytes > 0 && (
        <Section icon={HardDrive} title="Storage Usage" defaultOpen={false}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard icon={HardDrive} label="Total Storage" value={fmtBytes(sm.total_bytes)} accent />
            <MetricCard icon={Database} label="Table Storage" value={fmtBytes(sm.storage_bytes)} />
            <MetricCard icon={Layers} label="Stage Storage" value={fmtBytes(sm.stage_bytes)} />
            <MetricCard icon={Shield} label="Fail-Safe" value={fmtBytes(sm.failsafe_bytes)} />
          </div>
        </Section>
      )}

      {/* ── Cost / Credits ──────────────────────────────────────────────── */}
      {cm && cm.credits_used_last_30d > 0 && (
        <Section icon={DollarSign} title="Warehouse Credit Usage (Last 30 Days)" defaultOpen={false}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricCard icon={DollarSign} label="Total Credits" value={cm.credits_used_last_30d.toFixed(2)} accent />
            <MetricCard icon={Zap} label="Compute" value={cm.compute_credits.toFixed(2)} />
            <MetricCard icon={Globe} label="Cloud Services" value={cm.cloud_services_credits.toFixed(2)} />
          </div>
          {cm.top_warehouses_by_credit.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>Top Warehouses by Credit</p>
              <KVTable rows={cm.top_warehouses_by_credit.map((w) => [w.name, `${w.credits.toFixed(3)} credits`] as [string, string])} />
            </>
          )}
        </Section>
      )}
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
      const r = await api.get<SnowflakeJobStatusResponse>(`/api/v1/snowflake/jobs/${jobId}/status`)
      setJobStatus(r.data)
      if (r.data.status === 'completed' && !result) {
        const res = await api.get<SnowflakeAssessmentResult>(`/api/v1/snowflake/jobs/${jobId}/results`)
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
      const url = type === 'excel'
        ? `/api/v1/snowflake/jobs/${jobId}/report`
        : `/api/v1/snowflake/jobs/${jobId}/word-report`
      const r = await api.get(url, { responseType: 'blob' })
      const href = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = href
      a.download = type === 'excel'
        ? `snowflake_assessment_${jobId?.slice(0, 8)}.xlsx`
        : `snowflake_assessment_${jobId?.slice(0, 8)}.docx`
      a.click()
      URL.revokeObjectURL(href)
    } catch {
      // non-fatal
    } finally {
      setDownloading(null)
    }
  }

  const isRunning = jobStatus?.status === 'running' || jobStatus?.status === 'pending'

  return (
    <div className="min-h-screen" style={{ background: T.gradSurface }}>
      {/* Hero header */}
      <div className="relative overflow-hidden" style={{ background: T.gradHero }}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute rounded-full"
            style={{
              width: '500px', height: '500px', top: '-200px', right: '-80px',
              background: 'radial-gradient(circle, rgba(0,184,230,0.07) 0%, transparent 70%)',
            }}
          />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 py-8">
          <button
            onClick={() => navigate('/snowflake/sessions')}
            className="flex items-center gap-2 text-xs font-semibold mb-4 transition-colors duration-150"
            style={{ color: 'rgba(176,212,232,0.7)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.accent }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(176,212,232,0.7)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Snowflake Assessments
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(0,184,230,0.15)', border: '1px solid rgba(0,212,255,0.20)' }}
              >
                <Snowflake className="h-6 w-6" style={{ color: T.accent }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {jobStatus?.label || 'Snowflake Assessment'}
                </h1>
                <p className="text-sm mt-0.5" style={{ color: 'rgba(176,212,232,0.7)' }}>
                  Job {jobId?.slice(0, 8)}
                </p>
              </div>
            </div>

            {/* Status badge */}
            {jobStatus && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold shrink-0"
                style={{
                  background: jobStatus.status === 'completed' ? 'rgba(16,185,129,0.15)' : jobStatus.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(0,184,230,0.15)',
                  color: jobStatus.status === 'completed' ? '#6EE7B7' : jobStatus.status === 'failed' ? '#FCA5A5' : T.accent,
                  border: `1px solid ${jobStatus.status === 'completed' ? 'rgba(16,185,129,0.25)' : jobStatus.status === 'failed' ? 'rgba(239,68,68,0.25)' : 'rgba(0,212,255,0.20)'}`,
                }}
              >
                {jobStatus.status === 'completed' && <CheckCircle2 className="h-4 w-4" />}
                {jobStatus.status === 'failed' && <XCircle className="h-4 w-4" />}
                {isRunning && <Loader2 className="h-4 w-4 animate-spin" />}
                {jobStatus.status.charAt(0).toUpperCase() + jobStatus.status.slice(1)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Wave */}
      <div className="h-5 overflow-hidden" style={{ background: T.gradHero }}>
        <svg viewBox="0 0 1440 20" fill="none" preserveAspectRatio="none" style={{ width: '100%', height: '20px' }}>
          <path d="M0 0 Q360 20 720 10 Q1080 0 1440 18 L1440 20 L0 20Z" fill="#EBF4FF" />
        </svg>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        {pageError && (
          <div className="flex items-center gap-3 p-4 rounded-xl text-sm" style={{ background: 'rgba(254,242,242,0.9)', border: '1px solid #FECACA', color: '#DC2626' }}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {pageError}
          </div>
        )}

        {!result && (
          <AssessmentTerminal
            status={jobStatus?.status || 'pending'}
            progressMessage={jobStatus?.progress_message || undefined}
            error={jobStatus?.error || undefined}
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
