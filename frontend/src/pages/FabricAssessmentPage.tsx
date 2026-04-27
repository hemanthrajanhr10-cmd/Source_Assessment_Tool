import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, MonitorSmartphone, CheckCircle2, AlertCircle,
  Loader2, ExternalLink, Tag, ArrowRight, Copy,
  Building2, Database, FileText, Search, ChevronDown, ChevronRight,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { FabricWorkspaceInfo, FabricWorkspaceItems } from '../types/api'
import Button from '../components/ui/Button'
import { formatTime } from '../utils/dateTime'

// Steps: start → waiting (device code) → picking (workspaces) → picking-items (models & reports) → naming → submitting
type Step = 'start' | 'waiting' | 'picking' | 'picking-items' | 'naming' | 'submitting'

export default function FabricAssessmentPage() {
  const navigate = useNavigate()
  const [step, setStep]           = useState<Step>('start')
  const [authId, setAuthId]       = useState('')
  const [userCode, setUserCode]   = useState('')
  const [verificationUrl, setVerificationUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [label, setLabel]         = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Workspace selection state
  const [workspaces, setWorkspaces]               = useState<FabricWorkspaceInfo[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [selectedWsIds, setSelectedWsIds]         = useState<Set<string>>(new Set())
  const [wsFilter, setWsFilter]                   = useState('')

  // Model & Report selection state
  const [workspaceItems, setWorkspaceItems]             = useState<FabricWorkspaceItems[]>([])
  const [itemsLoading, setItemsLoading]                 = useState(false)
  const [selectedDatasetIds, setSelectedDatasetIds]     = useState<Set<string>>(new Set())
  const [selectedReportIds, setSelectedReportIds]       = useState<Set<string>>(new Set())
  const [itemFilter, setItemFilter]                     = useState('')
  const [expandedWorkspaces, setExpandedWorkspaces]     = useState<Set<string>>(new Set())

  // Poll auth status while in 'waiting' step
  useEffect(() => {
    if (step !== 'waiting' || !authId) return
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.fabricAuthStatus(authId)
        if (data.status === 'ready') {
          clearInterval(pollRef.current!)
          await fetchWorkspaces(authId)
        } else if (data.status === 'error') {
          clearInterval(pollRef.current!)
          setError(data.error || 'Authentication failed')
          setStep('start')
        }
      } catch { /* ignore transient */ }
    }, 3000)
    return () => clearInterval(pollRef.current!)
  }, [step, authId])

  const fetchWorkspaces = async (id: string) => {
    setWorkspacesLoading(true)
    setStep('picking')
    try {
      const { data } = await api.fabricListWorkspaces(id)
      setWorkspaces(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setWorkspacesLoading(false)
    }
  }

  const fetchWorkspaceItems = async () => {
    setItemsLoading(true)
    setStep('picking-items')
    setItemFilter('')
    try {
      const { data } = await api.fabricListWorkspaceItems(authId, Array.from(selectedWsIds))
      setWorkspaceItems(data)
      // Auto-select all items
      const allDatasets = new Set(data.flatMap(w => w.datasets.map(d => d.id)))
      const allReports  = new Set(data.flatMap(w => w.reports.map(r => r.id)))
      setSelectedDatasetIds(allDatasets)
      setSelectedReportIds(allReports)
      // Expand all workspaces by default
      setExpandedWorkspaces(new Set(data.map(w => w.workspace_id)))
    } catch (err) {
      setError(getApiErrorMessage(err))
      setStep('picking')
    } finally {
      setItemsLoading(false)
    }
  }

  const handleStartAuth = async () => {
    setError(null)
    setStep('waiting')
    try {
      const { data } = await api.fabricAuthStart()
      setAuthId(data.auth_id)
      setUserCode(data.user_code)
      setVerificationUrl(data.verification_url)
      setExpiresAt(data.expires_at)
    } catch (err) {
      setError(getApiErrorMessage(err))
      setStep('start')
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(userCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Workspace selection helpers ────────────────────────────────────────────
  const filteredWorkspaces = workspaces.filter(
    w => !wsFilter || w.name.toLowerCase().includes(wsFilter.toLowerCase())
  )

  const toggleWorkspace = (id: string) => {
    setSelectedWsIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllWorkspaces = () => {
    const visible = filteredWorkspaces.map(w => w.id)
    const allSelected = visible.every(id => selectedWsIds.has(id))
    setSelectedWsIds(prev => {
      const next = new Set(prev)
      if (allSelected) visible.forEach(id => next.delete(id))
      else visible.forEach(id => next.add(id))
      return next
    })
  }

  // ── Model / Report selection helpers ──────────────────────────────────────
  const wsNameMap = Object.fromEntries(workspaces.map(w => [w.id, w.name]))

  const filteredItems = workspaceItems.map(ws => ({
    ...ws,
    datasets: ws.datasets.filter(
      d => !itemFilter || d.name.toLowerCase().includes(itemFilter.toLowerCase())
    ),
    reports: ws.reports.filter(
      r => !itemFilter || r.name.toLowerCase().includes(itemFilter.toLowerCase())
    ),
  })).filter(ws => ws.datasets.length > 0 || ws.reports.length > 0)

  const toggleDataset = (id: string) => {
    setSelectedDatasetIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleReport = (id: string) => {
    setSelectedReportIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleWorkspaceDatasets = (ws: FabricWorkspaceItems) => {
    const ids = ws.datasets.map(d => d.id)
    const allSelected = ids.every(id => selectedDatasetIds.has(id))
    setSelectedDatasetIds(prev => {
      const next = new Set(prev)
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  const toggleWorkspaceReports = (ws: FabricWorkspaceItems) => {
    const ids = ws.reports.map(r => r.id)
    const allSelected = ids.every(id => selectedReportIds.has(id))
    setSelectedReportIds(prev => {
      const next = new Set(prev)
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  const toggleAllItems = () => {
    const allDs  = workspaceItems.flatMap(w => w.datasets.map(d => d.id))
    const allRpt = workspaceItems.flatMap(w => w.reports.map(r => r.id))
    const allSelected =
      allDs.every(id => selectedDatasetIds.has(id)) &&
      allRpt.every(id => selectedReportIds.has(id))
    if (allSelected) {
      setSelectedDatasetIds(new Set())
      setSelectedReportIds(new Set())
    } else {
      setSelectedDatasetIds(new Set(allDs))
      setSelectedReportIds(new Set(allRpt))
    }
  }

  const toggleWsExpand = (wsId: string) => {
    setExpandedWorkspaces(prev => {
      const next = new Set(prev)
      next.has(wsId) ? next.delete(wsId) : next.add(wsId)
      return next
    })
  }

  const totalItems = workspaceItems.reduce(
    (acc, ws) => acc + ws.datasets.length + ws.reports.length, 0
  )
  const totalAllDs  = workspaceItems.flatMap(w => w.datasets.map(d => d.id))
  const totalAllRpt = workspaceItems.flatMap(w => w.reports.map(r => r.id))
  const allItemsSelected =
    totalAllDs.every(id => selectedDatasetIds.has(id)) &&
    totalAllRpt.every(id => selectedReportIds.has(id))

  const selectedItemCount = selectedDatasetIds.size + selectedReportIds.size

  const handleStartSession = async () => {
    if (!authId || selectedWsIds.size === 0) return
    setError(null)
    setStep('submitting')
    try {
      const { data } = await api.createFabricSession({
        auth_id:      authId,
        label:        label.trim() || undefined,
        workspace_ids: Array.from(selectedWsIds),
        dataset_ids:   Array.from(selectedDatasetIds),
        report_ids:    Array.from(selectedReportIds),
      })
      navigate(`/fabric/sessions/${data.fabric_session_id}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
      setStep('naming')
    }
  }

  const authDone        = step !== 'start' && step !== 'waiting'
  const wsDone          = step === 'picking-items' || step === 'naming' || step === 'submitting'
  const itemsDone       = step === 'naming' || step === 'submitting'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-50 font-display flex items-center gap-2.5">
          <Zap className="h-6 w-6 text-amber-400" />
          Fabric Workspace Assessment
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Assess Power BI / Fabric workspaces — semantic models, reports, measures, and complexity.
        </p>
      </div>

      <div className="space-y-5">

        {/* ── Step 1 — Sign in ─────────────────────────────────────────────── */}
        <div className={`card overflow-hidden border-2 transition-colors ${
          !authDone ? 'border-amber-500/30' : 'border-zinc-800/70'
        }`}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800/60 bg-zinc-900/60">
            <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold
              ${authDone ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-zinc-950'}`}>
              {authDone ? <CheckCircle2 className="h-4 w-4" /> : '1'}
            </span>
            <h2 className="text-sm font-semibold text-zinc-100">Sign in with Microsoft</h2>
          </div>
          <div className="p-6">
            {step === 'start' && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Click below to start a secure Microsoft device-code login. You will be given a short
                  code to enter at <strong className="text-zinc-300">microsoft.com/devicelogin</strong>.
                  No passwords are stored — the token is held in memory only for this session.
                </p>
                <Button leftIcon={<MonitorSmartphone className="h-4 w-4" />} onClick={handleStartAuth}>
                  Connect to Microsoft Fabric
                </Button>
              </div>
            )}

            {step === 'waiting' && !userCode && (
              <div className="flex items-center gap-3 text-sm text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                Requesting device code from Microsoft…
              </div>
            )}

            {step === 'waiting' && userCode && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Open the link below in any browser and enter the code to authenticate:
                </p>
                <a
                  href={verificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm font-medium text-amber-400 hover:text-amber-300 hover:underline transition-colors"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  {verificationUrl}
                </a>
                <div className="flex items-center gap-3">
                  <div className="flex-1 rounded-xl border-2 border-amber-500/30 bg-amber-500/5 px-5 py-3 text-center">
                    <p className="text-xs text-amber-500/70 font-medium mb-0.5">Your code</p>
                    <p className="text-2xl font-mono font-bold tracking-widest text-amber-400">{userCode}</p>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for you to sign in…
                  {expiresAt && (
                    <span className="text-xs text-zinc-600">
                      (expires {formatTime(expiresAt)})
                    </span>
                  )}
                </div>
              </div>
            )}

            {authDone && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Successfully authenticated with Microsoft
              </div>
            )}
          </div>
        </div>

        {/* ── Step 2 — Select Workspaces ───────────────────────────────────── */}
        {(step === 'picking' || wsDone) && (
          <div className={`card overflow-hidden border-2 transition-colors ${
            !wsDone ? 'border-amber-500/30' : 'border-zinc-800/70'
          }`}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800/60 bg-zinc-900/60">
              <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold
                ${wsDone ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-zinc-950'}`}>
                {wsDone ? <CheckCircle2 className="h-4 w-4" /> : '2'}
              </span>
              <h2 className="text-sm font-semibold text-zinc-100">Select Workspaces</h2>
              {selectedWsIds.size > 0 && (
                <span className="ml-auto text-xs text-amber-400 font-medium">
                  {selectedWsIds.size} selected
                </span>
              )}
            </div>

            <div className="p-6 space-y-4">
              {workspacesLoading ? (
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                  Loading accessible workspaces…
                </div>
              ) : wsDone ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {selectedWsIds.size} workspace{selectedWsIds.size !== 1 ? 's' : ''} selected
                </div>
              ) : (
                <>
                  {workspaces.length === 0 ? (
                    <p className="text-sm text-zinc-500">No accessible workspaces found for this account.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                          <input
                            type="text"
                            className="form-input pl-9 py-1.5 text-sm"
                            placeholder="Filter workspaces…"
                            value={wsFilter}
                            onChange={e => setWsFilter(e.target.value)}
                          />
                        </div>
                        <button
                          onClick={toggleAllWorkspaces}
                          className="shrink-0 text-xs text-amber-400 hover:text-amber-300 hover:underline font-medium transition-colors"
                        >
                          {filteredWorkspaces.every(w => selectedWsIds.has(w.id))
                            ? 'Deselect all'
                            : 'Select all'}
                        </button>
                      </div>

                      <div className="max-h-72 overflow-y-auto rounded-xl border border-zinc-800/50 divide-y divide-zinc-800/40">
                        {filteredWorkspaces.map(ws => (
                          <label
                            key={ws.id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-zinc-600 text-amber-500 focus:ring-amber-500/50 bg-zinc-800"
                              checked={selectedWsIds.has(ws.id)}
                              onChange={() => toggleWorkspace(ws.id)}
                            />
                            <Building2 className="h-4 w-4 text-zinc-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-200 truncate">{ws.name}</p>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
                                <span className="flex items-center gap-1">
                                  <Database className="h-3 w-3" />
                                  {ws.dataset_count} model{ws.dataset_count !== 1 ? 's' : ''}
                                </span>
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {ws.report_count} report{ws.report_count !== 1 ? 's' : ''}
                                </span>
                                {ws.state !== 'Active' && (
                                  <span className="text-amber-500">{ws.state}</span>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}

                        {filteredWorkspaces.length === 0 && (
                          <div className="px-4 py-6 text-center text-sm text-zinc-600">
                            No workspaces match "{wsFilter}"
                          </div>
                        )}
                      </div>

                      <Button
                        disabled={selectedWsIds.size === 0}
                        loading={itemsLoading}
                        rightIcon={<ArrowRight className="h-4 w-4" />}
                        onClick={fetchWorkspaceItems}
                      >
                        Continue with {selectedWsIds.size || '…'} workspace{selectedWsIds.size !== 1 ? 's' : ''}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3 — Select Models & Reports ────────────────────────────── */}
        {(step === 'picking-items' || itemsDone) && (
          <div className={`card overflow-hidden border-2 transition-colors ${
            !itemsDone ? 'border-amber-500/30' : 'border-zinc-800/70'
          }`}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800/60 bg-zinc-900/60">
              <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold
                ${itemsDone ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-zinc-950'}`}>
                {itemsDone ? <CheckCircle2 className="h-4 w-4" /> : '3'}
              </span>
              <h2 className="text-sm font-semibold text-zinc-100">Select Models &amp; Reports</h2>
              {selectedItemCount > 0 && (
                <span className="ml-auto text-xs text-amber-400 font-medium">
                  {selectedDatasetIds.size} model{selectedDatasetIds.size !== 1 ? 's' : ''},{' '}
                  {selectedReportIds.size} report{selectedReportIds.size !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="p-6 space-y-4">
              {itemsLoading ? (
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                  Loading models and reports…
                </div>
              ) : itemsDone ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {selectedDatasetIds.size} model{selectedDatasetIds.size !== 1 ? 's' : ''} and{' '}
                  {selectedReportIds.size} report{selectedReportIds.size !== 1 ? 's' : ''} selected
                </div>
              ) : (
                <>
                  {totalItems === 0 ? (
                    <p className="text-sm text-zinc-500">No models or reports found in the selected workspaces.</p>
                  ) : (
                    <>
                      {/* Search + global toggle */}
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                          <input
                            type="text"
                            className="form-input pl-9 py-1.5 text-sm"
                            placeholder="Filter models and reports…"
                            value={itemFilter}
                            onChange={e => setItemFilter(e.target.value)}
                          />
                        </div>
                        <button
                          onClick={toggleAllItems}
                          className="shrink-0 text-xs text-amber-400 hover:text-amber-300 hover:underline font-medium transition-colors"
                        >
                          {allItemsSelected ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>

                      {/* Workspace-grouped item list */}
                      <div className="max-h-96 overflow-y-auto rounded-xl border border-zinc-800/50 divide-y divide-zinc-800/40">
                        {filteredItems.map(ws => {
                          const wsName     = wsNameMap[ws.workspace_id] || ws.workspace_id
                          const expanded   = expandedWorkspaces.has(ws.workspace_id)
                          const dsSelected = ws.datasets.filter(d => selectedDatasetIds.has(d.id)).length
                          const rptSelected = ws.reports.filter(r => selectedReportIds.has(r.id)).length

                          return (
                            <div key={ws.workspace_id}>
                              {/* Workspace header row */}
                              <button
                                className="w-full flex items-center gap-2 px-4 py-2.5 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors text-left"
                                onClick={() => toggleWsExpand(ws.workspace_id)}
                              >
                                {expanded
                                  ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                                }
                                <Building2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                                <span className="flex-1 text-xs font-semibold text-zinc-300 truncate">{wsName}</span>
                                <span className="text-xs text-zinc-600">
                                  {dsSelected}/{ws.datasets.length} models · {rptSelected}/{ws.reports.length} reports
                                </span>
                              </button>

                              {expanded && (
                                <div className="divide-y divide-zinc-800/30">
                                  {/* Models sub-section */}
                                  {ws.datasets.length > 0 && (
                                    <div>
                                      <div className="flex items-center gap-2 px-5 py-1.5 bg-zinc-900/40">
                                        <Database className="h-3 w-3 text-amber-500/70 shrink-0" />
                                        <span className="text-xs font-medium text-zinc-500 flex-1">Semantic Models</span>
                                        <button
                                          onClick={() => toggleWorkspaceDatasets(ws)}
                                          className="text-xs text-amber-400 hover:text-amber-300 hover:underline transition-colors"
                                        >
                                          {ws.datasets.every(d => selectedDatasetIds.has(d.id)) ? 'Deselect' : 'Select'} all
                                        </button>
                                      </div>
                                      {ws.datasets.filter(d =>
                                        !itemFilter || d.name.toLowerCase().includes(itemFilter.toLowerCase())
                                      ).map(ds => (
                                        <label
                                          key={ds.id}
                                          className="flex items-center gap-3 px-6 py-2 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                                        >
                                          <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5 rounded border-zinc-600 text-amber-500 focus:ring-amber-500/50 bg-zinc-800"
                                            checked={selectedDatasetIds.has(ds.id)}
                                            onChange={() => toggleDataset(ds.id)}
                                          />
                                          <span className="text-sm text-zinc-300 truncate">{ds.name}</span>
                                        </label>
                                      ))}
                                    </div>
                                  )}

                                  {/* Reports sub-section */}
                                  {ws.reports.length > 0 && (
                                    <div>
                                      <div className="flex items-center gap-2 px-5 py-1.5 bg-zinc-900/40">
                                        <FileText className="h-3 w-3 text-indigo-400/70 shrink-0" />
                                        <span className="text-xs font-medium text-zinc-500 flex-1">Reports</span>
                                        <button
                                          onClick={() => toggleWorkspaceReports(ws)}
                                          className="text-xs text-amber-400 hover:text-amber-300 hover:underline transition-colors"
                                        >
                                          {ws.reports.every(r => selectedReportIds.has(r.id)) ? 'Deselect' : 'Select'} all
                                        </button>
                                      </div>
                                      {ws.reports.filter(r =>
                                        !itemFilter || r.name.toLowerCase().includes(itemFilter.toLowerCase())
                                      ).map(rpt => (
                                        <label
                                          key={rpt.id}
                                          className="flex items-center gap-3 px-6 py-2 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                                        >
                                          <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5 rounded border-zinc-600 text-amber-500 focus:ring-amber-500/50 bg-zinc-800"
                                            checked={selectedReportIds.has(rpt.id)}
                                            onChange={() => toggleReport(rpt.id)}
                                          />
                                          <span className="flex-1 text-sm text-zinc-300 truncate">{rpt.name}</span>
                                          {rpt.report_type === 'PaginatedReport' && (
                                            <span className="text-xs text-zinc-600 shrink-0">Paginated</span>
                                          )}
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {filteredItems.length === 0 && (
                          <div className="px-4 py-6 text-center text-sm text-zinc-600">
                            No items match "{itemFilter}"
                          </div>
                        )}
                      </div>

                      <Button
                        disabled={selectedItemCount === 0}
                        rightIcon={<ArrowRight className="h-4 w-4" />}
                        onClick={() => setStep('naming')}
                      >
                        Continue with {selectedDatasetIds.size} model{selectedDatasetIds.size !== 1 ? 's' : ''}{' '}
                        &amp; {selectedReportIds.size} report{selectedReportIds.size !== 1 ? 's' : ''}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Step 4 — Label & Run ─────────────────────────────────────────── */}
        {itemsDone && (
          <div className="card overflow-hidden border-2 border-amber-500/30">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800/60 bg-zinc-900/60">
              <span className="flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold bg-amber-500 text-zinc-950">
                4
              </span>
              <h2 className="text-sm font-semibold text-zinc-100">Label &amp; Start Assessment</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="form-label">Assessment Label</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    className="form-input pl-10"
                    placeholder="e.g. Contoso — Fabric Assessment Q2 2026"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    maxLength={200}
                    disabled={step === 'submitting'}
                  />
                </div>
                <p className="mt-1 text-xs text-zinc-600">Optional. Used as the session name.</p>
              </div>
              <p className="text-sm text-zinc-400">
                Will assess{' '}
                <strong className="text-zinc-200">{selectedDatasetIds.size} semantic model{selectedDatasetIds.size !== 1 ? 's' : ''}</strong>{' '}
                and{' '}
                <strong className="text-zinc-200">{selectedReportIds.size} report{selectedReportIds.size !== 1 ? 's' : ''}</strong>{' '}
                across <strong className="text-zinc-200">{selectedWsIds.size} workspace{selectedWsIds.size !== 1 ? 's' : ''}</strong>.
              </p>
              <Button
                size="lg"
                loading={step === 'submitting'}
                rightIcon={<ArrowRight className="h-4 w-4" />}
                onClick={handleStartSession}
                className="w-full justify-center"
              >
                {step === 'submitting' ? 'Starting assessment…' : 'Run Fabric Assessment'}
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
