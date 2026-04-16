import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, MonitorSmartphone, CheckCircle2, AlertCircle,
  Loader2, ExternalLink, Tag, ArrowRight, Copy,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import Button from '../components/ui/Button'

type Step = 'start' | 'waiting' | 'naming' | 'submitting'

export default function FabricAssessmentPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('start')
  const [authId, setAuthId] = useState('')
  const [userCode, setUserCode] = useState('')
  const [verificationUrl, setVerificationUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll auth status while in 'waiting' step
  useEffect(() => {
    if (step !== 'waiting' || !authId) return
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.fabricAuthStatus(authId)
        if (data.status === 'ready') {
          clearInterval(pollRef.current!)
          setStep('naming')
        } else if (data.status === 'error') {
          clearInterval(pollRef.current!)
          setError(data.error || 'Authentication failed')
          setStep('start')
        }
      } catch { /* ignore transient */ }
    }, 3000)
    return () => clearInterval(pollRef.current!)
  }, [step, authId])

  const handleStartAuth = async () => {
    setError(null)
    setStep('waiting') // optimistic — show spinner while device code loads
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

  const handleStartSession = async () => {
    if (!authId) return
    setError(null)
    setStep('submitting')
    try {
      const { data } = await api.createFabricSession({ auth_id: authId, label: label.trim() || undefined })
      navigate(`/fabric/sessions/${data.fabric_session_id}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
      setStep('naming')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <Zap className="h-6 w-6 text-brand-600" />
          Fabric Workspace Assessment
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Assess Power BI / Fabric workspaces — semantic models, reports, paginated reports, and complexity.
        </p>
      </div>

      <div className="space-y-5">

        {/* ── Step 1 — Connect ─────────────────────────────────────────────── */}
        <div className={`card overflow-hidden border-2 transition-colors ${
          step === 'start' ? 'border-brand-200' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
            <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold
              ${step !== 'start' ? 'bg-emerald-500 text-white' : 'bg-brand-600 text-white'}`}>
              {step !== 'start' ? <CheckCircle2 className="h-4 w-4" /> : '1'}
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
                <Button
                  leftIcon={<MonitorSmartphone className="h-4 w-4" />}
                  onClick={handleStartAuth}
                >
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
                {/* Verification URL */}
                <a
                  href={verificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-800 hover:underline"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  {verificationUrl}
                </a>
                {/* Code display */}
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

            {(step === 'naming' || step === 'submitting') && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Successfully authenticated with Microsoft
              </div>
            )}
          </div>
        </div>

        {/* ── Step 2 — Name & Run ──────────────────────────────────────────── */}
        {(step === 'naming' || step === 'submitting') && (
          <div className="card overflow-hidden border-2 border-brand-200">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <span className="flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold bg-brand-600 text-white">
                2
              </span>
              <h2 className="text-sm font-semibold text-slate-800">Name & Start Assessment</h2>
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
                <p className="mt-1 text-xs text-slate-400">Optional. Used as the client name in the report.</p>
              </div>
              <p className="text-sm text-slate-600">
                The assessment will scan all Fabric workspaces accessible to the signed-in account and
                collect semantic models, reports, paginated reports, measures, calculated tables, and
                calculated columns.
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
