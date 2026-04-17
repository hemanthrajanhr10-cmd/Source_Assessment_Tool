import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, MonitorSmartphone, CheckCircle2, AlertCircle,
  Loader2, ExternalLink, Tag, ArrowRight, Copy,
  Building2, Database, FileText, Search,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type { FabricWorkspaceInfo } from '../types/api'
import Button from '../components/ui/Button'

// Step: start → waiting (device code) → picking (workspace selection) → naming → submitting
type Step = 'start' | 'waiting' | 'picking' | 'naming' | 'submitting'

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
  const [selectedIds, setSelectedIds]             = useState<Set<string>>(new Set())
  const [wsFilter, setWsFilter]                   = useState('')

  // Poll auth status while in 'waiting' step
  useEffect(() => {
    if (step !== 'waiting' || !authId) return
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.fabricAuthStatus(authId)
        if (data.status === 'ready') {
          clearInterval(pollRef.current!)
          // Auth done → fetch workspace list
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

  const toggleWorkspace = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const visible = filteredWorkspaces.map((w) => w.id)
    const allSelected = visible.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) visible.forEach((id) => next.delete(id))
      else visible.forEach((id) => next.add(id))
      return next
    })
  }

  const filteredWorkspaces = workspaces.filter((w) =>
    !wsFilter || w.name.toLowerCase().includes(wsFilter.toLowerCase())
  )

  const handleStartSession = async () => {
    if (!authId || selectedIds.size === 0) return
    setError(null)
    setStep('submitting')
    try {
      const { data } = await api.createFabricSession({
        auth_id: authId,
        label: label.trim() || undefined,
        workspace_ids: Array.from(selectedIds),
      })
      navigate(`/fabric/sessions/${data.fabric_session_id}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
      setStep('naming')
    }
  }

  const authDone = step === 'picking' || step === 'naming' || step === 'submitting'
  const selectionDone = step === 'naming' || step === 'submitting'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <Zap className="h-6 w-6 text-brand-600" />
          Fabric Workspace Assessment
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Assess Power BI / Fabric workspaces — semantic models, reports, measures, and complexity.
        </p>
      </div>

      <div className="space-y-5">

        {/* ── Step 1 — Sign in ─────────────────────────────────────────────── */}
        <div className={`card overflow-hidden border-2 transition-colors ${
          !authDone ? 'border-brand-200' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
            <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold
              ${authDone ? 'bg-emerald-500 text-white' : 'bg-brand-600 text-white'}`}>
              {authDone ? <CheckCircle2 className="h-4 w-4" /> : '1'}
            </span>
            <h2 className="text-sm font-semibold text-slate-800">Sign in with Microsoft</h2>
          </div>
          <div className="p-6">
            {step === 'start' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Click below to start a secure Microsoft device-code login. You will be given a short
                  code to enter at <strong>microsoft.com/devicelogin</strong>.
                  No passwords are stored — the token is held in memory only for this session.
                </p>
                <Button leftIcon={<MonitorSmartphone className="h-4 w-4" />} onClick={handleStartAuth}>
                  Connect to Microsoft Fabric
                </Button>
              </div>
            )}

            {step === 'waiting' && !userCode && (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                Requesting device code from Microsoft…
              </div>
            )}

            {step === 'waiting' && userCode && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Open the link below in any browser and enter the code to authenticate:
                </p>
                <a
                  href={verificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  {verificationUrl}
                </a>
                <div className="flex items-center gap-3">
                  <div className="flex-1 rounded-xl border-2 border-brand-200 bg-brand-50 px-5 py-3 text-center">
                    <p className="text-xs text-brand-600 font-medium mb-0.5">Your code</p>
                    <p className="text-2xl font-mono font-bold tracking-widest text-brand-800">{userCode}</p>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for you to sign in…
                  {expiresAt && (
                    <span className="text-xs text-slate-400">
                      (expires {new Date(expiresAt).toLocaleTimeString()})
                    </span>
                  )}
                </div>
              </div>
            )}

            {authDone && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Successfully authenticated with Microsoft
              </div>
            )}
          </div>
        </div>

        {/* ── Step 2 — Select Workspaces ───────────────────────────────────── */}
        {(step === 'picking' || selectionDone) && (
          <div className={`card overflow-hidden border-2 transition-colors ${
            !selectionDone ? 'border-brand-200' : 'border-slate-100'
          }`}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold
                ${selectionDone ? 'bg-emerald-500 text-white' : 'bg-brand-600 text-white'}`}>
                {selectionDone ? <CheckCircle2 className="h-4 w-4" /> : '2'}
              </span>
              <h2 className="text-sm font-semibold text-slate-800">Select Workspaces to Assess</h2>
              {selectedIds.size > 0 && (
                <span className="ml-auto text-xs text-brand-600 font-medium">
                  {selectedIds.size} selected
                </span>
              )}
            </div>

            <div className="p-6 space-y-4">
              {workspacesLoading ? (
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-400" />
                  Loading accessible workspaces…
                </div>
              ) : selectionDone ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {selectedIds.size} workspace{selectedIds.size !== 1 ? 's' : ''} selected
                </div>
              ) : (
                <>
                  {workspaces.length === 0 ? (
                    <p className="text-sm text-slate-500">No accessible workspaces found for this account.</p>
                  ) : (
                    <>
                      {/* Search + select-all row */}
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            className="form-input pl-9 py-1.5 text-sm"
                            placeholder="Filter workspaces…"
                            value={wsFilter}
                            onChange={(e) => setWsFilter(e.target.value)}
                          />
                        </div>
                        <button
                          onClick={toggleAll}
                          className="shrink-0 text-xs text-brand-600 hover:underline font-medium"
                        >
                          {filteredWorkspaces.every((w) => selectedIds.has(w.id))
                            ? 'Deselect all'
                            : 'Select all'}
                        </button>
                      </div>

                      {/* Workspace list */}
                      <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                        {filteredWorkspaces.map((ws) => (
                          <label
                            key={ws.id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                              checked={selectedIds.has(ws.id)}
                              onChange={() => toggleWorkspace(ws.id)}
                            />
                            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{ws.name}</p>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
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
                          <div className="px-4 py-6 text-center text-sm text-slate-400">
                            No workspaces match "{wsFilter}"
                          </div>
                        )}
                      </div>

                      <Button
                        disabled={selectedIds.size === 0}
                        rightIcon={<ArrowRight className="h-4 w-4" />}
                        onClick={() => setStep('naming')}
                      >
                        Continue with {selectedIds.size || '…'} workspace{selectedIds.size !== 1 ? 's' : ''}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3 — Label & Run ─────────────────────────────────────────── */}
        {selectionDone && (
          <div className="card overflow-hidden border-2 border-brand-200">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <span className="flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold bg-brand-600 text-white">
                3
              </span>
              <h2 className="text-sm font-semibold text-slate-800">Label & Start Assessment</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="form-label">Assessment Label</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    className="form-input pl-10"
                    placeholder="e.g. Contoso — Fabric Assessment Q2 2026"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={200}
                    disabled={step === 'submitting'}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">Optional. Used as the session name.</p>
              </div>
              <p className="text-sm text-slate-600">
                Will assess <strong>{selectedIds.size} workspace{selectedIds.size !== 1 ? 's' : ''}</strong> —
                collecting semantic models, reports, measures, calculated tables, and columns.
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
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
