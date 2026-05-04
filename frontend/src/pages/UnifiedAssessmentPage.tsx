/**
 * UnifiedAssessmentPage — combined mode selector and guided assessment flow.
 *
 * Phases:
 *   mode-select  → user chooses Source Only / Fabric Only / Both
 *   source-form  → multi-server form (modes: source | both)
 *   fabric-auth  → Microsoft device-code auth (modes: fabric | both)
 *   fabric-pick  → workspace + model/report selection
 *   done         → redirect to unified session detail
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, Zap, Layers3, CheckCircle2, AlertCircle,
  ArrowRight, Server, Plus, Trash2, Eye, EyeOff,
  Wifi, WifiOff, RefreshCw, Search, ExternalLink, Copy,
  Loader2, Tag, Building2, FileText, ChevronDown, ChevronRight,
  MonitorSmartphone,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type {
  AssessmentMode,
  AccessLevel,
  DatabaseInfo,
  DbType,
  FabricWorkspaceInfo,
  FabricWorkspaceItems,
} from '../types/api'
import { ACCESS_LEVEL_OPTIONS } from '../types/api'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'mode-select'
  | 'source-form'
  | 'source-submitting'
  | 'fabric-auth'
  | 'fabric-picking'
  | 'fabric-picking-items'
  | 'fabric-naming'
  | 'fabric-submitting'
  | 'done'

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
    connectivity: null, connectivity_loading: false,
    available_dbs: null, dbs_loading: false, dbs_error: null,
    selected_dbs: [], expanded: true,
  }
}

// ── Progress Stepper ──────────────────────────────────────────────────────────

function Stepper({ mode, phase }: { mode: AssessmentMode; phase: Phase }) {
  const steps =
    mode === 'source' ? ['Source Assessment'] :
    mode === 'fabric' ? ['Fabric Assessment'] :
    ['Source Assessment', 'Fabric Assessment']

  const activeStep =
    mode === 'both'
      ? phase.startsWith('fabric') || phase === 'done' ? 1 : 0
      : 0

  const completedUpTo =
    phase === 'done' ? steps.length :
    mode === 'both' && (phase.startsWith('fabric') || phase === 'done') ? 1 : 0

  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const done = i < completedUpTo
        const active = i === activeStep && phase !== 'done'
        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`mt-1.5 text-xs font-medium ${active ? 'text-violet-700' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 rounded-full transition-all ${completedUpTo > i ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Mode selector cards ───────────────────────────────────────────────────────

function ModeCard({
  mode, title, description, icon: Icon, accent, onClick,
}: {
  mode: AssessmentMode; title: string; description: string
  icon: React.ElementType; accent: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-4 p-6 rounded-2xl border-2 text-left
                 transition-all duration-200 hover:shadow-lg focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-violet-500/40
                 border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/30"
      style={{ minHeight: '180px' }}
    >
      <div
        className="h-12 w-12 rounded-xl flex items-center justify-center"
        style={{ background: accent, boxShadow: '0 4px 14px rgba(124,58,237,0.25)' }}
      >
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-base font-bold text-slate-900 group-hover:text-violet-900 transition-colors">
          {title}
        </p>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">{description}</p>
      </div>
      <div className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity">
        Select <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UnifiedAssessmentPage() {
  const navigate = useNavigate()

  const [mode, setMode]                   = useState<AssessmentMode>('both')
  const [phase, setPhase]                 = useState<Phase>('mode-select')
  const [unifiedSessionId, setUnifiedSessionId] = useState<string>('')
  const [sessionLabel, setSessionLabel]   = useState('')
  const [error, setError]                 = useState<string | null>(null)

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

  // ── Mode selection ──────────────────────────────────────────────────────────

  const handleModeSelect = useCallback(async (selected: AssessmentMode) => {
    setMode(selected)
    setError(null)
    try {
      const { data } = await api.createUnifiedSession({ mode: selected, label: sessionLabel || undefined })
      setUnifiedSessionId(data.unified_session_id)
      setPhase(selected === 'fabric' ? 'fabric-auth' : 'source-form')
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }, [sessionLabel])

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
      const { data } = await api.listDatabases({
        db_type: srv.db_type,
        server: srv.server,
        port: srv.port,
        database: 'master',
        username: srv.username,
        password: srv.password,
        trust_server_certificate: srv.trust_server_certificate,
        encrypt: srv.encrypt,
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
      await api.createSession({
        label: sessionLabel || undefined,
        unified_session_id: unifiedSessionId,
        servers: servers.map(s => ({
          db_type: s.db_type,
          server: s.server,
          port: s.port,
          username: s.username,
          password: s.password,
          trust_server_certificate: s.trust_server_certificate,
          encrypt: s.encrypt,
          access_level: s.access_level,
          use_gateway: false,
          databases: s.selected_dbs,
        })),
      })

      if (mode === 'source') {
        navigate(`/unified/sessions/${unifiedSessionId}`)
      } else {
        // Both: proceed to Fabric after source is submitted
        setPhase('fabric-auth')
      }
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSourceSubmitting(false)
    }
  }, [servers, sessionLabel, unifiedSessionId, mode, navigate])

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

  // Auto-start fabric auth when entering fabric-auth phase for the first time
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
      await api.createFabricSession({
        auth_id: authId,
        label: fabricLabel || sessionLabel || undefined,
        workspace_ids: Array.from(selectedWsIds),
        dataset_ids: Array.from(selectedDatasetIds),
        report_ids: Array.from(selectedReportIds),
        unified_session_id: unifiedSessionId,
      })
      navigate(`/unified/sessions/${unifiedSessionId}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
      setPhase('fabric-naming')
    }
  }, [authId, fabricLabel, sessionLabel, selectedWsIds, selectedDatasetIds, selectedReportIds, unifiedSessionId, navigate])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">New Assessment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Assess your SQL Server databases, Microsoft Fabric workspaces, or both in one unified session.
        </p>
      </div>

      {/* Stepper (only after mode is selected) */}
      {phase !== 'mode-select' && (
        <Stepper mode={mode} phase={phase} />
      )}

      {/* Global error */}
      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Phase: mode-select ─────────────────────────────────────────────── */}
      {phase === 'mode-select' && (
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Session label <span className="text-slate-400 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={sessionLabel}
                onChange={e => setSessionLabel(e.target.value)}
                placeholder="e.g. Q2 2026 assessment"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400
                           bg-white text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-4">Choose what to assess:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ModeCard
                mode="source"
                title="Source Database"
                description="Assess SQL Server, PostgreSQL, MySQL, or Oracle databases for schema, security, performance, and reliability."
                icon={Database}
                accent="linear-gradient(135deg, #7c3aed, #6366f1)"
                onClick={() => handleModeSelect('source')}
              />
              <ModeCard
                mode="fabric"
                title="Microsoft Fabric"
                description="Assess Power BI / Fabric workspaces, semantic models, measures, and reports for complexity and coverage."
                icon={Zap}
                accent="linear-gradient(135deg, #4f46e5, #0ea5e9)"
                onClick={() => handleModeSelect('fabric')}
              />
              <ModeCard
                mode="both"
                title="Full Assessment"
                description="Run Source Database and Fabric assessments back-to-back and receive a single consolidated report."
                icon={Layers3}
                accent="linear-gradient(135deg, #7c3aed, #0ea5e9)"
                onClick={() => handleModeSelect('both')}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Phase: source-form ─────────────────────────────────────────────── */}
      {phase === 'source-form' && (
        <SourceAssessmentForm
          servers={servers}
          setServers={setServers}
          updateServer={updateServer}
          testConnectivity={testConnectivity}
          loadDatabases={loadDatabases}
          onSubmit={handleSourceSubmit}
          submitting={sourceSubmitting}
          mode={mode}
        />
      )}

      {/* ── Phase: fabric-auth ─────────────────────────────────────────────── */}
      {phase === 'fabric-auth' && (
        <FabricAuthPanel
          userCode={userCode}
          verificationUrl={verificationUrl}
          copied={copied}
          setCopied={setCopied}
          mode={mode}
        />
      )}

      {/* ── Phase: fabric-picking ──────────────────────────────────────────── */}
      {phase === 'fabric-picking' && (
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

      {/* ── Phase: fabric-picking-items ────────────────────────────────────── */}
      {phase === 'fabric-picking-items' && (
        <FabricItemPicker
          workspaceItems={workspaceItems}
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

      {/* ── Phase: fabric-naming ───────────────────────────────────────────── */}
      {phase === 'fabric-naming' && (
        <div className="space-y-6">
          <div
            className="p-5 rounded-2xl border border-slate-200 bg-white"
            style={{ boxShadow: 'var(--elevation-1)' }}
          >
            <p className="text-sm font-semibold text-slate-800 mb-1">Assessment label</p>
            <p className="text-xs text-slate-500 mb-4">Give this Fabric assessment a name to identify it in reports.</p>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={fabricLabel}
                onChange={e => setFabricLabel(e.target.value)}
                placeholder="e.g. Production Fabric Q2"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400
                           bg-white text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setPhase('fabric-picking-items')}>Back</Button>
            <Button onClick={handleFabricSubmit}>
              Start Fabric Assessment <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Phase: fabric-submitting ───────────────────────────────────────── */}
      {phase === 'fabric-submitting' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <Spinner size="lg" />
          <p className="text-sm text-slate-600">Starting Fabric assessment…</p>
        </div>
      )}
    </div>
  )
}

// ── Source Assessment Form ────────────────────────────────────────────────────

function SourceAssessmentForm({
  servers, setServers, updateServer, testConnectivity, loadDatabases, onSubmit, submitting, mode,
}: {
  servers: ServerEntry[]
  setServers: React.Dispatch<React.SetStateAction<ServerEntry[]>>
  updateServer: (id: string, patch: Partial<ServerEntry>) => void
  testConnectivity: (srv: ServerEntry) => void
  loadDatabases: (srv: ServerEntry) => void
  onSubmit: () => void
  submitting: boolean
  mode: AssessmentMode
}) {
  const totalDbs = servers.reduce((acc, s) => acc + s.selected_dbs.length, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">
          {mode === 'both' ? 'Step 1 — ' : ''}SQL Server databases to assess
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setServers(prev => [...prev, makeServer()])}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add server
        </Button>
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

      <div className="pt-2 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {totalDbs} database{totalDbs !== 1 ? 's' : ''} selected across {servers.length} server{servers.length !== 1 ? 's' : ''}
        </p>
        <Button onClick={onSubmit} disabled={submitting || totalDbs === 0}>
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Starting…</> :
           mode === 'both' ? <>Next: Fabric Assessment <ArrowRight className="h-4 w-4 ml-1" /></> :
           <>Start Assessment <ArrowRight className="h-4 w-4 ml-1" /></>}
        </Button>
      </div>
    </div>
  )
}

function ServerCard({
  srv, index, updateServer, testConnectivity, loadDatabases, onRemove,
}: {
  srv: ServerEntry; index: number
  updateServer: (id: string, patch: Partial<ServerEntry>) => void
  testConnectivity: (srv: ServerEntry) => void
  loadDatabases: (srv: ServerEntry) => void
  onRemove?: () => void
}) {
  const dbTypeOpt = DB_TYPE_OPTIONS.find(o => o.value === srv.db_type) || DB_TYPE_OPTIONS[0]
  const filteredDbs = srv.available_dbs || []

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
      style={{ boxShadow: 'var(--elevation-1)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => updateServer(srv.id, { expanded: !srv.expanded })}
      >
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #7c3aed20, #6366f110)', border: '1px solid rgba(124,58,237,0.15)' }}
        >
          <Server className="h-3.5 w-3.5 text-violet-600" />
        </div>
        <span className="flex-1 text-sm font-semibold text-slate-800">
          {srv.server || `Server ${index + 1}`}
        </span>
        <span className="text-xs text-slate-400">{srv.selected_dbs.length} DB{srv.selected_dbs.length !== 1 ? 's' : ''}</span>
        {srv.connectivity && (
          srv.connectivity.reachable
            ? <Wifi className="h-4 w-4 text-emerald-500" />
            : <WifiOff className="h-4 w-4 text-red-400" />
        )}
        {srv.expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        {onRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {srv.expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          {/* DB type + server + port */}
          <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Type</label>
              <select
                value={srv.db_type}
                onChange={e => {
                  const opt = DB_TYPE_OPTIONS.find(o => o.value === e.target.value)
                  updateServer(srv.id, { db_type: e.target.value as DbType, port: opt?.defaultPort || 1433 })
                }}
                className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white focus:ring-1 focus:ring-violet-500/40 focus:outline-none"
              >
                {DB_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Server / Host</label>
              <input
                value={srv.server}
                onChange={e => updateServer(srv.id, { server: e.target.value })}
                placeholder="hostname or IP"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-violet-500/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Port</label>
              <input
                type="number"
                value={srv.port}
                onChange={e => updateServer(srv.id, { port: Number(e.target.value) })}
                className="w-20 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-violet-500/40 focus:outline-none"
              />
            </div>
          </div>

          {/* Credentials */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Username</label>
              <input
                value={srv.username}
                onChange={e => updateServer(srv.id, { username: e.target.value })}
                placeholder="login"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-violet-500/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Password</label>
              <div className="relative">
                <input
                  type={srv.show_password ? 'text' : 'password'}
                  value={srv.password}
                  onChange={e => updateServer(srv.id, { password: e.target.value })}
                  placeholder="password"
                  className="w-full text-sm border border-slate-200 rounded-lg pl-3 pr-9 py-2 bg-white focus:ring-1 focus:ring-violet-500/40 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => updateServer(srv.id, { show_password: !srv.show_password })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {srv.show_password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Access level */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Access level</label>
            <select
              value={srv.access_level}
              onChange={e => updateServer(srv.id, { access_level: e.target.value as AccessLevel })}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-violet-500/40 focus:outline-none"
            >
              {ACCESS_LEVEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => testConnectivity(srv)}
              disabled={!srv.server || srv.connectivity_loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                         border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {srv.connectivity_loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
              Test connectivity
            </button>
            <button
              onClick={() => loadDatabases(srv)}
              disabled={!srv.server || !srv.username || srv.dbs_loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                         border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {srv.dbs_loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
              Load databases
            </button>
          </div>

          {/* Databases */}
          {srv.dbs_error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{srv.dbs_error}</p>
          )}
          {filteredDbs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Databases</p>
              {filteredDbs.map(db => {
                const selected = srv.selected_dbs.some(s => s.name === db.name)
                return (
                  <label key={db.name} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...srv.selected_dbs, { name: db.name, include_null_analysis: true, null_analysis_sample_limit: 30 }]
                          : srv.selected_dbs.filter(s => s.name !== db.name)
                        updateServer(srv.id, { selected_dbs: next })
                      }}
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500/40"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-violet-700 transition-colors">{db.name}</span>
                    {db.size_mb != null && (
                      <span className="text-xs text-slate-400 ml-auto">{db.size_mb.toFixed(0)} MB</span>
                    )}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Fabric Auth Panel ─────────────────────────────────────────────────────────

function FabricAuthPanel({
  userCode, verificationUrl, copied, setCopied, mode,
}: {
  userCode: string; verificationUrl: string
  copied: boolean; setCopied: (v: boolean) => void
  mode: AssessmentMode
}) {
  const copyCode = async () => {
    if (!userCode) return
    await navigator.clipboard.writeText(userCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!userCode) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Spinner size="lg" />
        <p className="text-sm text-slate-600">Initiating Microsoft authentication…</p>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
      style={{ boxShadow: 'var(--elevation-1)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #0ea5e9)' }}
        >
          <MonitorSmartphone className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">
            {mode === 'both' ? 'Step 2 — ' : ''}Microsoft Authentication
          </p>
          <p className="text-xs text-slate-500">Sign in with your Microsoft account to access Fabric workspaces.</p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
        <p className="text-xs text-slate-600">1. Visit the Microsoft device login page:</p>
        <a
          href={verificationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {verificationUrl}
        </a>
        <p className="text-xs text-slate-600">2. Enter this code when prompted:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-center text-xl font-bold tracking-widest text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg py-3">
            {userCode}
          </code>
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg
                       border border-slate-200 text-slate-600 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 transition-colors"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
        Waiting for you to authenticate…
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

  if (loading) return (
    <div className="flex flex-col items-center gap-4 py-16">
      <Spinner size="lg" />
      <p className="text-sm text-slate-600">Loading workspaces…</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">Select workspaces to assess</p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter workspaces…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white
                       focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
          />
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {filtered.map(ws => (
            <label key={ws.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50/30 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={selectedIds.has(ws.id)}
                onChange={e => {
                  const next = new Set(selectedIds)
                  e.target.checked ? next.add(ws.id) : next.delete(ws.id)
                  setSelectedIds(next)
                }}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500/40"
              />
              <Building2 className="h-4 w-4 text-indigo-500 shrink-0" />
              <span className="flex-1 text-sm text-slate-800">{ws.name}</span>
              <span className="text-xs text-slate-400">{ws.dataset_count}M · {ws.report_count}R</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">No workspaces found</p>
          )}
        </div>
      </div>
      <Button onClick={onNext} disabled={selectedIds.size === 0}>
        Next: Select models & reports <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  )
}

// ── Fabric Item Picker ────────────────────────────────────────────────────────

function FabricItemPicker({
  workspaceItems, loading, selectedDatasetIds, setSelectedDatasetIds,
  selectedReportIds, setSelectedReportIds, expandedWorkspaces, setExpandedWorkspaces,
  filter, setFilter, onBack, onNext,
}: {
  workspaceItems: FabricWorkspaceItems[]; loading: boolean
  selectedDatasetIds: Set<string>; setSelectedDatasetIds: (s: Set<string>) => void
  selectedReportIds: Set<string>; setSelectedReportIds: (s: Set<string>) => void
  expandedWorkspaces: Set<string>; setExpandedWorkspaces: (s: Set<string>) => void
  filter: string; setFilter: (f: string) => void
  onBack: () => void; onNext: () => void
}) {
  const totalSelected = selectedDatasetIds.size + selectedReportIds.size

  if (loading) return (
    <div className="flex flex-col items-center gap-4 py-16">
      <Spinner size="lg" />
      <p className="text-sm text-slate-600">Loading workspace items…</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-700">Select semantic models and reports</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter items…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white
                     focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
        />
      </div>
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {workspaceItems.map(wi => {
          const expanded = expandedWorkspaces.has(wi.workspace_id)
          const filteredDs = wi.datasets.filter(d => !filter || d.name.toLowerCase().includes(filter.toLowerCase()))
          const filteredRp = wi.reports.filter(r => !filter || r.name.toLowerCase().includes(filter.toLowerCase()))
          return (
            <div key={wi.workspace_id} className="rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => {
                  const next = new Set(expandedWorkspaces)
                  expanded ? next.delete(wi.workspace_id) : next.add(wi.workspace_id)
                  setExpandedWorkspaces(next)
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <Building2 className="h-4 w-4 text-indigo-500 shrink-0" />
                <span className="flex-1 text-sm font-semibold text-slate-800">Workspace</span>
                {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
              </button>
              {expanded && (
                <div className="px-4 py-3 space-y-1">
                  {filteredDs.map(d => (
                    <label key={d.id} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDatasetIds.has(d.id)}
                        onChange={e => {
                          const next = new Set(selectedDatasetIds)
                          e.target.checked ? next.add(d.id) : next.delete(d.id)
                          setSelectedDatasetIds(next)
                        }}
                        className="rounded border-slate-300 text-violet-600 focus:ring-violet-500/40"
                      />
                      <Database className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                      <span className="text-sm text-slate-700">{d.name}</span>
                    </label>
                  ))}
                  {filteredRp.map(r => (
                    <label key={r.id} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedReportIds.has(r.id)}
                        onChange={e => {
                          const next = new Set(selectedReportIds)
                          e.target.checked ? next.add(r.id) : next.delete(r.id)
                          setSelectedReportIds(next)
                        }}
                        className="rounded border-slate-300 text-violet-600 focus:ring-violet-500/40"
                      />
                      <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span className="text-sm text-slate-700">{r.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={totalSelected === 0}>
          Next <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
