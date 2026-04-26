import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Database, Mail, Lock, Eye, EyeOff, KeyRound, ArrowRight, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api, getApiErrorMessage } from '../api/client'

type Step = 'credentials' | 'mfa'

export default function LoginPage() {
  const { setToken } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.login({ email, password })
      if (res.data.mfa_required) {
        setStep('mfa')
      } else {
        setToken(res.data.access_token)
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleMFA(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.verifyMFA({ email, code: mfaCode })
      setToken(res.data.access_token)
      navigate('/', { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-zinc-950 relative overflow-hidden"
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(ellipse, rgba(245,158,11,0.25) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.3) 0%, transparent 70%)' }}
        />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-slide-up">
        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <div
            className="flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)',
              border: '1px solid rgba(245,158,11,0.25)',
              boxShadow: '0 0 32px rgba(245,158,11,0.12)',
            }}
          >
            <Database className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-3xl font-bold text-zinc-50 font-display tracking-tight">
            Source<span className="text-amber-400">SAT</span>
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5 tracking-wide">SQL Server Intelligence Platform</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(24, 24, 27, 0.8)',
            border: '1px solid rgba(63, 63, 70, 0.6)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {step === 'credentials' ? (
            <form onSubmit={handleCredentials} className="space-y-5">
              <div>
                <p className="text-lg font-semibold text-zinc-100 font-display mb-1">Welcome back</p>
                <p className="text-sm text-zinc-500">Sign in to your account to continue</p>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="form-label">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 pointer-events-none" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="form-input pl-10"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="form-input pl-10 pr-10"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
                style={{
                  background: loading ? 'rgba(245,158,11,0.7)' : '#f59e0b',
                  color: '#0a0a0b',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}
              >
                {loading ? 'Signing in…' : (
                  <>Sign in <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMFA} className="space-y-5">
              <div className="flex flex-col items-center text-center gap-3 mb-2">
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.2)',
                  }}
                >
                  <Shield className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <p className="text-base font-semibold text-zinc-100 font-display">Two-factor verification</p>
                  <p className="text-sm text-zinc-500 mt-1">
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>
              </div>

              <div>
                <label className="form-label text-center block">Verification code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    className="form-input pl-10 text-center tracking-[0.5em] font-mono text-lg"
                    placeholder="000000"
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
                style={{
                  background: '#f59e0b',
                  color: '#0a0a0b',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}
              >
                {loading ? 'Verifying…' : 'Verify code'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('credentials'); setMfaCode(''); setError('') }}
                className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors py-1"
              >
                ← Back to sign in
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-zinc-600 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-amber-400 font-medium hover:text-amber-300 transition-colors">
            Create account
          </Link>
        </p>
      </div>
    </div>
  )
}
