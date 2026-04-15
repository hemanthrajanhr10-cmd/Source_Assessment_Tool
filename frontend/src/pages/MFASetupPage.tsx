import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Copy, Check } from 'lucide-react'
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-brand-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-600">
        Failed to generate MFA secret. Please try again.
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">MFA Enabled</h2>
        <p className="text-slate-500 mt-2">Redirecting to dashboard…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-md mb-3">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Set up two-factor authentication</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            Scan the QR code below with Google Authenticator or Authy.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
          {/* Step 1: QR Code */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">
              1. Scan this QR code with your authenticator app
            </p>
            <div className="flex justify-center">
              <img
                src={data.qr_code}
                alt="TOTP QR Code"
                className="h-48 w-48 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          {/* Manual entry */}
          <div>
            <p className="text-sm text-slate-500 mb-2">Or enter the secret manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">
                {data.secret}
              </code>
              <button
                onClick={copySecret}
                className="shrink-0 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors"
                title="Copy secret"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Step 2: Verify */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">
              2. Enter the 6-digit code to confirm
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
              className="w-full text-center tracking-[0.5em] py-2.5 text-lg font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="000000"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={() => confirm.mutate()}
            disabled={code.length !== 6 || confirm.isPending}
            className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {confirm.isPending ? 'Verifying…' : 'Enable MFA'}
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full text-sm text-slate-500 hover:text-slate-700"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
