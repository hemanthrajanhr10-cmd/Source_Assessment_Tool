import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, FileSpreadsheet, Loader2,
  AlertTriangle, ChevronDown, ChevronUp,
  Cpu, Database, Layers, Activity, Shield,
  FlaskConical, BarChart3, Server, Users, Lock,
  HardDrive, GitBranch, Package, Zap, TrendingUp,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import { DatabricksLogo } from '../components/ui/SourceLogos'
import type {
  DatabricksAssessmentResult,
  DatabricksCluster,
  DatabricksJob,
  DatabricksCatalog,
  DatabricksUser,
  DatabricksCheckResult,
} from '../types/api'

import { theme, toneColors } from './databricks/theme'
import { Button } from './databricks/components/Button'
import { Section } from './databricks/components/Section'
import { MetricRow, type Metric } from './databricks/components/MetricRow'
import { TabBar, type TabDef } from './databricks/components/TabBar'
import { SessionStatusTag, CheckStatusTag, RiskTag, StatusTag } from './databricks/components/StatusTag'
import { Table, Thead, Tr, Td, EmptyRow, KV, InlineTable } from './databricks/components/Table'
import { DonutChart, Legend, HBar } from './databricks/components/Charts'
import { Reveal } from './databricks/components/Reveal'
import { CountUp } from './databricks/components/CountUp'
import { usePrefersReducedMotion } from './databricks/components/usePrefersReducedMotion'
import GlobalStyles from './databricks/components/GlobalStyles'

// ── 5 Fabric-parity tabs ──────────────────────────────────────────────────────
type TabKey = 'overview' | 'compute' | 'data-platform' | 'governance' | 'jobs-ml'

const TABS: TabDef<TabKey>[] = [
  { key: 'overview',      label: 'Overview',              Icon: BarChart3 },
  { key: 'compute',       label: 'Compute',                Icon: Cpu },
  { key: 'data-platform', label: 'Data Platform',          Icon: Layers },
  { key: 'governance',    label: 'Governance & Security',  Icon: Shield },
  { key: 'jobs-ml',       label: 'Jobs & AI',              Icon: FlaskConical },
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

// ── Filter pill (cluster filter, check-domain filter) ─────────────────────────
function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: theme.radius.sm, fontSize: 11, fontWeight: active ? 600 : 500,
      cursor: 'pointer', border: `1px solid ${active ? theme.color.accent : theme.color.border}`,
      color: active ? theme.color.accent : theme.color.inkMuted,
      background: active ? theme.color.accentFaint : theme.color.surface,
      transition: `all ${theme.motion.fast}ms ${theme.motion.easeCss}`,
    }}>
      {label}
    </button>
  )
}

// ── Health scorecard row ───────────────────────────────────────────────────────
function HealthRow({ tiles }: { tiles: { label: string; status: 'good' | 'warn' | 'crit'; detail: string }[] }) {
  const toneOf = (s: 'good' | 'warn' | 'crit') => s === 'good' ? 'success' as const : s === 'warn' ? 'warning' as const : 'danger' as const
  const textOf = (s: 'good' | 'warn' | 'crit') => s === 'good' ? 'OK' : s === 'warn' ? 'Warn' : 'Critical'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.md, overflow: 'hidden' }}>
      {tiles.map((t, i) => {
        const c = toneColors(toneOf(t.status))
        return (
          <div key={t.label} style={{ flex: '1 1 180px', minWidth: 180, padding: '12px 16px', borderLeft: i === 0 ? 'none' : `1px solid ${theme.color.divider}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.fg, flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: c.fg }}>{textOf(t.status)}</span>
            </div>
            <p style={{ fontSize: 12, fontWeight: 600, color: theme.color.ink, margin: '0 0 2px' }}>{t.label}</p>
            <p style={{ fontSize: 10.5, color: theme.color.inkMuted, margin: 0, lineHeight: 1.4 }}>{t.detail}</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Expandable cluster row ────────────────────────────────────────────────────
function ClusterRow({ c }: { c: DatabricksCluster }) {
  const [open, setOpen] = useState(false)
  const noAutoterm = (c.autotermination_minutes ?? 0) === 0 && c.cluster_source !== 'JOB'
  const isLegacy   = c.spark_version && /^[789]\./.test(c.spark_version)
  return (
    <>
      <Tr onClick={() => setOpen(o => !o)}>
        <Td emphasis mono>{c.cluster_name || c.cluster_id}<div style={{ fontSize: 10, color: theme.color.inkMuted, fontWeight: 400, marginTop: 1 }}>{c.cluster_source || ''}</div></Td>
        <Td>{c.state === 'RUNNING' ? <StatusTag tone="success" label="RUNNING" /> : <StatusTag tone="neutral" label={c.state || '—'} />}</Td>
        <Td mono>{c.spark_version ? trunc(c.spark_version, 30) : '—'}</Td>
        <Td align="center">{noAutoterm ? <StatusTag tone="danger" label="∞ RISK" /> : <span style={{ fontSize: 11, color: theme.color.inkSecondary }}>{c.autotermination_minutes}m</span>}</Td>
        <Td align="center">{c.runtime_engine === 'PHOTON' ? <StatusTag tone="info" label="PHOTON" /> : <span style={{ fontSize: 11, color: theme.color.inkMuted }}>Standard</span>}</Td>
        <Td align="center">{isLegacy ? <StatusTag tone="warning" label="LEGACY" /> : null}</Td>
        <Td width={20}>{open ? <ChevronUp style={{ width: 12, height: 12, color: theme.color.inkMuted }} /> : <ChevronDown style={{ width: 12, height: 12, color: theme.color.inkMuted }} />}</Td>
      </Tr>
      {open && (
        <tr style={{ background: theme.color.surfaceSunken, borderBottom: `1px solid ${theme.color.divider}` }}>
          <td colSpan={7} style={{ padding: '10px 18px 12px 24px' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 11, color: theme.color.inkSecondary }}>
              <span><strong>Cluster ID:</strong> <code style={{ fontFamily: theme.font.mono, fontSize: 10 }}>{c.cluster_id}</code></span>
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
function JobRow({ j }: { j: DatabricksJob }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tr onClick={() => setOpen(o => !o)}>
        <Td emphasis mono>{j.name || String(j.job_id)}<div style={{ fontSize: 10, color: theme.color.inkMuted, fontWeight: 400, marginTop: 1 }}>{j.creator_user_name || ''}</div></Td>
        <Td mono>{j.schedule || 'Manual / Triggered'}</Td>
        <Td align="center" emphasis>{j.task_count}</Td>
        <Td align="center">{j.uses_all_purpose_compute ? <StatusTag tone="warning" label="All-Purpose" /> : <span style={{ fontSize: 11, color: theme.color.success, fontWeight: 600 }}>Job Cluster</span>}</Td>
        <Td align="center">
          {j.last_run_status === 'FAILED'
            ? <StatusTag tone="danger" label="FAILED" />
            : j.last_run_status
              ? <span style={{ fontSize: 11, color: theme.color.success, fontWeight: 600 }}>{j.last_run_status}</span>
              : null}
        </Td>
        <Td width={20}>{open ? <ChevronUp style={{ width: 12, height: 12, color: theme.color.inkMuted }} /> : <ChevronDown style={{ width: 12, height: 12, color: theme.color.inkMuted }} />}</Td>
      </Tr>
      {open && (
        <tr style={{ background: theme.color.surfaceSunken, borderBottom: `1px solid ${theme.color.divider}` }}>
          <td colSpan={6} style={{ padding: '10px 18px 12px 24px' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 11, color: theme.color.inkSecondary }}>
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

// ── Expandable check row ──────────────────────────────────────────────────────
function CheckRow({ ch }: { ch: DatabricksCheckResult }) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!(ch.details || ch.recommendation)
  return (
    <>
      <Tr onClick={hasDetail ? () => setOpen(o => !o) : undefined}>
        <Td>{ch.domain}</Td>
        <Td emphasis>{ch.check}</Td>
        <Td><CheckStatusTag status={ch.status} /></Td>
        <Td><RiskTag risk={ch.risk} /></Td>
        <Td align="right" mono>{ch.count != null ? fmtN(ch.count) : null}</Td>
        <Td width={20}>{hasDetail && (open ? <ChevronUp style={{ width: 12, height: 12, color: theme.color.inkMuted }} /> : <ChevronDown style={{ width: 12, height: 12, color: theme.color.inkMuted }} />)}</Td>
      </Tr>
      {open && hasDetail && (
        <tr style={{ background: theme.color.surfaceSunken, borderBottom: `1px solid ${theme.color.divider}` }}>
          <td colSpan={6} style={{ padding: '10px 18px 12px 24px' }}>
            {ch.details && <p style={{ fontSize: 11, color: theme.color.inkSecondary, marginBottom: ch.recommendation ? 6 : 0 }}>{ch.details}</p>}
            {ch.recommendation && <p style={{ fontSize: 11, color: theme.color.accent, fontWeight: 600 }}>→ {ch.recommendation}</p>}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DatabricksSessionDetailPage() {
  const { jobId }  = useParams<{ jobId: string }>()
  const navigate   = useNavigate()
  const reducedMotion = usePrefersReducedMotion()
  const [tab, setTab]           = useState<TabKey>('overview')
  const [checkFilter, setCheckFilter] = useState<string>('all')
  const [clusterFilter, setClusterFilter] = useState<string>('all')
  const pollCount = useRef(0)

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

  const healthTiles = result ? [
    { label: 'Auto-Terminate',   status: ((cs?.clusters_without_autoterminate ?? 0) === 0 ? 'good' : (cs?.clusters_without_autoterminate ?? 0) <= 2 ? 'warn' : 'crit') as 'good' | 'warn' | 'crit', detail: `${fmtN(cs?.clusters_without_autoterminate)} cluster(s) missing` },
    { label: 'Unity Catalog',    status: (uc?.metastore_id ? 'good' : 'crit') as 'good' | 'crit', detail: uc?.metastore_id ? `${fmtN(uc.catalog_count)} catalogs · ${fmtN(uc.table_count)} tables` : 'No metastore attached' },
    { label: 'IP Access Lists',  status: ((sec?.ip_access_list_count ?? 0) > 0 ? 'good' : 'warn') as 'good' | 'warn', detail: (sec?.ip_access_list_count ?? 0) > 0 ? `${fmtN(sec?.ip_access_list_count)} list(s) active` : 'Workspace open to all IPs' },
    { label: 'Workspace Admins', status: ((sec?.workspace_admins ?? 0) <= 5 ? 'good' : (sec?.workspace_admins ?? 0) <= 10 ? 'warn' : 'crit') as 'good' | 'warn' | 'crit', detail: `${fmtN(sec?.workspace_admins)} admin(s) of ${fmtN(sec?.total_users)} users` },
    { label: 'SQL Warehouse Stop', status: ((ws?.warehouses_without_auto_stop ?? 0) === 0 ? 'good' : 'warn') as 'good' | 'warn', detail: `${fmtN(ws?.warehouses_without_auto_stop)} warehouse(s) missing auto-stop` },
    { label: 'DBFS Legacy Mounts', status: ((int?.dbfs_mount_count ?? 0) === 0 ? 'good' : 'warn') as 'good' | 'warn', detail: `${fmtN(int?.dbfs_mount_count)} /mnt mount(s) — migrate to UC` },
  ] : []

  const allChecks    = result?.checks ?? []
  const checkDomains = ['all', ...Array.from(new Set(allChecks.map(c => c.domain)))]
  const visChecks    = checkFilter === 'all' ? allChecks : allChecks.filter(c => c.domain === checkFilter)
  const failChecks   = allChecks.filter(c => c.status === 'fail' || c.status === 'warn')

  const allClusters = result?.clusters ?? []
  const visClusters = clusterFilter === 'all'      ? allClusters
    : clusterFilter === 'running'                  ? allClusters.filter(c => c.state === 'RUNNING')
    : clusterFilter === 'no-autoterm'              ? allClusters.filter(c => (c.autotermination_minutes ?? 0) === 0 && c.cluster_source !== 'JOB')
    : clusterFilter === 'photon'                   ? allClusters.filter(c => c.runtime_engine === 'PHOTON')
    : allClusters

  const scoreColor = result?.overall_score == null ? theme.color.inkMuted
    : result.overall_score >= 80 ? theme.color.success : result.overall_score >= 60 ? theme.color.warning : theme.color.danger

  return (
    <div className="db-scope" style={{ minHeight: '100vh', background: theme.color.canvas, fontFamily: theme.font.body }}>

      {/* ── Header ── */}
      <div style={{ background: theme.color.surface, borderBottom: `1px solid ${theme.color.border}` }}>
        <div style={{ maxWidth: 1340, margin: '0 auto', padding: '20px 32px' }}>
          <button onClick={() => navigate('/databricks/sessions')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14,
              fontSize: 12, color: theme.color.inkMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <ArrowLeft style={{ width: 13, height: 13 }} /> Back to assessments
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: theme.radius.md, flexShrink: 0, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: theme.color.surface, border: `1px solid ${theme.color.border}` }}>
                <DatabricksLogo size={32} />
              </div>
              <div>
                <h1 style={{ fontFamily: theme.font.display, fontSize: 19, fontWeight: 800, color: theme.color.ink, margin: 0, letterSpacing: '-0.01em' }}>
                  {status?.label || 'Databricks Assessment'}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                  {(status?.workspace_url || result?.workspace_url) && (
                    <span style={{ fontSize: 11, color: theme.color.inkMuted, fontFamily: theme.font.mono, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Server style={{ width: 10, height: 10 }} />
                      {(status?.workspace_url || result?.workspace_url)!.replace('https://', '')}
                    </span>
                  )}
                  {wi?.region && <span style={{ fontSize: 11, color: theme.color.inkMuted }}>{wi.region}</span>}
                  {result?.assessment_timestamp && (
                    <span style={{ fontSize: 10, color: theme.color.inkMuted }}>Assessed {fmtDate(result.assessment_timestamp)}</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {result && (
                <Button variant="primary" Icon={FileSpreadsheet} onClick={() => api.databricksDownloadExcel(jobId!, status?.label || undefined)}>
                  Export Excel
                </Button>
              )}
              {(jobStatus === 'completed' || jobStatus === 'failed') && <SessionStatusTag status={jobStatus} />}
              {(jobStatus === 'running' || jobStatus === 'pending') && <SessionStatusTag status={jobStatus === 'running' ? 'running' : 'pending'} />}
            </div>
          </div>

          {(jobStatus === 'running' || jobStatus === 'pending') && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: theme.color.inkMuted }}>{status?.progress_message || 'Initialising…'}</span>
                <span style={{ fontSize: 11, color: theme.color.accent, fontWeight: 700, fontFamily: theme.font.mono }}>{progress}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 4, background: theme.color.surfaceSunken, overflow: 'hidden' }}>
                <motion.div animate={{ scaleX: progress / 100 }} transition={{ duration: 0.5, ease: theme.motion.ease }}
                  className="db-shimmer"
                  style={{ height: '100%', borderRadius: 4, transformOrigin: 'left', background: theme.color.accentBright }} />
              </div>
            </div>
          )}
          {(loadErr || (jobStatus === 'failed' && status?.error)) && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: theme.radius.sm, fontSize: 12, background: theme.color.dangerBg, color: theme.color.danger }}>
              {loadErr || status?.error}
            </div>
          )}
        </div>
      </div>

      {!result && (jobStatus === 'pending' || jobStatus === 'running') && (
        <div style={{ maxWidth: 1340, margin: '60px auto', padding: '0 32px', textAlign: 'center' }}>
          <Loader2 style={{ width: 32, height: 32, color: theme.color.accentBright, animation: 'db-spin 1s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ color: theme.color.inkMuted, fontSize: 13 }}>{status?.progress_message || 'Assessment running…'}</p>
        </div>
      )}

      {result && (
        <div style={{ maxWidth: 1340, margin: '0 auto', padding: '24px 32px 56px' }}>

          {/* ── Score panel — the single hero block for this page ───────────── */}
          {result.overall_score != null && (
            <Reveal>
            <div style={{ marginBottom: 20, padding: '18px 24px', borderRadius: theme.radius.lg, background: theme.color.surface,
              border: `1px solid ${theme.color.border}`, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 76 }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.color.inkMuted, marginBottom: 4 }}>Overall Score</p>
                <p style={{ fontFamily: theme.font.mono, fontSize: 38, fontWeight: 700, lineHeight: 1, color: scoreColor }}>
                  <CountUp value={Math.round(result.overall_score)} duration={0.9} /><span style={{ fontSize: 18 }}>%</span>
                </p>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 11, color: theme.color.inkMuted }}>{fmtN(result.passed_checks)} / {fmtN(result.total_checks)} checks passed</span>
                  <span style={{ fontSize: 11 }}>
                    {(result.critical_findings ?? 0) > 0 && <span style={{ color: theme.color.danger, fontWeight: 700 }}>{result.critical_findings} critical  </span>}
                    {(result.high_findings ?? 0) > 0 && <span style={{ color: theme.color.warning, fontWeight: 600 }}>{result.high_findings} high</span>}
                    {(result.critical_findings ?? 0) === 0 && (result.high_findings ?? 0) === 0 && <span style={{ color: theme.color.success, fontWeight: 600 }}>No critical / high findings</span>}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 6, background: theme.color.surfaceSunken, overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${result.overall_score}%` }} transition={{ duration: 0.7, ease: theme.motion.ease }}
                    style={{ height: '100%', borderRadius: 6, background: scoreColor }} />
                </div>
              </div>
              <DonutChart size={80} label="checks" data={[
                { label: 'Pass', value: result.passed_checks ?? 0, color: theme.color.success },
                { label: 'Warn', value: result.warnings ?? 0,      color: theme.color.warning },
                { label: 'Fail', value: (result.critical_findings ?? 0) + (result.high_findings ?? 0), color: theme.color.danger },
              ]} />
              {result.duration_seconds != null && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 10, color: theme.color.inkMuted }}>Duration</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: theme.color.ink, fontFamily: theme.font.mono }}>{result.duration_seconds.toFixed(1)}s</p>
                </div>
              )}
            </div>
            </Reveal>
          )}

          {/* ── Health scorecard ─────────────────────────────────────────────── */}
          <Reveal delay={0.06} style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: theme.color.inkMuted, marginBottom: 8 }}>Health Scorecard</p>
            <HealthRow tiles={healthTiles} />
          </Reveal>

          {/* ── Tab bar ────────────────────────────────────────────────────── */}
          <Reveal delay={0.12} style={{ marginBottom: 22 }}>
            <TabBar tabs={TABS} active={tab} onChange={setTab} />
          </Reveal>

          {/* ════════════════════════════════════════════════════════════════
              TAB PANELS
          ════════════════════════════════════════════════════════════════ */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
              transition={{ duration: reducedMotion ? 0 : theme.motion.slow / 1000, ease: theme.motion.ease }}
            >

              {/* ══════════ TAB 1 — OVERVIEW ══════════ */}
              {tab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                  <MetricRow metrics={[
                    { Icon: Cpu,      label: 'Clusters',       value: fmtN(cs?.total_clusters),   sub: `${fmtN(cs?.running_clusters)} running` },
                    { Icon: Database, label: 'SQL Warehouses', value: fmtN(ws?.total_warehouses), sub: `${fmtN(ws?.serverless_warehouses)} serverless` },
                    { Icon: Layers,   label: 'UC Catalogs',    value: fmtN(uc?.catalog_count),    sub: uc ? `${fmtN(uc.table_count)} tables` : 'UC not enabled' },
                    { Icon: Activity, label: 'Jobs',           value: fmtN(js?.total_jobs),        sub: `${fmtN(js?.dlt_pipelines)} DLT pipelines` },
                    { Icon: Users,    label: 'Users',          value: fmtN(sec?.total_users),      sub: `${fmtN(sec?.admin_users)} admins` },
                  ]} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    {cs && (
                      <Section title="Cluster States" Icon={Cpu}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 18px' }}>
                          <DonutChart size={110} label="clusters" data={[
                            { label: 'Running',    value: cs.running_clusters,    color: theme.color.success },
                            { label: 'Terminated', value: cs.terminated_clusters, color: theme.color.inkFaint },
                            { label: 'Photon',     value: cs.photon_enabled_clusters, color: theme.color.info },
                          ]} />
                          <Legend data={[
                            { label: 'Running',    value: cs.running_clusters,    color: theme.color.success },
                            { label: 'Terminated', value: cs.terminated_clusters, color: theme.color.inkFaint },
                            { label: 'Photon',     value: cs.photon_enabled_clusters, color: theme.color.info },
                            { label: 'No Policy',  value: cs.total_clusters - cs.policy_compliant_clusters, color: theme.color.warning },
                          ]} />
                        </div>
                      </Section>
                    )}
                    {sec && (
                      <Section title="Identity Distribution" Icon={Users}>
                        <div style={{ padding: '16px 18px' }}>
                          <HBar labelW={100} data={[
                            { label: 'Total Users',    value: sec.total_users,             color: theme.color.accentBright },
                            { label: 'Active',         value: sec.active_users,            color: theme.color.success },
                            { label: 'Admins',         value: sec.admin_users,             color: sec.admin_users > 5 ? theme.color.danger : theme.color.warning },
                            { label: 'Svc Principals', value: sec.service_principal_count, color: theme.color.info },
                            { label: 'Groups',         value: sec.group_count,             color: theme.color.inkMuted },
                          ]} />
                        </div>
                      </Section>
                    )}
                    {ml && (
                      <Section title="ML & AI Assets" Icon={FlaskConical}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 18px' }}>
                          <DonutChart size={110} label="endpoints" data={[
                            { label: 'Ready',   value: ml.running_endpoints, color: theme.color.success },
                            { label: 'Stopped', value: ml.model_serving_endpoint_count - ml.running_endpoints, color: theme.color.inkFaint },
                          ]} />
                          <Legend data={[
                            { label: 'Experiments', value: ml.experiment_count,            color: theme.color.accentBright },
                            { label: 'Models',      value: ml.registered_model_count,      color: theme.color.info },
                            { label: 'Endpoints',   value: ml.model_serving_endpoint_count, color: theme.color.inkMuted },
                            { label: 'Vector Idx',  value: ml.vector_search_index_count,   color: theme.color.success },
                          ]} />
                        </div>
                      </Section>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {wi && (
                      <Section title="Workspace Information" Icon={Server}>
                        <KV rows={[
                          ['Workspace Name',  wi.workspace_name],
                          ['Deployment Name', wi.deployment_name],
                          ['Cloud Provider',  wi.cloud?.toUpperCase()],
                          ['Region',          wi.region],
                          ['Metastore ID',    wi.metastore_id],
                          ['Assessed',        fmtDate(result.assessment_timestamp)],
                        ]} />
                      </Section>
                    )}
                    {js && (
                      <Section title="Job Orchestration" Icon={Activity}>
                        <KV rows={[
                          ['Total Jobs',                js.total_jobs],
                          ['Scheduled Jobs',            js.scheduled_jobs],
                          ['Multi-Task Jobs',           js.multi_task_jobs],
                          ['Using All-Purpose Compute', js.jobs_using_all_purpose_compute],
                          ['Recent Failures',           js.jobs_with_failures_last_7d],
                          ['DLT / Lakeflow Pipelines',  js.dlt_pipelines],
                        ]} />
                      </Section>
                    )}
                  </div>

                  {failChecks.length > 0 && (
                    <Section title="Findings Requiring Attention" Icon={AlertTriangle} count={failChecks.length}>
                      <Table>
                        <Thead headers={['Domain', 'Check', 'Status', 'Risk', 'Recommendation']} />
                        <tbody>
                          {failChecks.map((ch, i) => (
                            <Tr key={i}>
                              <Td>{ch.domain}</Td>
                              <Td emphasis>{ch.check}</Td>
                              <Td><CheckStatusTag status={ch.status} /></Td>
                              <Td><RiskTag risk={ch.risk} /></Td>
                              <Td>{ch.recommendation ? trunc(ch.recommendation, 80) : null}</Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    </Section>
                  )}
                </div>
              )}

              {/* ══════════ TAB 2 — COMPUTE ══════════ */}
              {tab === 'compute' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {cs && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <Section title="Cluster State Distribution" Icon={Cpu}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 18px' }}>
                          <DonutChart size={120} label="clusters" data={[
                            { label: 'Running',    value: cs.running_clusters,    color: theme.color.success },
                            { label: 'Terminated', value: cs.terminated_clusters, color: theme.color.inkFaint },
                            { label: 'Other',      value: Math.max(0, cs.total_clusters - cs.running_clusters - cs.terminated_clusters), color: theme.color.inkMuted },
                          ]} />
                          <div style={{ flex: 1 }}>
                            <Legend data={[
                              { label: 'Running',           value: cs.running_clusters,              color: theme.color.success },
                              { label: 'Terminated',        value: cs.terminated_clusters,            color: theme.color.inkFaint },
                              { label: 'Photon-Enabled',    value: cs.photon_enabled_clusters,        color: theme.color.info },
                              { label: 'Policy-Compliant',  value: cs.policy_compliant_clusters,      color: theme.color.success },
                              { label: 'No Auto-Terminate', value: cs.clusters_without_autoterminate, color: theme.color.danger },
                              { label: 'Single-Node',       value: cs.single_node_clusters,           color: theme.color.warning },
                            ]} />
                          </div>
                        </div>
                      </Section>

                      <Section title="Cluster Type Breakdown" Icon={BarChart3}>
                        <div style={{ padding: '16px 18px' }}>
                          <HBar labelW={130} data={[
                            { label: 'All-Purpose',       value: cs.all_purpose_clusters,           color: theme.color.accentBright },
                            { label: 'Job Clusters',      value: cs.job_clusters,                   color: theme.color.info },
                            { label: 'Single-Node',       value: cs.single_node_clusters,           color: theme.color.warning },
                            { label: 'Photon-Enabled',    value: cs.photon_enabled_clusters,        color: theme.color.success },
                            { label: 'No Auto-Terminate', value: cs.clusters_without_autoterminate, color: theme.color.danger },
                            { label: 'Legacy Runtime',    value: cs.legacy_runtime_clusters,        color: theme.color.inkMuted },
                          ]} />
                        </div>
                      </Section>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <FilterPill active={clusterFilter === 'all'}         label={`All (${allClusters.length})`} onClick={() => setClusterFilter('all')} />
                    <FilterPill active={clusterFilter === 'running'}     label={`Running (${allClusters.filter(c => c.state === 'RUNNING').length})`} onClick={() => setClusterFilter('running')} />
                    <FilterPill active={clusterFilter === 'no-autoterm'} label={`No Auto-Terminate (${allClusters.filter(c => (c.autotermination_minutes ?? 0) === 0 && c.cluster_source !== 'JOB').length})`} onClick={() => setClusterFilter('no-autoterm')} />
                    <FilterPill active={clusterFilter === 'photon'}      label={`Photon (${allClusters.filter(c => c.runtime_engine === 'PHOTON').length})`} onClick={() => setClusterFilter('photon')} />
                  </div>

                  <Section title="Cluster Inventory" Icon={Cpu} count={visClusters.length}>
                    <Table>
                      <Thead headers={['Cluster / Source', 'State', 'Spark Version', 'Auto-Terminate', 'Engine', 'Legacy', '']} />
                      <tbody>
                        {visClusters.map((c: DatabricksCluster) => <ClusterRow key={c.cluster_id} c={c} />)}
                        {visClusters.length === 0 && <EmptyRow colSpan={7} label="No clusters match this filter" />}
                      </tbody>
                    </Table>
                  </Section>

                  {ws && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Section title="SQL Warehouse Distribution" Icon={Database}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 18px' }}>
                            <DonutChart size={120} label="warehouses" data={[
                              { label: 'Serverless', value: ws.serverless_warehouses, color: theme.color.success },
                              { label: 'Classic',    value: ws.classic_warehouses,    color: theme.color.warning },
                              { label: 'Other',      value: Math.max(0, ws.total_warehouses - ws.serverless_warehouses - ws.classic_warehouses), color: theme.color.info },
                            ]} />
                            <div style={{ flex: 1 }}>
                              <Legend data={[
                                { label: 'Serverless (recommended)', value: ws.serverless_warehouses,        color: theme.color.success },
                                { label: 'Classic',                  value: ws.classic_warehouses,           color: theme.color.warning },
                                { label: 'Running now',              value: ws.running_warehouses,           color: theme.color.success },
                                { label: 'No auto-stop',             value: ws.warehouses_without_auto_stop, color: theme.color.danger },
                              ]} />
                            </div>
                          </div>
                        </Section>
                        <Section title="Warehouse Summary" Icon={Database}>
                          <KV rows={[
                            ['Total Warehouses',  ws.total_warehouses],
                            ['Currently Running', ws.running_warehouses],
                            ['Serverless',        ws.serverless_warehouses],
                            ['Classic',           ws.classic_warehouses],
                            ['No Auto-Stop',      ws.warehouses_without_auto_stop],
                          ]} />
                        </Section>
                      </div>
                      <Section title="SQL Warehouse Inventory" Icon={Database} count={result.warehouses?.length}>
                        <InlineTable
                          cols={['Name', 'Type', 'Size', 'Min Clusters', 'Max Clusters', 'Auto-Stop (min)', 'State', 'Photon', 'Active Sessions', 'Creator']}
                          rows={(result.warehouses ?? []).map(w => [
                            w.name || w.id, w.warehouse_type, w.cluster_size,
                            w.min_num_clusters, w.max_num_clusters,
                            w.auto_stop_mins ?? '∞',
                            w.state,
                            w.enable_photon ? 'Yes' : 'No',
                            w.num_active_sessions,
                            w.creator_name,
                          ])}
                        />
                      </Section>
                    </>
                  )}
                </div>
              )}

              {/* ══════════ TAB 3 — DATA PLATFORM ══════════ */}
              {tab === 'data-platform' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {uc ? (
                    <>
                      <Section title="Unity Catalog — Metastore" Icon={Layers}>
                        <div style={{ padding: '16px 18px' }}>
                          <MetricRow metrics={[
                            { Icon: Layers,    label: 'Catalogs',            value: fmtN(uc.catalog_count) },
                            { Icon: Database,  label: 'Schemas (sampled)',   value: fmtN(uc.schema_count) },
                            { Icon: Package,   label: 'Tables (sampled)',    value: fmtN(uc.table_count) },
                            { Icon: HardDrive, label: 'External Locations', value: fmtN(uc.external_location_count) },
                            { Icon: Lock,      label: 'Storage Credentials', value: fmtN(uc.storage_credential_count) },
                            { Icon: HardDrive, label: 'Volumes',             value: fmtN(uc.volume_count) },
                            { Icon: Database,  label: 'Views (sampled)',     value: fmtN(uc.view_count) },
                            { Icon: GitBranch, label: 'Delta Sharing',       value: uc.delta_sharing_enabled ? 'Enabled' : 'Disabled', accent: uc.delta_sharing_enabled ? theme.color.success : undefined },
                          ] as Metric[]} />
                        </div>
                      </Section>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Section title="Metastore Details" Icon={Server}>
                          <KV rows={[
                            ['Metastore Name',     uc.metastore_name],
                            ['Metastore ID',       uc.metastore_id ? trunc(uc.metastore_id, 32) : null],
                            ['Storage Root',       uc.storage_root ? trunc(uc.storage_root, 48) : null],
                            ['Delta Sharing',      uc.delta_sharing_enabled ? 'Enabled' : 'Disabled'],
                            ['Sharing Recipients', uc.data_sharing_recipient_count],
                            ['Cloud',              wi?.cloud?.toUpperCase()],
                          ]} />
                        </Section>
                        <Section title="Data Asset Distribution" Icon={BarChart3}>
                          <div style={{ padding: '16px 18px' }}>
                            <HBar labelW={140} data={[
                              { label: 'Catalogs',         value: uc.catalog_count,           color: theme.color.accentBright },
                              { label: 'Schemas (sampled)', value: uc.schema_count,            color: theme.color.info },
                              { label: 'Tables (sampled)',  value: uc.table_count,             color: theme.color.success },
                              { label: 'Views (sampled)',   value: uc.view_count,              color: theme.color.inkMuted },
                              { label: 'Volumes',          value: uc.volume_count,            color: theme.color.warning },
                              { label: 'Ext. Locations',   value: uc.external_location_count, color: theme.color.inkSecondary },
                            ]} />
                          </div>
                        </Section>
                      </div>

                      {(result.catalogs ?? []).length > 0 && (
                        <Section title="Catalog Inventory" Icon={Layers} count={result.catalogs.length}>
                          <InlineTable
                            cols={['Catalog Name', 'Type', 'Owner', 'Schemas', 'Tables', 'Storage Location', 'Created']}
                            rows={(result.catalogs ?? []).map((c: DatabricksCatalog) => [
                              c.name, c.catalog_type, c.owner,
                              c.schema_count, c.table_count,
                              c.storage_location ? trunc(c.storage_location, 48) : null,
                              c.created_at ? fmtDate(c.created_at) : null,
                            ])}
                          />
                        </Section>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: 56, textAlign: 'center' }}>
                      <AlertTriangle style={{ width: 34, height: 34, color: theme.color.warning, margin: '0 auto 16px' }} />
                      <p style={{ fontSize: 15, fontWeight: 600, color: theme.color.ink, marginBottom: 6 }}>Unity Catalog not enabled</p>
                      <p style={{ fontSize: 13, color: theme.color.inkMuted, maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
                        No metastore is attached to this workspace. Adopting Unity Catalog provides centralised governance, column-level security, lineage tracking, and cross-workspace data sharing.
                      </p>
                    </div>
                  )}

                  {int && (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.color.inkMuted, marginTop: 4 }}>Storage & Integrations</p>
                      <MetricRow metrics={[
                        { Icon: HardDrive, label: 'External Locations', value: fmtN(int.external_location_count),  sub: 'UC-managed storage access' },
                        { Icon: Lock,      label: 'Storage Credentials', value: fmtN(int.storage_credential_count), sub: 'Cloud auth for UC ext. locations' },
                        { Icon: GitBranch, label: 'Git Credentials',     value: fmtN(int.git_credential_count),     sub: 'Source control integrations' },
                        { Icon: Lock,      label: 'Secret Scopes',       value: fmtN(int.secret_scope_count),       sub: 'Vault-backed or native secrets', accent: (int.secret_scope_count ?? 0) > 0 ? undefined : theme.color.warning },
                        { Icon: Shield,    label: 'Network Policies',    value: fmtN(int.network_policy_count),     sub: 'Egress / private connectivity' },
                        { Icon: HardDrive, label: 'DBFS /mnt Mounts',    value: fmtN(int.dbfs_mount_count),         sub: 'Legacy — migrate to UC ext. locations', accent: (int.dbfs_mount_count ?? 0) === 0 ? undefined : theme.color.warning },
                        { Icon: Activity,  label: 'Lakehouse Monitors',  value: fmtN(int.lakehouse_monitor_count),  sub: 'Data quality / drift monitoring' },
                        { Icon: GitBranch, label: 'Delta Sharing',       value: int.delta_sharing_enabled ? 'On' : 'Off', sub: 'Open sharing across orgs' },
                      ] as Metric[]} />

                      {(int.dbfs_mount_count ?? 0) > 0 && (
                        <div style={{ padding: '14px 18px', borderRadius: theme.radius.md, background: theme.color.warningBg, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <AlertTriangle style={{ width: 17, height: 17, color: theme.color.warning, flexShrink: 0, marginTop: 1 }} />
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 700, color: theme.color.warning, marginBottom: 4 }}>
                              {int.dbfs_mount_count} DBFS /mnt mount(s) detected — migration recommended
                            </p>
                            <p style={{ fontSize: 11, color: theme.color.inkSecondary, lineHeight: 1.5 }}>
                              Legacy DBFS mounts bypass Unity Catalog governance. For each mount, create a UC External Location backed by the same cloud storage credential. This unlocks column-level security, lineage tracking, and centralised audit logging.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ══════════ TAB 4 — GOVERNANCE & SECURITY ══════════ */}
              {tab === 'governance' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {sec && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Section title="Identity Overview" Icon={Users}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 18px' }}>
                            <DonutChart size={120} label="users" data={[
                              { label: 'Active',   value: sec.active_users,                   color: theme.color.success },
                              { label: 'Inactive', value: sec.total_users - sec.active_users,  color: theme.color.inkFaint },
                              { label: 'Admins',   value: sec.admin_users,                     color: sec.admin_users > 5 ? theme.color.danger : theme.color.warning },
                            ]} />
                            <div style={{ flex: 1 }}>
                              <Legend data={[
                                { label: 'Total Users',    value: sec.total_users,                     color: theme.color.accentBright },
                                { label: 'Active',         value: sec.active_users,                    color: theme.color.success },
                                { label: 'Inactive',       value: sec.total_users - sec.active_users,  color: theme.color.inkFaint },
                                { label: 'Admins',         value: sec.admin_users,                     color: sec.admin_users > 5 ? theme.color.danger : theme.color.warning },
                                { label: 'Svc Principals', value: sec.service_principal_count,         color: theme.color.info },
                                { label: 'Groups',         value: sec.group_count,                     color: theme.color.inkMuted },
                              ]} />
                            </div>
                          </div>
                        </Section>

                        <Section title="Security Controls" Icon={Shield}>
                          <div style={{ padding: '16px 18px' }}>
                            <MetricRow metrics={[
                              { label: 'IP Access Lists',      value: fmtN(sec.ip_access_list_count), accent: (sec.ip_access_list_count ?? 0) > 0 ? theme.color.success : theme.color.warning },
                              { label: 'Secret Scopes',        value: fmtN(sec.secrets_scope_count),  accent: theme.color.success },
                              { label: 'PAT Tokens Active',    value: fmtN(sec.pat_count),             accent: theme.color.success },
                              { label: 'Token Lifetime Limit', value: sec.token_lifetime_configured ? 'Yes' : 'No', accent: sec.token_lifetime_configured ? theme.color.success : theme.color.warning },
                              { label: 'Unity Catalog',        value: sec.unity_catalog_enabled ? 'Enabled' : 'Off', accent: sec.unity_catalog_enabled ? theme.color.success : theme.color.warning },
                              { label: 'Audit Log',            value: sec.audit_log_configured ? 'Yes' : 'Not detected', accent: sec.audit_log_configured ? theme.color.success : theme.color.warning },
                            ] as Metric[]} />
                          </div>
                        </Section>
                      </div>

                      <Section title="User Inventory" Icon={Users} count={result.users?.length}>
                        <InlineTable
                          cols={['Username', 'Display Name', 'Active', 'Is Admin']}
                          rows={(result.users ?? []).map((u: DatabricksUser) => [
                            u.user_name, u.display_name,
                            u.active ? 'Yes' : 'No',
                            u.is_admin ? 'Admin' : 'No',
                          ])}
                        />
                      </Section>
                    </>
                  )}

                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.color.inkMuted, marginBottom: 10 }}>All Assessment Checks</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      {checkDomains.map(d => (
                        <FilterPill
                          key={d}
                          active={checkFilter === d}
                          label={d === 'all' ? `All (${allChecks.length})` : `${d} (${allChecks.filter(c => c.domain === d).length})`}
                          onClick={() => setCheckFilter(d)}
                        />
                      ))}
                    </div>
                    <Section title="Checks" Icon={AlertTriangle} count={visChecks.length}>
                      <Table>
                        <Thead headers={['Domain', 'Check', 'Status', 'Risk', 'Count', '']} />
                        <tbody>
                          {visChecks.map((ch, i) => <CheckRow key={i} ch={ch} />)}
                          {visChecks.length === 0 && <EmptyRow colSpan={6} label="No checks for this domain" />}
                        </tbody>
                      </Table>
                    </Section>
                  </div>
                </div>
              )}

              {/* ══════════ TAB 5 — JOBS & AI ══════════ */}
              {tab === 'jobs-ml' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {js && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <Section title="Job Orchestration Distribution" Icon={Activity}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 18px' }}>
                          <DonutChart size={120} label="jobs" data={[
                            { label: 'Scheduled',        value: js.scheduled_jobs,                color: theme.color.success },
                            { label: 'Manual/Triggered', value: js.total_jobs - js.scheduled_jobs, color: theme.color.inkFaint },
                            { label: 'DLT Pipelines',    value: js.dlt_pipelines,                 color: theme.color.accentBright },
                          ]} />
                          <div style={{ flex: 1 }}>
                            <Legend data={[
                              { label: 'Total Jobs',          value: js.total_jobs,                     color: theme.color.accentBright },
                              { label: 'Scheduled',           value: js.scheduled_jobs,                 color: theme.color.success },
                              { label: 'Multi-Task',          value: js.multi_task_jobs,                color: theme.color.info },
                              { label: 'All-Purpose Compute', value: js.jobs_using_all_purpose_compute, color: theme.color.warning },
                              { label: 'Recent Failures',     value: js.jobs_with_failures_last_7d,     color: theme.color.danger },
                              { label: 'DLT / Lakeflow',      value: js.dlt_pipelines,                  color: theme.color.inkMuted },
                            ]} />
                          </div>
                        </div>
                      </Section>

                      <Section title="Job Risk Analysis" Icon={AlertTriangle}>
                        <div style={{ padding: '16px 18px' }}>
                          <HBar labelW={150} data={[
                            { label: 'Using All-Purpose Compute', value: js.jobs_using_all_purpose_compute, color: theme.color.warning },
                            { label: 'Recent Failures',           value: js.jobs_with_failures_last_7d,     color: theme.color.danger },
                            { label: 'Multi-Task (complex)',      value: js.multi_task_jobs,                color: theme.color.info },
                            { label: 'DLT Pipelines',             value: js.dlt_pipelines,                  color: theme.color.accentBright },
                          ]} />
                          {js.jobs_using_all_purpose_compute > 0 && (
                            <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: theme.radius.sm, background: theme.color.warningBg }}>
                              <p style={{ fontSize: 11, color: theme.color.warning, fontWeight: 700 }}>
                                {js.jobs_using_all_purpose_compute} job(s) use all-purpose compute
                              </p>
                              <p style={{ fontSize: 10, color: theme.color.inkSecondary, marginTop: 3 }}>
                                Switch to dedicated job clusters to reduce cost and eliminate shared-resource contention.
                              </p>
                            </div>
                          )}
                        </div>
                      </Section>
                    </div>
                  )}

                  <Section title="Lakeflow Job Inventory" Icon={Activity} count={result.jobs?.length}>
                    <Table>
                      <Thead headers={['Job / Creator', 'Schedule', 'Tasks', 'Compute', 'Last Run', '']} />
                      <tbody>
                        {(result.jobs ?? []).map((j: DatabricksJob) => <JobRow key={j.job_id} j={j} />)}
                        {(result.jobs ?? []).length === 0 && <EmptyRow colSpan={6} label="No jobs found" />}
                      </tbody>
                    </Table>
                  </Section>

                  {ml && (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.color.inkMuted, marginTop: 4 }}>MLflow & AI Platform</p>

                      <MetricRow metrics={[
                        { Icon: FlaskConical, label: 'MLflow Experiments',    value: fmtN(ml.experiment_count) },
                        { Icon: Package,      label: 'Registered Models',     value: fmtN(ml.registered_model_count) },
                        { Icon: Zap,          label: 'Serving Endpoints',     value: fmtN(ml.model_serving_endpoint_count), sub: `${fmtN(ml.running_endpoints)} ready` },
                        { Icon: Database,     label: 'Vector Search Indexes', value: fmtN(ml.vector_search_index_count), accent: theme.color.info },
                        { Icon: Activity,     label: 'DLT Pipelines',         value: fmtN(ml.dlt_pipeline_count) },
                        { Icon: TrendingUp,   label: 'Running Endpoints',     value: fmtN(ml.running_endpoints), accent: ml.running_endpoints > 0 ? theme.color.success : undefined },
                      ]} />

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Section title="Model Serving Endpoints" Icon={Zap}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 18px' }}>
                            <DonutChart size={120} label="endpoints" data={[
                              { label: 'Ready',   value: ml.running_endpoints, color: theme.color.success },
                              { label: 'Stopped', value: ml.model_serving_endpoint_count - ml.running_endpoints, color: theme.color.inkFaint },
                            ]} />
                            <div style={{ flex: 1 }}>
                              <Legend data={[
                                { label: 'Ready',     value: ml.running_endpoints,                                   color: theme.color.success },
                                { label: 'Not Ready', value: ml.model_serving_endpoint_count - ml.running_endpoints, color: theme.color.inkFaint },
                                { label: 'Total',     value: ml.model_serving_endpoint_count,                        color: theme.color.accentBright },
                              ]} />
                              <p style={{ marginTop: 12, padding: '8px 12px', borderRadius: theme.radius.sm, background: theme.color.surfaceSunken, fontSize: 11, color: theme.color.inkSecondary }}>
                                {ml.running_endpoints === 0 ? 'No serving endpoints currently deployed' : `${ml.running_endpoints} endpoint(s) serving live inference`}
                              </p>
                            </div>
                          </div>
                        </Section>

                        <Section title="ML Asset Distribution" Icon={TrendingUp}>
                          <div style={{ padding: '16px 18px' }}>
                            <HBar labelW={140} data={[
                              { label: 'Experiments',       value: ml.experiment_count,             color: theme.color.accentBright },
                              { label: 'Registered Models', value: ml.registered_model_count,       color: theme.color.info },
                              { label: 'Serving Endpoints', value: ml.model_serving_endpoint_count, color: theme.color.inkMuted },
                              { label: 'Vector Indexes',    value: ml.vector_search_index_count,    color: theme.color.success },
                              { label: 'DLT Pipelines',     value: ml.dlt_pipeline_count,            color: theme.color.warning },
                            ]} />
                          </div>
                        </Section>
                      </div>
                    </>
                  )}
                </div>
              )}

            </motion.div>
          </AnimatePresence>

          {/* Footer */}
          <div style={{ fontSize: 11, color: theme.color.inkMuted, display: 'flex', gap: 20, paddingTop: 14, marginTop: 10, borderTop: `1px solid ${theme.color.divider}` }}>
            {status?.created_at   && <span>Started: {fmtDate(status.created_at)}</span>}
            {status?.completed_at && <span>Completed: {fmtDate(status.completed_at)}</span>}
            {result.duration_seconds != null && <span>Duration: {result.duration_seconds.toFixed(1)}s</span>}
          </div>
        </div>
      )}

      <GlobalStyles />
    </div>
  )
}
