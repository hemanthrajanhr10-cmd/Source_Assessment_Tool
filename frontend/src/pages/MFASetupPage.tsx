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
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-red-400">
        Failed to generate MFA secret. Please try again.
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-center">
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          <Check className="h-8 w-8 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100 font-display">MFA Enabled</h2>
        <p className="text-zinc-500 mt-2">Redirecting to dashboard…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(ellipse, rgba(245,158,11,0.4) 0%, transparent 70%)' }}
        />
      </div>

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="flex flex-col items-center mb-8">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)',
            }}
          >
            <Shield className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-50 font-display">Two-factor authentication</h1>
          <p className="text-sm text-zinc-500 mt-1.5 text-center max-w-xs">
            Scan the QR code with Google Authenticator or Authy to secure your account.
          </p>
        </div>

        <div
          className="rounded-2xl p-8 space-y-6"
          style={{
            background: 'rgba(24, 24, 27, 0.8)',
            border: '1px solid rgba(63, 63, 70, 0.6)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Step 1: QR Code */}
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
              Step 1 — Scan QR code
            </p>
            <div className="flex justify-center">
              <div
                className="p-3 rounded-xl"
                style={{ background: '#fff' }}
              >
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
            <p className="text-xs text-zinc-500 mb-2">Or enter the secret manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-zinc-950/80 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-400 break-all">
                {data.secret}
              </code>
              <button
                onClick={copySecret}
                className="shrink-0 p-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Copy secret"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Step 2: Verify */}
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
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
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={() => confirm.mutate()}
            disabled={code.length !== 6 || confirm.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
            style={{
              background: '#f59e0b',
              color: '#0a0a0b',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            {confirm.isPending ? 'Enabling MFA…' : (
              <>Enable MFA <ArrowRight className="h-4 w-4" /></>
            )}
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full text-sm text-zinc-600 hover:text-zinc-400 transition-colors py-1"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
