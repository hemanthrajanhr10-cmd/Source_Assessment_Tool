import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Copy, Check, ArrowRight } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, getApiErrorMessage } from '../api/client'

export default function MFASetupPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['setup-mfa'],
    queryFn: () => api.setupMFA().then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const confirm = useMutation({
    mutationFn: () => api.confirmMFA(code),
    onSuccess: () => {
      setSuccess(true)
      setTimeout(() => navigate('/'), 2000)
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  function copySecret() {
    if (data?.secret) {
      navigator.clipboard.writeText(data.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin h-8 w-8 border-2 border-earth-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-red-600 text-sm">
        Failed to generate MFA secret. Please try again.
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-center">
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'rgba(5,150,105,0.1)', border: '1.5px solid rgba(5,150,105,0.25)' }}
        >
          <Check className="h-8 w-8 text-earth-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 font-display">MFA Enabled</h2>
        <p className="text-slate-500 mt-2 text-sm">Redirecting to dashboard…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-slide-up">
        <div className="flex flex-col items-center mb-8">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: 'rgba(0,86,179,0.07)',
              border: '1.5px solid rgba(0,86,179,0.22)',
            }}
          >
            <Shield className="h-7 w-7 text-earth-700" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Two-factor authentication</h1>
          <p className="text-sm text-slate-500 mt-1.5 text-center max-w-xs">
            Scan the QR code with Google Authenticator or Authy to secure your account.
          </p>
        </div>

        <div
          className="rounded-2xl bg-white border border-slate-200 p-8 space-y-6"
          style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)' }}
        >
          {/* Step 1: QR Code */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              Step 1 — Scan QR code
            </p>
            <div className="flex justify-center">
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <img
                  src={data.qr_code}
                  alt="TOTP QR Code"
                  className="h-44 w-44"
                />
              </div>
            </div>
          </div>

          {/* Manual entry */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Or enter the secret manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 break-all">
                {data.secret}
              </code>
              <button
                onClick={copySecret}
                className="shrink-0 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors"
                title="Copy secret"
              >
                {copied ? <Check className="h-4 w-4 text-earth-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Step 2: Verify */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              Step 2 — Enter verification code
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
              className="form-input text-center tracking-[0.5em] text-lg font-mono"
              placeholder="000000"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={() => confirm.mutate()}
            disabled={code.length !== 6 || confirm.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold
                       bg-earth-700 text-white hover:bg-earth-800
                       transition-all duration-200 disabled:opacity-50 active:scale-[0.98]
                       shadow-sm hover:shadow-md hover:shadow-earth-200/60"
          >
            {confirm.isPending ? 'Enabling MFA…' : (
              <>Enable MFA <ArrowRight className="h-4 w-4" /></>
            )}
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors py-1"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
