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
    <div className="min-h-screen flex bg-white">
      {/* Left panel — brand/illustration */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-5/12 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)',
        }}
      >
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, rgba(255,255,255,1) 1px, transparent 1px),
                              radial-gradient(circle at 75% 75%, rgba(255,255,255,1) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center h-10 w-10 rounded-xl"
              style={{
                background: 'rgba(245,158,11,0.15)',
                border: '1.5px solid rgba(245,158,11,0.35)',
              }}
            >
              <Database className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-base font-bold text-white font-display tracking-tight">
                Source<span className="text-amber-400">SAT</span>
              </p>
              <p className="text-[10px] text-indigo-300 uppercase tracking-widest">Assessment Tool</p>
            </div>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-white font-display leading-tight">
              SQL Server<br />Intelligence Platform
            </h1>
            <p className="text-indigo-200 text-sm leading-relaxed max-w-xs">
              Automated database discovery and migration readiness assessment across SQL Server estates and Microsoft Fabric workspaces.
            </p>
          </div>

          <div className="space-y-3">
            {[
              '25+ assessment dimensions',
              'Schema complexity scoring',
              'PII indicator scanning',
              'Professional Excel reports',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-sm text-indigo-100">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="relative z-10 text-xs text-indigo-400 tracking-wide">
          UBTI — Unified Business Technology Intelligence
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-slate-50">
        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center h-12 w-12 rounded-2xl mb-3"
            style={{
              background: 'rgba(245,158,11,0.1)',
              border: '1.5px solid rgba(245,158,11,0.25)',
            }}
          >
            <Database className="h-6 w-6 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            Source<span className="text-amber-500">SAT</span>
          </h1>
        </div>

        <div className="w-full max-w-sm animate-slide-up">
          {step === 'credentials' ? (
            <div>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 font-display">Welcome back</h2>
                <p className="text-sm text-slate-500 mt-1">Sign in to your account to continue</p>
              </div>

              <form onSubmit={handleCredentials} className="space-y-5">
                <div>
                  <label className="form-label">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
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
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold
                             bg-indigo-600 text-white hover:bg-indigo-700
                             transition-all duration-200 disabled:opacity-50 active:scale-[0.98]
                             shadow-sm hover:shadow-md hover:shadow-indigo-200/60"
                >
                  {loading ? 'Signing in…' : (
                    <>Sign in <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-slate-500 mt-8">
                Don't have an account?{' '}
                <Link to="/register" className="text-indigo-600 font-medium hover:text-indigo-700 transition-colors">
                  Create account
                </Link>
              </p>
            </div>
          ) : (
            <div>
              <div className="flex flex-col items-center text-center mb-8">
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{
                    background: 'rgba(79,70,229,0.08)',
                    border: '1.5px solid rgba(79,70,229,0.2)',
                  }}
                >
                  <Shield className="h-7 w-7 text-indigo-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 font-display">Two-factor verification</h2>
                <p className="text-sm text-slate-500 mt-1.5 max-w-xs">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <form onSubmit={handleMFA} className="space-y-5">
                <div>
                  <label className="form-label text-center block">Verification code</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
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
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold
                             bg-indigo-600 text-white hover:bg-indigo-700
                             transition-all duration-200 disabled:opacity-50 active:scale-[0.98]
                             shadow-sm hover:shadow-md hover:shadow-indigo-200/60"
                >
                  {loading ? 'Verifying…' : 'Verify code'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('credentials'); setMfaCode(''); setError('') }}
                  className="w-full text-sm text-slate-500 hover:text-slate-700 transition-colors py-1"
                >
                  ← Back to sign in
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
