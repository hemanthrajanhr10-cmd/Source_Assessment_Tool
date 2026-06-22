// Unified Assessment — users choose which sources to include (SQL Server / Fabric / both),
// configure each, and run them together in one session.
// Do NOT add separate source-only or fabric-only entry points here.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, CheckCircle2, AlertCircle,
  ArrowRight, Server, Plus, Trash2, Eye, EyeOff,
  Wifi, WifiOff, RefreshCw, Search, ExternalLink, Copy,
  Loader2, Tag, Building2, FileText, ChevronDown, ChevronRight,
  Share2, Network, Info, ShieldCheck, Zap,
  Layers3, X, Settings2,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type {
  AccessLevel,
  DatabaseInfo,
  DbType,
  FabricWorkspaceInfo,
  FabricWorkspaceItems,
  HybridConnection,
} from '../types/api'
import { ACCESS_LEVEL_OPTIONS } from '../types/api'
import { UnifiedLogo } from '../components/ui/SourceLogos'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'source-selection'   // NEW: pick which sources to include
  | 'source-form'
  | 'source-submitting'
  | 'fabric-auth'
  | 'fabric-picking'
  | 'fabric-picking-items'
  | 'fabric-naming'
  | 'fabric-submitting'
  | 'done'

type SourceSelection = 'source_only' | 'fabric_only' | 'both'

interface SelectedDb {
  name: string
  include_null_analysis: boolean
  null_analysis_sample_limit: number
}

interface ServerEntry {
  id: string
  db_type: DbType
  server: string
  port: number
  username: string
  password: string
  show_password: boolean
  trust_server_certificate: boolean
  encrypt: boolean
  access_level: AccessLevel
  gateway_key: string | null
  gcp_sa_key: string
  show_gcp_sa_key: boolean
  gcp_private_ip: boolean
  azure_managed_identity: boolean
  connectivity: null | { reachable: boolean; latency_ms: number | null }
  connectivity_loading: boolean
  available_dbs: DatabaseInfo[] | null
  dbs_loading: boolean
  dbs_error: string | null
  selected_dbs: SelectedDb[]
  expanded: boolean
}

const DB_TYPE_OPTIONS: { value: DbType; label: string; defaultPort: number }[] = [
  { value: 'mssql',    label: 'SQL Server',  defaultPort: 1433 },
  { value: 'postgres', label: 'PostgreSQL',  defaultPort: 5432 },
  { value: 'mysql',    label: 'MySQL',       defaultPort: 3306 },
  { value: 'oracle',   label: 'Oracle',      defaultPort: 1521 },
]

function makeServer(): ServerEntry {
  return {
    id: crypto.randomUUID(),
    db_type: 'mssql', server: '', port: 1433,
    username: '', password: '', show_password: false,
    trust_server_certificate: true, encrypt: true,
    access_level: 'db_datareader',
    gateway_key: null,
    gcp_sa_key: '', show_gcp_sa_key: false,
    gcp_private_ip: false, azure_managed_identity: false,
    connectivity: null, connectivity_loading: false,
    available_dbs: null, dbs_loading: false, dbs_error: null,
    selected_dbs: [], expanded: true,
  }
}

// ── PostgreSQL platform detection ─────────────────────────────────────────────

type PgPlatformKey = 'azure' | 'gcp_cloudsql_name' | 'aws' | 'local' | 'other'

function detectPgPlatform(server: string): { key: PgPlatformKey; label: string } {
  const s = server.trim().toLowerCase()
  const parts = server.trim().split(':')
  if (parts.length === 3 && parts.every(p => p.trim()))
    return { key: 'gcp_cloudsql_name', label: 'GCP Cloud SQL' }
  if (s.endsWith('.postgres.database.azure.com') || s.endsWith('.database.windows.net'))
    return { key: 'azure', label: 'Azure PostgreSQL' }
  if (s.includes('.rds.amazonaws.com'))
    return { key: 'aws', label: 'AWS RDS / Aurora' }
  if (s === 'localhost' || s.startsWith('127.') || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(s))
    return { key: 'local', label: 'Local / On-premises' }
  return { key: 'other', label: 'PostgreSQL' }
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const cardCls = 'rounded-xl border bg-white overflow-hidden transition-all duration-200'
const activeBorderCls = 'border-[rgba(77,168,160,0.45)]'
const doneBorderCls = 'border-slate-200'
const pendingBorderCls = 'border-slate-200 opacity-50 pointer-events-none select-none'

const inputCls = [
  'w-full text-sm border border-slate-200 rounded-lg px-3 py-2',
  'bg-slate-50 text-slate-900 placeholder-[#71717a]',
  'focus:outline-none focus:border-[rgba(77,168,160,0.6)] focus:ring-1 focus:ring-[rgba(77,168,160,0.15)]',
  'transition-colors',
].join(' ')

const selectCls = [
  'text-sm border border-slate-200 rounded-lg px-2 py-2',
  'bg-slate-50 text-slate-900',
  'focus:outline-none focus:border-[rgba(77,168,160,0.6)] focus:ring-1 focus:ring-[rgba(77,168,160,0.15)]',
].join(' ')

// ── Step header ───────────────────────────────────────────────────────────────

function StepHeader({
  number, title, done, active, count,
}: { number: number; title: string; done: boolean; active: boolean; count?: string }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-4 border-b ${
      done ? 'border-slate-200 bg-white' : active ? 'border-[rgba(77,168,160,0.10)] bg-earth-50' : 'border-slate-200 bg-white'
    }`}>
      <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0 ${
        done
          ? 'bg-[rgba(52,211,153,0.15)] text-[#34d399]'
          : active
          ? 'bg-[rgba(77,168,160,0.10)] text-earth-600'
          : 'bg-slate-50 text-slate-500'
      }`}>
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : number}
      </span>
      <h2 className={`text-sm font-semibold flex-1 ${
        done ? 'text-slate-400' : active ? 'text-slate-900' : 'text-slate-500'
      }`}>
        {title}
      </h2>
      {count && (
        <span className="text-xs font-medium text-earth-600">{count}</span>
      )}
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void
  label: string; description?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent
          transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(77,168,160,0.30)]
          ${checked ? 'bg-[#4DA8A0]' : 'bg-slate-200'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full shadow-sm transform transition-transform
          ${checked ? 'translate-x-4 bg-earth-50' : 'translate-x-0 bg-slate-300'}`} />
      </button>
      <div>
        <span className="text-sm font-medium text-slate-900">{label}</span>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UnifiedAssessmentPage() {
  const navigate = useNavigate()

  const [phase, setPhase]                 = useState<Phase>('source-selection')
  const [sourceSelection, setSourceSelection] = useState<SourceSelection>('both')
  const [unifiedSessionId, setUnifiedSessionId] = useState<string>('')
  const [sessionLabel, setSessionLabel]   = useState('')
  const [error, setError]                 = useState<string | null>(null)

  const includeSource = sourceSelection === 'source_only' || sourceSelection === 'both'
  const includeFabric = sourceSelection === 'fabric_only' || sourceSelection === 'both'

  // Source form state
  const [servers, setServers]             = useState<ServerEntry[]>([makeServer()])
  const [sourceSubmitting, setSourceSubmitting] = useState(false)

  // Fabric auth state
  const [authId, setAuthId]               = useState('')
  const [userCode, setUserCode]           = useState('')
  const [verificationUrl, setVerificationUrl] = useState('')
  const [fabricLabel, setFabricLabel]     = useState('')
  const [copied, setCopied]               = useState(false)
  const pollRef                           = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fabric workspace state
  const [workspaces, setWorkspaces]               = useState<FabricWorkspaceInfo[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [selectedWsIds, setSelectedWsIds]         = useState<Set<string>>(new Set())
  const [wsFilter, setWsFilter]                   = useState('')
  const [workspaceItems, setWorkspaceItems]             = useState<FabricWorkspaceItems[]>([])
  const [itemsLoading, setItemsLoading]                 = useState(false)
  const [selectedDatasetIds, setSelectedDatasetIds]     = useState<Set<string>>(new Set())
  const [selectedReportIds, setSelectedReportIds]       = useState<Set<string>>(new Set())
  const [itemFilter, setItemFilter]                     = useState('')
  const [expandedWorkspaces, setExpandedWorkspaces]     = useState<Set<string>>(new Set())

  // ── Server form helpers ─────────────────────────────────────────────────────

  const updateServer = useCallback((id: string, patch: Partial<ServerEntry>) => {
    setServers(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }, [])

  const testConnectivity = useCallback(async (srv: ServerEntry) => {
    updateServer(srv.id, { connectivity_loading: true })
    try {
      const { data } = await api.detectConnectivity([{ server: srv.server, port: srv.port }])
      updateServer(srv.id, { connectivity: data[0], connectivity_loading: false })
    } catch {
      updateServer(srv.id, { connectivity_loading: false })
    }
  }, [updateServer])

  const loadDatabases = useCallback(async (srv: ServerEntry) => {
    updateServer(srv.id, { dbs_loading: true, dbs_error: null })
    try {
      const defaultDb = srv.db_type === 'postgres' ? 'postgres'
        : srv.db_type === 'mysql' ? 'information_schema'
        : 'master'
      const { data } = await api.listDatabases({
        db_type: srv.db_type,
        server: srv.server,
        port: srv.port,
        database: defaultDb,
        username: srv.username,
        password: srv.password,
        trust_server_certificate: srv.trust_server_certificate,
        encrypt: srv.encrypt,
        gcp_sa_key: srv.gcp_sa_key || undefined,
        gcp_private_ip: srv.gcp_private_ip || undefined,
        azure_managed_identity: srv.azure_managed_identity || undefined,
      })
      const auto: SelectedDb[] = data.map(d => ({
        name: d.name,
        include_null_analysis: true,
        null_analysis_sample_limit: 30,
      }))
      updateServer(srv.id, { available_dbs: data, dbs_loading: false, selected_dbs: auto })
    } catch (err) {
      updateServer(srv.id, { dbs_loading: false, dbs_error: getApiErrorMessage(err) })
    }
  }, [updateServer])

  const handleSourceSubmit = useCallback(async () => {
    const totalDbs = servers.reduce((acc, s) => acc + s.selected_dbs.length, 0)
    if (totalDbs === 0) {
      setError('Select at least one database across your servers.')
      return
    }
    setSourceSubmitting(true)
    setError(null)
    try {
      const mode = sourceSelection
      let sessionId = unifiedSessionId
      if (!sessionId) {
        const { data: us } = await api.createUnifiedSession({ mode: mode === 'both' ? 'both' : 'source', label: sessionLabel || undefined })
        sessionId = us.unified_session_id
        setUnifiedSessionId(sessionId)
      }
      await api.createSession({
        label: sessionLabel || undefined,
        unified_session_id: sessionId,
        servers: servers.map(s => ({
          db_type: s.db_type,
          server: s.server,
          port: s.port,
          username: s.username,
          password: s.password,
          trust_server_certificate: s.trust_server_certificate,
          encrypt: s.encrypt,
          access_level: s.access_level,
          use_gateway: !!s.gateway_key,
          gateway_key: s.gateway_key ?? undefined,
          gcp_sa_key: s.gcp_sa_key || undefined,
          gcp_private_ip: s.gcp_private_ip || undefined,
          azure_managed_identity: s.azure_managed_identity || undefined,
          databases: s.selected_dbs,
        })),
      })
      if (includeFabric) {
        setPhase('fabric-auth')
      } else {
        navigate(`/unified/sessions/${sessionId}`)
      }
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSourceSubmitting(false)
    }
  }, [servers, sessionLabel, unifiedSessionId, sourceSelection, includeFabric, navigate])

  // ── Fabric auth helpers ─────────────────────────────────────────────────────

  const startFabricAuth = useCallback(async () => {
    setError(null)
    try {
      const { data } = await api.fabricAuthStart()
      setAuthId(data.auth_id)
      setUserCode(data.user_code)
      setVerificationUrl(data.verification_url)
      setPhase('fabric-auth')
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    if (phase === 'fabric-auth' && authId) {
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.fabricAuthStatus(authId)
          if (data.status === 'ready') {
            clearInterval(pollRef.current!)
            setWorkspacesLoading(true)
            setPhase('fabric-picking')
            const { data: ws } = await api.fabricListWorkspaces(authId)
            setWorkspaces(ws)
            setWorkspacesLoading(false)
          } else if (data.status === 'error') {
            clearInterval(pollRef.current!)
            setError(data.error || 'Authentication failed')
          }
        } catch { /* ignore transient */ }
      }, 3000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [phase, authId])

  useEffect(() => {
    if (phase === 'fabric-auth' && !authId) {
      startFabricAuth()
    }
  }, [phase, authId, startFabricAuth])

  const handleFetchItems = useCallback(async () => {
    setItemsLoading(true)
    setPhase('fabric-picking-items')
    setItemFilter('')
    try {
      const { data } = await api.fabricListWorkspaceItems(authId, Array.from(selectedWsIds))
      setWorkspaceItems(data)
      const allDs  = new Set(data.flatMap(w => w.datasets.map(d => d.id)))
      const allRpt = new Set(data.flatMap(w => w.reports.map(r => r.id)))
      setSelectedDatasetIds(allDs)
      setSelectedReportIds(allRpt)
      setExpandedWorkspaces(new Set(data.map(w => w.workspace_id)))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setItemsLoading(false)
    }
  }, [authId, selectedWsIds])

  const handleFabricSubmit = useCallback(async () => {
    setPhase('fabric-submitting')
    setError(null)
    try {
      let sessionId = unifiedSessionId
      if (!sessionId) {
        const { data: us } = await api.createUnifiedSession({ mode: 'fabric', label: sessionLabel || undefined })
        sessionId = us.unified_session_id
        setUnifiedSessionId(sessionId)
      }
      await api.createFabricSession({
        auth_id: authId,
        label: fabricLabel || sessionLabel || undefined,
        workspace_ids: Array.from(selectedWsIds),
        dataset_ids: Array.from(selectedDatasetIds),
        report_ids: Array.from(selectedReportIds),
        unified_session_id: sessionId,
      })
      navigate(`/unified/sessions/${sessionId}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
      setPhase('fabric-naming')
    }
  }, [authId, fabricLabel, sessionLabel, selectedWsIds, selectedDatasetIds, selectedReportIds, unifiedSessionId, navigate])

  // ── Derived state for step visibility ──────────────────────────────────────

  const selectionDone = phase !== 'source-selection'
  const sourceDone    = ['fabric-auth', 'fabric-picking', 'fabric-picking-items', 'fabric-naming', 'fabric-submitting', 'done'].includes(phase)
  const fabricAuthDone = ['fabric-picking', 'fabric-picking-items', 'fabric-naming', 'fabric-submitting', 'done'].includes(phase)
  const wsDone        = ['fabric-picking-items', 'fabric-naming', 'fabric-submitting', 'done'].includes(phase)
  const itemsDone     = ['fabric-naming', 'fabric-submitting', 'done'].includes(phase)

  const sourceStepNum  = includeSource ? 2 : null
  const fabricStepBase = includeSource ? 2 : 1

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: '#F0FAF9', border: '1px solid #A8E2DD', boxShadow: '0 2px 8px rgba(77,168,160,0.10)' }}>
            <UnifiedLogo size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            New Unified Assessment
          </h1>
        </div>
        <p className="text-sm text-slate-500 ml-12">
          Choose your sources, configure connections, and run a single session that covers everything.
        </p>
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-5 flex items-start gap-3 p-4 rounded-xl bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.25)] text-[#f87171] text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-[#f87171]/60 hover:text-[#f87171] transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="space-y-4">

        {/* ── Step 1: Source Selection ──────────────────────────────────────── */}
        <div className={`${cardCls} ${!selectionDone ? activeBorderCls : doneBorderCls}`}>
          <StepHeader
            number={1}
            title="Select sources to assess"
            done={selectionDone}
            active={!selectionDone}
          />
          <div className="p-5 space-y-5">
            {/* Session label */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Session Label <span className="text-slate-500 font-normal normal-case">(optional)</span>
              </label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  value={sessionLabel}
                  onChange={e => setSessionLabel(e.target.value)}
                  placeholder="e.g. Q2 2026 Full Assessment"
                  disabled={selectionDone}
                  className={`${inputCls} pl-9 disabled:opacity-40`}
                />
              </div>
            </div>

            {/* Source toggles */}
            {selectionDone ? (
              <div className="flex items-center gap-2 text-sm text-[#34d399]">
                <CheckCircle2 className="h-4 w-4" />
                {sourceSelection === 'both' ? 'Source DB + Microsoft Fabric'
                  : sourceSelection === 'source_only' ? 'Source DB only'
                  : 'Microsoft Fabric only'}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: 'source_only' as SourceSelection, label: 'Source DB Only', icon: Database, desc: 'SQL Server, PostgreSQL, MySQL, Oracle' },
                    { value: 'fabric_only' as SourceSelection, label: 'Fabric Only', icon: Zap, desc: 'Workspaces, semantic models, reports' },
                    { value: 'both' as SourceSelection, label: 'Full Assessment', icon: Layers3, desc: 'Source DB + Microsoft Fabric together' },
                  ] as const).map(opt => {
                    const Icon = opt.icon
                    const selected = sourceSelection === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSourceSelection(opt.value)}
                        className={`flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all duration-150 ${
                          selected
                            ? 'border-[rgba(77,168,160,0.40)] bg-[rgba(77,168,160,0.06)]'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                          selected ? 'bg-[rgba(77,168,160,0.15)]' : 'bg-slate-200'
                        }`}>
                          <Icon className={`h-4 w-4 ${selected ? 'text-earth-600' : 'text-slate-500'}`} />
                        </div>
                        <div>
                          <p className={`text-xs font-semibold ${selected ? 'text-slate-900' : 'text-slate-400'}`}>{opt.label}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</p>
                        </div>
                        {selected && (
                          <div className="w-full flex justify-end">
                            <CheckCircle2 className="h-3.5 w-3.5 text-earth-600" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setPhase('source-form')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                             bg-[#4DA8A0] text-white hover:bg-[#6CBDB5] transition-colors
                             focus:outline-none focus:ring-2 focus:ring-[rgba(77,168,160,0.30)]"
                  style={{ boxShadow: '0 0 20px rgba(77,168,160,0.10)' }}
                >
                  <Settings2 className="h-4 w-4" />
                  Configure {sourceSelection === 'both' ? 'Source + Fabric' : sourceSelection === 'source_only' ? 'Source DB' : 'Fabric'}
                  <ArrowRight className="h-4 w-4 ml-auto" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Step 2: Source DB Configuration (conditional) ─────────────────── */}
        {includeSource && phase !== 'source-selection' && (
          <div className={`${cardCls} ${
            !sourceDone && phase === 'source-form' ? activeBorderCls
            : sourceDone ? doneBorderCls
            : pendingBorderCls
          }`}>
            <StepHeader
              number={sourceStepNum!}
              title="Configure source databases"
              done={sourceDone}
              active={phase === 'source-form'}
              count={sourceDone ? `${servers.reduce((a,s)=>a+s.selected_dbs.length,0)} DB${servers.reduce((a,s)=>a+s.selected_dbs.length,0)!==1?'s':''}` : undefined}
            />
            <div className="p-5">
              {sourceDone ? (
                <div className="flex items-center gap-2 text-sm text-[#34d399]">
                  <CheckCircle2 className="h-4 w-4" />
                  {servers.length} server{servers.length!==1?'s':''} · {servers.reduce((a,s)=>a+s.selected_dbs.length,0)} database{servers.reduce((a,s)=>a+s.selected_dbs.length,0)!==1?'s':''} queued
                </div>
              ) : (
                <SourceConfigForm
                  servers={servers}
                  setServers={setServers}
                  updateServer={updateServer}
                  testConnectivity={testConnectivity}
                  loadDatabases={loadDatabases}
                  onSubmit={handleSourceSubmit}
                  submitting={sourceSubmitting}
                  includeFabric={includeFabric}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Fabric-only: jump to auth ──────────────────────────────────────── */}
        {!includeSource && phase === 'source-form' && (() => {
          // Skip source form, go straight to fabric
          setTimeout(() => setPhase('fabric-auth'), 0)
          return null
        })()}

        {/* ── Step: Fabric Sign-in ──────────────────────────────────────────── */}
        {includeFabric && (phase === 'fabric-auth' || fabricAuthDone) && (
          <div className={`${cardCls} ${
            phase === 'fabric-auth' ? activeBorderCls
            : fabricAuthDone ? doneBorderCls
            : pendingBorderCls
          }`}>
            <StepHeader
              number={fabricStepBase + (includeSource ? 1 : 0)}
              title="Sign in with Microsoft"
              done={fabricAuthDone}
              active={phase === 'fabric-auth'}
            />
            <div className="p-5">
              {fabricAuthDone ? (
                <div className="flex items-center gap-2 text-sm text-[#34d399]">
                  <CheckCircle2 className="h-4 w-4" />
                  Authenticated with Microsoft
                </div>
              ) : (
                <FabricAuthPanel
                  userCode={userCode}
                  verificationUrl={verificationUrl}
                  copied={copied}
                  setCopied={setCopied}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Step: Select Workspaces ───────────────────────────────────────── */}
        {includeFabric && (phase === 'fabric-picking' || wsDone) && (
          <div className={`${cardCls} ${
            phase === 'fabric-picking' ? activeBorderCls
            : wsDone ? doneBorderCls
            : pendingBorderCls
          }`}>
            <StepHeader
              number={fabricStepBase + (includeSource ? 2 : 1)}
              title="Select workspaces"
              done={wsDone}
              active={phase === 'fabric-picking'}
              count={wsDone ? `${selectedWsIds.size} workspace${selectedWsIds.size!==1?'s':''}` : undefined}
            />
            <div className="p-5">
              {wsDone ? (
                <div className="flex items-center gap-2 text-sm text-[#34d399]">
                  <CheckCircle2 className="h-4 w-4" />
                  {selectedWsIds.size} workspace{selectedWsIds.size!==1?'s':''} selected
                </div>
              ) : (
                <FabricWorkspacePicker
                  workspaces={workspaces}
                  loading={workspacesLoading}
                  selectedIds={selectedWsIds}
                  setSelectedIds={setSelectedWsIds}
                  filter={wsFilter}
                  setFilter={setWsFilter}
                  onNext={handleFetchItems}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Step: Select Models & Reports ─────────────────────────────────── */}
        {includeFabric && (phase === 'fabric-picking-items' || itemsDone) && (
          <div className={`${cardCls} ${
            phase === 'fabric-picking-items' ? activeBorderCls
            : itemsDone ? doneBorderCls
            : pendingBorderCls
          }`}>
            <StepHeader
              number={fabricStepBase + (includeSource ? 3 : 2)}
              title="Select models &amp; reports"
              done={itemsDone}
              active={phase === 'fabric-picking-items'}
              count={itemsDone ? `${selectedDatasetIds.size}M · ${selectedReportIds.size}R` : undefined}
            />
            <div className="p-5">
              {itemsDone ? (
                <div className="flex items-center gap-2 text-sm text-[#34d399]">
                  <CheckCircle2 className="h-4 w-4" />
                  {selectedDatasetIds.size} model{selectedDatasetIds.size!==1?'s':''} and {selectedReportIds.size} report{selectedReportIds.size!==1?'s':''} selected
                </div>
              ) : (
                <FabricItemPicker
                  workspaceItems={workspaceItems}
                  workspaces={workspaces}
                  loading={itemsLoading}
                  selectedDatasetIds={selectedDatasetIds}
                  setSelectedDatasetIds={setSelectedDatasetIds}
                  selectedReportIds={selectedReportIds}
                  setSelectedReportIds={setSelectedReportIds}
                  expandedWorkspaces={expandedWorkspaces}
                  setExpandedWorkspaces={setExpandedWorkspaces}
                  filter={itemFilter}
                  setFilter={setItemFilter}
                  onBack={() => setPhase('fabric-picking')}
                  onNext={() => setPhase('fabric-naming')}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Step: Run ─────────────────────────────────────────────────────── */}
        {includeFabric && itemsDone && (
          <div className={`${cardCls} ${activeBorderCls}`}>
            <StepHeader
              number={fabricStepBase + (includeSource ? 4 : 3)}
              title="Label &amp; run assessment"
              done={false}
              active={true}
            />
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                  Fabric Label <span className="text-slate-500 font-normal normal-case">(optional)</span>
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    value={fabricLabel}
                    onChange={e => setFabricLabel(e.target.value)}
                    placeholder="e.g. Production Fabric Q2"
                    disabled={phase === 'fabric-submitting'}
                    className={`${inputCls} pl-9 disabled:opacity-40`}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1 text-sm text-slate-400">
                {includeSource && (
                  <p>Source: <strong className="text-slate-900">{servers.reduce((a,s)=>a+s.selected_dbs.length,0)} database{servers.reduce((a,s)=>a+s.selected_dbs.length,0)!==1?'s':''}</strong> across <strong className="text-slate-900">{servers.length} server{servers.length!==1?'s':''}</strong></p>
                )}
                <p>Fabric: <strong className="text-slate-900">{selectedDatasetIds.size} model{selectedDatasetIds.size!==1?'s':''}</strong> and <strong className="text-slate-900">{selectedReportIds.size} report{selectedReportIds.size!==1?'s':''}</strong> across <strong className="text-slate-900">{selectedWsIds.size} workspace{selectedWsIds.size!==1?'s':''}</strong></p>
              </div>

              <button
                onClick={handleFabricSubmit}
                disabled={phase === 'fabric-submitting'}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold
                           bg-[#4DA8A0] text-white hover:bg-[#6CBDB5] disabled:opacity-50
                           transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(77,168,160,0.30)]"
                style={{ boxShadow: phase !== 'fabric-submitting' ? '0 0 24px rgba(77,168,160,0.12)' : undefined }}
              >
                {phase === 'fabric-submitting'
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting assessment…</>
                  : <>Run Assessment <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Source Config Form ────────────────────────────────────────────────────────

function SourceConfigForm({
  servers, setServers, updateServer, testConnectivity, loadDatabases, onSubmit, submitting, includeFabric,
}: {
  servers: ServerEntry[]
  setServers: React.Dispatch<React.SetStateAction<ServerEntry[]>>
  updateServer: (id: string, patch: Partial<ServerEntry>) => void
  testConnectivity: (srv: ServerEntry) => void
  loadDatabases: (srv: ServerEntry) => void
  onSubmit: () => void
  submitting: boolean
  includeFabric: boolean
}) {
  const totalDbs = servers.reduce((acc, s) => acc + s.selected_dbs.length, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          {servers.length} server{servers.length!==1?'s':''} · {totalDbs} DB{totalDbs!==1?'s':''} selected
        </p>
        <button
          type="button"
          onClick={() => setServers(prev => [...prev, makeServer()])}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     border border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 hover:text-slate-900
                     transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add server
        </button>
      </div>

      {servers.map((srv, idx) => (
        <ServerCard
          key={srv.id}
          srv={srv}
          index={idx}
          updateServer={updateServer}
          testConnectivity={testConnectivity}
          loadDatabases={loadDatabases}
          onRemove={servers.length > 1 ? () => setServers(prev => prev.filter(s => s.id !== srv.id)) : undefined}
        />
      ))}

      <button
        onClick={onSubmit}
        disabled={submitting || totalDbs === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold
                   bg-[#4DA8A0] text-white hover:bg-[#6CBDB5] disabled:opacity-40
                   transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(77,168,160,0.30)]"
        style={{ boxShadow: (!submitting && totalDbs > 0) ? '0 0 20px rgba(77,168,160,0.10)' : undefined }}
      >
        {submitting
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          : includeFabric
          ? <>Next: Fabric Sign-in <ArrowRight className="h-4 w-4" /></>
          : <>Run Source Assessment <ArrowRight className="h-4 w-4" /></>}
      </button>
    </div>
  )
}

// ── Hybrid Connection Picker ──────────────────────────────────────────────────

function HybridConnectionPicker({ onSelect }: { onSelect: (host: string, port: number) => void }) {
  const [open, setOpen]               = useState(false)
  const [connections, setConnections] = useState<HybridConnection[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = async () => {
    setOpen(true)
    if (connections.length > 0) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.listHybridConnections()
      setConnections(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50
                   text-xs font-medium text-slate-400 hover:border-slate-300 hover:text-slate-900 transition-colors"
      >
        <Share2 className="h-3.5 w-3.5" />
        Hybrid
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 w-72 rounded-xl border border-slate-200 bg-white overflow-hidden"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200">
            <Share2 className="h-3.5 w-3.5 text-earth-600" />
            <span className="text-xs font-semibold text-slate-900">Hybrid Connections</span>
          </div>
          {loading && <div className="flex items-center justify-center py-6"><RefreshCw className="h-4 w-4 animate-spin text-slate-500" /></div>}
          {error && <div className="px-3 py-3 text-xs text-[#f87171]">{error}</div>}
          {!loading && !error && connections.length === 0 && (
            <div className="px-3 py-4 text-xs text-slate-500 text-center">
              No saved connections. <a href="/hybrid-connection" className="text-earth-600 underline underline-offset-2">Create one</a> first.
            </div>
          )}
          {!loading && connections.map(hc => (
            <button
              key={hc.connection_id}
              type="button"
              onClick={() => { onSelect(hc.endpoint_host, hc.endpoint_port); setOpen(false) }}
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-200 last:border-0"
            >
              <div className="h-7 w-7 rounded-lg bg-[rgba(77,168,160,0.08)] border border-[rgba(77,168,160,0.10)] flex items-center justify-center shrink-0 mt-0.5">
                <Share2 className="h-3.5 w-3.5 text-earth-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">{hc.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{hc.endpoint_host}:{hc.endpoint_port}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Server Card ───────────────────────────────────────────────────────────────

function ServerCard({
  srv, index, updateServer, testConnectivity, loadDatabases, onRemove,
}: {
  srv: ServerEntry; index: number
  updateServer: (id: string, patch: Partial<ServerEntry>) => void
  testConnectivity: (srv: ServerEntry) => void
  loadDatabases: (srv: ServerEntry) => void
  onRemove?: () => void
}) {
  const filteredDbs = srv.available_dbs || []

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
        onClick={() => updateServer(srv.id, { expanded: !srv.expanded })}
      >
        <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(77,168,160,0.08)', border: '1px solid rgba(77,168,160,0.10)' }}>
          <Server className="h-3.5 w-3.5 text-earth-600" />
        </div>
        <span className="flex-1 text-sm font-semibold text-slate-900">
          {srv.server || `Server ${index + 1}`}
        </span>
        {srv.selected_dbs.length > 0 && (
          <span className="text-xs font-mono text-earth-600">{srv.selected_dbs.length} DB{srv.selected_dbs.length!==1?'s':''}</span>
        )}
        {srv.connectivity && (
          srv.connectivity.reachable
            ? <Wifi className="h-4 w-4 text-[#34d399]" />
            : <WifiOff className="h-4 w-4 text-[#f87171]" />
        )}
        {srv.expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
        {onRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="p-1 rounded-lg hover:bg-[rgba(248,113,113,0.1)] text-slate-500 hover:text-[#f87171] transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {srv.expanded && (
        <div className="border-t border-slate-200 px-4 pb-4 pt-3 space-y-3">
          {/* DB type + server + port */}
          <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Type</label>
              <select
                value={srv.db_type}
                onChange={e => {
                  const opt = DB_TYPE_OPTIONS.find(o => o.value === e.target.value)
                  updateServer(srv.id, { db_type: e.target.value as DbType, port: opt?.defaultPort || 1433 })
                }}
                className={selectCls}
              >
                {DB_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Server / Host</label>
              <div className="flex gap-1.5">
                <input
                  value={srv.server}
                  onChange={e => updateServer(srv.id, { server: e.target.value, connectivity: null })}
                  placeholder="hostname or IP"
                  className={inputCls}
                />
                <HybridConnectionPicker
                  onSelect={(host, port) => updateServer(srv.id, { server: host, port, gateway_key: null, connectivity: null })}
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Port</label>
              <input
                type="number"
                value={srv.port}
                onChange={e => updateServer(srv.id, { port: Number(e.target.value) })}
                className={`${inputCls} w-20`}
              />
            </div>
          </div>

          {/* PostgreSQL platform badge */}
          {srv.db_type === 'postgres' && srv.server.trim() && (() => {
            const p = detectPgPlatform(srv.server)
            return (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                               bg-[rgba(96,165,250,0.1)] text-[#60a5fa] border border-[rgba(96,165,250,0.2)]">
                <Zap className="h-3 w-3" />{p.label}
              </span>
            )
          })()}

          {/* Azure MSI toggle */}
          {srv.db_type === 'postgres' && detectPgPlatform(srv.server).key === 'azure' && (
            <div className="space-y-2">
              <Toggle
                checked={srv.azure_managed_identity}
                onChange={v => updateServer(srv.id, { azure_managed_identity: v })}
                label="Use Azure Managed Identity"
                description="Authenticate via Microsoft Entra ID — no password needed."
              />
              {srv.azure_managed_identity && (
                <div className="rounded-xl border border-[rgba(96,165,250,0.2)] bg-[rgba(96,165,250,0.05)] px-3 py-2.5 text-xs text-[#60a5fa] space-y-1">
                  <p className="font-semibold text-[#93c5fd]">Required on the Azure PostgreSQL side:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-[#7dd3fc]">
                    <li>Enable <strong>Microsoft Entra authentication</strong> on the Flexible Server</li>
                    <li><code className="font-mono">SELECT pgaadauth_create_principal('user@tenant.com', false, false);</code></li>
                    <li><code className="font-mono">GRANT pg_read_all_data TO "user@tenant.com";</code></li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* GCP Cloud SQL */}
          {srv.db_type === 'postgres' && detectPgPlatform(srv.server).key === 'gcp_cloudsql_name' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[rgba(96,165,250,0.2)] bg-[rgba(96,165,250,0.05)] px-3 py-2.5 text-xs text-[#60a5fa]">
                <p className="font-semibold text-[#93c5fd] mb-1">GCP Authentication</p>
                <ul className="list-disc list-inside space-y-0.5 text-[#7dd3fc]">
                  <li><strong>GCE / Cloud Run / GKE:</strong> ADC is automatic — no key needed</li>
                  <li><strong>Dev machine:</strong> <code className="font-mono">gcloud auth application-default login</code></li>
                  <li><strong>Fallback:</strong> paste SA key below</li>
                </ul>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => updateServer(srv.id, { show_gcp_sa_key: !srv.show_gcp_sa_key })}
                  className="flex items-center gap-1.5 text-xs text-[#60a5fa] hover:text-[#93c5fd] font-medium transition-colors"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Service Account Key JSON (optional fallback)
                  <svg className={`h-3.5 w-3.5 ml-0.5 transition-transform ${srv.show_gcp_sa_key ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {srv.show_gcp_sa_key && (
                  <textarea
                    className={`mt-2 w-full font-mono text-xs resize-none ${inputCls}`}
                    rows={3}
                    placeholder={'{\n  "type": "service_account",\n  ...\n}'}
                    value={srv.gcp_sa_key}
                    onChange={e => updateServer(srv.id, { gcp_sa_key: e.target.value })}
                    spellCheck={false}
                  />
                )}
              </div>
              <Toggle
                checked={srv.gcp_private_ip}
                onChange={v => updateServer(srv.id, { gcp_private_ip: v })}
                label="Use Private IP (VPC)"
                description="Connect via private IP — SAT must be in the same VPC or VPC-peered network."
              />
            </div>
          )}

          {/* Credentials */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Username</label>
              <input
                value={srv.username}
                onChange={e => updateServer(srv.id, { username: e.target.value })}
                placeholder="login"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Password{srv.db_type === 'postgres' && srv.azure_managed_identity
                  ? <span className="text-slate-500 font-normal normal-case ml-1 text-[10px]">(not needed)</span>
                  : null}
              </label>
              <div className="relative">
                <input
                  type={srv.show_password ? 'text' : 'password'}
                  value={srv.password}
                  onChange={e => updateServer(srv.id, { password: e.target.value })}
                  placeholder={srv.db_type === 'postgres' && srv.azure_managed_identity ? 'Leave blank' : 'password'}
                  disabled={srv.db_type === 'postgres' && srv.azure_managed_identity}
                  className={`${inputCls} pr-9 disabled:opacity-40`}
                />
                <button
                  type="button"
                  onClick={() => updateServer(srv.id, { show_password: !srv.show_password })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400 transition-colors"
                >
                  {srv.show_password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Access level */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Access Level</label>
            <select
              value={srv.access_level}
              onChange={e => updateServer(srv.id, { access_level: e.target.value as AccessLevel })}
              className={`${selectCls} w-full`}
            >
              {ACCESS_LEVEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => testConnectivity(srv)}
              disabled={!srv.server || srv.connectivity_loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                         border border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-900
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {srv.connectivity_loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
              Test connectivity
            </button>
            <button
              onClick={() => loadDatabases(srv)}
              disabled={!srv.server || !srv.username || srv.dbs_loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                         border border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-900
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {srv.dbs_loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
              Load databases
            </button>
            {srv.connectivity && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                srv.connectivity.reachable
                  ? 'bg-[rgba(52,211,153,0.1)] text-[#34d399] border border-[rgba(52,211,153,0.2)]'
                  : 'bg-[rgba(248,113,113,0.1)] text-[#f87171] border border-[rgba(248,113,113,0.2)]'
              }`}>
                {srv.connectivity.reachable
                  ? <><Wifi className="h-3 w-3" /> Reachable {srv.connectivity.latency_ms != null ? `(${srv.connectivity.latency_ms}ms)` : ''}</>
                  : <><WifiOff className="h-3 w-3" /> Not reachable</>}
              </span>
            )}
          </div>

          {/* Not reachable callout */}
          {srv.connectivity && !srv.connectivity.reachable && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[rgba(96,165,250,0.2)] bg-[rgba(96,165,250,0.05)] px-4 py-3">
              <Network className="h-4 w-4 text-[#60a5fa] mt-0.5 shrink-0" />
              <div className="text-xs text-[#93c5fd] space-y-1">
                <p className="font-semibold text-[#bfdbfe]">Server not directly reachable from Azure</p>
                <p>
                  If this is an on-premises {DB_TYPE_OPTIONS.find(o => o.value === srv.db_type)?.label ?? 'database server'}, ensure the{' '}
                  <strong>Azure Hybrid Connection Manager</strong> is running on a connected machine.
                </p>
                <a
                  href="/hybrid-connection"
                  className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-white transition-colors"
                >
                  <Info className="h-3 w-3" />
                  Hybrid Connection setup guide
                </a>
              </div>
            </div>
          )}

          {/* DB error */}
          {srv.dbs_error && (
            <p className="text-xs text-[#f87171] bg-[rgba(248,113,113,0.08)] rounded-lg px-3 py-2 border border-[rgba(248,113,113,0.15)]">
              {srv.dbs_error}
            </p>
          )}

          {/* Databases list */}
          {filteredDbs.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                  Databases ({srv.selected_dbs.length}/{filteredDbs.length})
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (srv.selected_dbs.length === filteredDbs.length) {
                      updateServer(srv.id, { selected_dbs: [] })
                    } else {
                      updateServer(srv.id, {
                        selected_dbs: filteredDbs.map(d => ({ name: d.name, include_null_analysis: true, null_analysis_sample_limit: 30 })),
                      })
                    }
                  }}
                  className="text-[10px] font-semibold text-earth-600 hover:text-[#6CBDB5] uppercase tracking-widest transition-colors"
                >
                  {srv.selected_dbs.length === filteredDbs.length ? 'Unselect All' : 'Select All'}
                </button>
              </div>
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {filteredDbs.map(db => {
                  const selected = srv.selected_dbs.some(s => s.name === db.name)
                  return (
                    <label key={db.name}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selected ? 'bg-[rgba(77,168,160,0.06)] hover:bg-[rgba(77,168,160,0.08)]' : 'hover:hover:bg-slate-50'
                      }`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...srv.selected_dbs, { name: db.name, include_null_analysis: true, null_analysis_sample_limit: 30 }]
                            : srv.selected_dbs.filter(s => s.name !== db.name)
                          updateServer(srv.id, { selected_dbs: next })
                        }}
                        className="rounded border-slate-200 accent-[#4DA8A0]"
                      />
                      <span className={`text-sm flex-1 ${selected ? 'text-slate-900' : 'text-slate-400'}`}>{db.name}</span>
                      {db.size_mb != null && (
                        <span className="text-xs font-mono text-slate-500">{db.size_mb.toFixed(0)} MB</span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Fabric Auth Panel ─────────────────────────────────────────────────────────

function FabricAuthPanel({
  userCode, verificationUrl, copied, setCopied,
}: {
  userCode: string; verificationUrl: string
  copied: boolean; setCopied: (v: boolean) => void
}) {
  const copyCode = async () => {
    if (!userCode) return
    await navigator.clipboard.writeText(userCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!userCode) {
    return (
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-earth-600" />
        Requesting device code from Microsoft…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Open the link below in any browser and enter the code to authenticate:
      </p>
      <a
        href={verificationUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm font-medium text-earth-600 hover:text-[#6CBDB5] hover:underline transition-colors"
      >
        <ExternalLink className="h-4 w-4 shrink-0" />
        {verificationUrl}
      </a>
      <div className="flex items-stretch gap-3">
        <div className="flex-1 rounded-xl border-2 border-[rgba(77,168,160,0.20)] bg-[rgba(77,168,160,0.06)] px-5 py-3 text-center">
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-1">Your code</p>
          <p className="text-2xl font-mono font-bold tracking-widest text-earth-600">{userCode}</p>
        </div>
        <button
          onClick={copyCode}
          className="shrink-0 flex flex-col items-center justify-center gap-1 px-4 rounded-xl border border-slate-200
                     bg-slate-50 text-xs text-slate-400 hover:border-slate-300 hover:text-slate-900 transition-colors"
        >
          {copied ? <CheckCircle2 className="h-4 w-4 text-[#34d399]" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-earth-600" />
        Waiting for you to sign in…
      </div>
    </div>
  )
}

// ── Fabric Workspace Picker ───────────────────────────────────────────────────

function FabricWorkspacePicker({
  workspaces, loading, selectedIds, setSelectedIds, filter, setFilter, onNext,
}: {
  workspaces: FabricWorkspaceInfo[]; loading: boolean
  selectedIds: Set<string>; setSelectedIds: (s: Set<string>) => void
  filter: string; setFilter: (f: string) => void
  onNext: () => void
}) {
  const filtered = workspaces.filter(w => !filter || w.name.toLowerCase().includes(filter.toLowerCase()))
  const allSelected = filtered.length > 0 && filtered.every(w => selectedIds.has(w.id))

  if (loading) return (
    <div className="flex items-center gap-3 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-earth-600" />
      Loading accessible workspaces…
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter workspaces…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <button
          onClick={() => {
            const next = new Set(selectedIds)
            if (allSelected) filtered.forEach(w => next.delete(w.id))
            else filtered.forEach(w => next.add(w.id))
            setSelectedIds(next)
          }}
          className="shrink-0 text-xs text-earth-600 hover:text-[#6CBDB5] font-semibold transition-colors"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {workspaces.length === 0 ? (
        <p className="text-sm text-slate-500">No accessible workspaces found for this account.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
          {filtered.map(ws => (
            <label
              key={ws.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(ws.id)}
                onChange={e => {
                  const next = new Set(selectedIds)
                  e.target.checked ? next.add(ws.id) : next.delete(ws.id)
                  setSelectedIds(next)
                }}
                className="h-4 w-4 rounded border-slate-200 accent-[#4DA8A0]"
              />
              <Building2 className="h-4 w-4 text-slate-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{ws.name}</p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Database className="h-3 w-3" />{ws.dataset_count} model{ws.dataset_count !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />{ws.report_count} report{ws.report_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              {selectedIds.has(ws.id) && <CheckCircle2 className="h-4 w-4 text-earth-600 shrink-0" />}
            </label>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">No workspaces match "{filter}"</div>
          )}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={selectedIds.size === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                   bg-[#4DA8A0] text-white hover:bg-[#6CBDB5] disabled:opacity-40
                   transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(77,168,160,0.30)]"
      >
        Continue with {selectedIds.size || '…'} workspace{selectedIds.size !== 1 ? 's' : ''}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Fabric Item Picker ────────────────────────────────────────────────────────

function FabricItemPicker({
  workspaceItems, workspaces, loading, selectedDatasetIds, setSelectedDatasetIds,
  selectedReportIds, setSelectedReportIds, expandedWorkspaces, setExpandedWorkspaces,
  filter, setFilter, onBack, onNext,
}: {
  workspaceItems: FabricWorkspaceItems[]; workspaces: FabricWorkspaceInfo[]; loading: boolean
  selectedDatasetIds: Set<string>; setSelectedDatasetIds: (s: Set<string>) => void
  selectedReportIds: Set<string>; setSelectedReportIds: (s: Set<string>) => void
  expandedWorkspaces: Set<string>; setExpandedWorkspaces: (s: Set<string>) => void
  filter: string; setFilter: (f: string) => void
  onBack: () => void; onNext: () => void
}) {
  const totalSelected = selectedDatasetIds.size + selectedReportIds.size
  const lf = filter.toLowerCase()

  const allDs  = workspaceItems.flatMap(w => w.datasets.map(d => d.id))
  const allRpt = workspaceItems.flatMap(w => w.reports.map(r => r.id))
  const allSelected = allDs.every(id => selectedDatasetIds.has(id)) && allRpt.every(id => selectedReportIds.has(id))

  const toggleAll = () => {
    if (allSelected) {
      setSelectedDatasetIds(new Set())
      setSelectedReportIds(new Set())
    } else {
      setSelectedDatasetIds(new Set(allDs))
      setSelectedReportIds(new Set(allRpt))
    }
  }

  if (loading) return (
    <div className="flex items-center gap-3 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-earth-600" />
      Loading workspace items…
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter models and reports…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <button
          onClick={toggleAll}
          className="shrink-0 text-xs text-earth-600 hover:text-[#6CBDB5] font-semibold transition-colors"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
        {workspaceItems.map(wi => {
          const expanded  = expandedWorkspaces.has(wi.workspace_id)
          const filteredDs = wi.datasets.filter(d => !lf || d.name.toLowerCase().includes(lf))
          const filteredRp = wi.reports.filter(r => !lf || r.name.toLowerCase().includes(lf))
          const wsName     = workspaces.find(w => w.id === wi.workspace_id)?.name || wi.workspace_id
          const dsSelected  = wi.datasets.filter(d => selectedDatasetIds.has(d.id)).length
          const rptSelected = wi.reports.filter(r => selectedReportIds.has(r.id)).length

          const toggleAllDs = () => {
            const next = new Set(selectedDatasetIds)
            const allSel = filteredDs.every(d => next.has(d.id))
            if (allSel) filteredDs.forEach(d => next.delete(d.id))
            else filteredDs.forEach(d => next.add(d.id))
            setSelectedDatasetIds(next)
          }
          const toggleAllRp = () => {
            const next = new Set(selectedReportIds)
            const allSel = filteredRp.every(r => next.has(r.id))
            if (allSel) filteredRp.forEach(r => next.delete(r.id))
            else filteredRp.forEach(r => next.add(r.id))
            setSelectedReportIds(next)
          }

          return (
            <div key={wi.workspace_id}>
              <button
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:hover:bg-slate-50 transition-colors text-left"
                onClick={() => {
                  const next = new Set(expandedWorkspaces)
                  expanded ? next.delete(wi.workspace_id) : next.add(wi.workspace_id)
                  setExpandedWorkspaces(next)
                }}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
                <Building2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <span className="flex-1 text-xs font-semibold text-slate-900 truncate">{wsName}</span>
                <span className="text-xs text-slate-500">
                  {dsSelected}/{wi.datasets.length} models · {rptSelected}/{wi.reports.length} reports
                </span>
              </button>

              {expanded && (
                <div className="divide-y divide-slate-100">
                  {filteredDs.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 px-5 py-1.5 bg-[rgba(77,168,160,0.03)]">
                        <Database className="h-3 w-3 text-earth-600 shrink-0" />
                        <span className="text-xs font-medium text-slate-400 flex-1">Semantic Models</span>
                        <button onClick={toggleAllDs} className="text-xs text-earth-600 hover:text-[#6CBDB5] transition-colors">
                          {filteredDs.every(d => selectedDatasetIds.has(d.id)) ? 'Deselect' : 'Select'} all
                        </button>
                      </div>
                      {filteredDs.map(ds => (
                        <label key={ds.id} className="flex items-center gap-3 px-6 py-2 hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-200 accent-[#4DA8A0]"
                            checked={selectedDatasetIds.has(ds.id)}
                            onChange={() => {
                              const next = new Set(selectedDatasetIds)
                              next.has(ds.id) ? next.delete(ds.id) : next.add(ds.id)
                              setSelectedDatasetIds(next)
                            }}
                          />
                          <span className="text-sm text-slate-400 truncate">{ds.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {filteredRp.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 px-5 py-1.5 bg-[rgba(96,165,250,0.03)]">
                        <FileText className="h-3 w-3 text-[#60a5fa] shrink-0" />
                        <span className="text-xs font-medium text-slate-400 flex-1">Reports</span>
                        <button onClick={toggleAllRp} className="text-xs text-earth-600 hover:text-[#6CBDB5] transition-colors">
                          {filteredRp.every(r => selectedReportIds.has(r.id)) ? 'Deselect' : 'Select'} all
                        </button>
                      </div>
                      {filteredRp.map(rpt => (
                        <label key={rpt.id} className="flex items-center gap-3 px-6 py-2 hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-200 accent-[#4DA8A0]"
                            checked={selectedReportIds.has(rpt.id)}
                            onChange={() => {
                              const next = new Set(selectedReportIds)
                              next.has(rpt.id) ? next.delete(rpt.id) : next.add(rpt.id)
                              setSelectedReportIds(next)
                            }}
                          />
                          <span className="flex-1 text-sm text-slate-400 truncate">{rpt.name}</span>
                          {rpt.report_type === 'PaginatedReport' && (
                            <span className="text-xs text-slate-500 shrink-0">Paginated</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                  {filteredDs.length === 0 && filteredRp.length === 0 && (
                    <p className="text-xs text-slate-500 py-3 px-5">No items match filter</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {workspaceItems.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-500">No models or reports found.</div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium
                     border border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 hover:text-slate-900
                     transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={totalSelected === 0}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                     bg-[#4DA8A0] text-white hover:bg-[#6CBDB5] disabled:opacity-40
                     transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(77,168,160,0.30)]"
        >
          Continue with {selectedDatasetIds.size} model{selectedDatasetIds.size!==1?'s':''} &amp; {selectedReportIds.size} report{selectedReportIds.size!==1?'s':''}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}


