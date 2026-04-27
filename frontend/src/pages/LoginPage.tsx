import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Database, Mail, Lock, Eye, EyeOff, KeyRound, ArrowRight, Shield, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api, getApiErrorMessage } from '../api/client'

type Step = 'credentials' | 'mfa'

const FEATURES = [
  '25+ assessment dimensions',
  'Schema complexity scoring',
  'PII indicator scanning',
  'Professional Excel reports',
]

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

      {/* ── Left panel — premium light 3D brand panel ────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-5/12 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #F0F4FF 0%, #E8EFFE 40%, #F5F3FF 100%)',
          borderRight: '1px solid rgba(226,232,240,0.6)',
        }}
      >
        {/* Subtle dot grid — top-left light source */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `radial-gradient(circle, #c7d2fe 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
          aria-hidden="true"
        />

        {/* Top-left key light gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 15% 10%, rgba(255,255,255,0.75) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />

        {/* Floating 3D accent orbs */}
        <div
          className="absolute top-24 right-16 h-40 w-40 rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, #818cf8 0%, transparent 70%)',
            filter: 'blur(20px)',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute bottom-32 left-12 h-32 w-32 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)',
            filter: 'blur(16px)',
          }}
          aria-hidden="true"
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center h-11 w-11 rounded-xl"
              style={{
                background: '#ffffff',
                border: '1.5px solid rgba(226,232,240,0.9)',
                boxShadow: 'var(--elevation-3), inset 0 1px 0 rgba(255,255,255,1)',
              }}
            >
              <Database className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900 font-display tracking-tight">
                Source<span className="text-amber-500">SAT</span>
              </p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Assessment Tool</p>
            </div>
          </div>
        </div>

        {/* Hero text + features */}
        <div className="relative z-10 space-y-10">
          <div className="space-y-4">
            <h1
              className="text-3xl font-bold text-slate-900 font-display leading-tight"
              style={{ letterSpacing: '-0.03em' }}
            >
              SQL Server<br />
              <span style={{ color: '#4f46e5' }}>Intelligence</span> Platform
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
              Automated database discovery and migration readiness assessment across SQL Server estates
              and Microsoft Fabric workspaces.
            </p>
          </div>

          {/* Feature cards — light elevated */}
          <div className="space-y-2.5">
            {FEATURES.map((feature, i) => (
              <div
                key={feature}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background: 'rgba(255,255,255,0.75)',
                  border: '1px solid rgba(255,255,255,0.9)',
                  boxShadow: 'var(--elevation-2), inset 0 1px 0 rgba(255,255,255,0.95)',
                  backdropFilter: 'blur(8px)',
                  animation: `slideUp 0.36s cubic-bezier(0.16,1,0.3,1) ${i * 60}ms both`,
                }}
              >
                <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
                <span className="text-sm text-slate-700 font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="relative z-10 text-xs text-slate-400 tracking-wide">
          UBTI — Unified Business Technology Intelligence
        </p>
      </div>

      {/* ── Right panel — 3D elevated form card ──────────────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-12"
        style={{ background: 'var(--color-canvas)' }}
      >
        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center h-12 w-12 rounded-2xl mb-3"
            style={{
              background: '#ffffff',
              border: '1.5px solid rgba(226,232,240,0.9)',
              boxShadow: 'var(--elevation-3)',
            }}
          >
            <Database className="h-6 w-6 text-amber-500" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            Source<span className="text-amber-500">SAT</span>
          </h1>
        </div>

        {/* Form card — 3D elevated glass */}
        <div
          className="w-full max-w-sm"
          style={{ animation: 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          <div
            className="rounded-2xl px-8 py-10"
            style={{
              background: '#ffffff',
              border: '1px solid rgba(226,232,240,0.8)',
              boxShadow: 'var(--elevation-4), var(--elevation-border-2)',
            }}
          >
            {step === 'credentials' ? (
              <>
                <div className="mb-8">
                  <h2
                    className="text-2xl font-bold text-slate-900 font-display"
                    style={{ letterSpacing: '-0.02em' }}
                  >
                    Welcome back
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">Sign in to your account to continue</p>
                </div>

                <form onSubmit={handleCredentials} className="space-y-5">
                  <div>
                    <label className="form-label">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden="true" />
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
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden="true" />
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400
                                   hover:text-slate-600 transition-colors focus-visible:outline-none
                                   focus-visible:ring-2 focus-visible:ring-amber-500/40 rounded"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword
                          ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                          : <Eye className="h-4 w-4" aria-hidden="true" />
                        }
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div
                      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                      role="alert"
                    >
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg
                               text-sm font-semibold text-white
                               focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2
                               focus-visible:outline-none disabled:opacity-50 btn-physics"
                    style={{
                      background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                      boxShadow: 'var(--elevation-2), inset 0 1px 0 rgba(255,255,255,0.12)',
                    }}
                  >
                    {loading ? 'Signing in…' : (
                      <>Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" /></>
                    )}
                  </button>
                </form>

                <p className="text-center text-sm text-slate-500 mt-8">
                  Don't have an account?{' '}
                  <Link
                    to="/register"
                    className="text-indigo-600 font-medium hover:text-indigo-700 transition-colors
                               focus-visible:outline-none focus-visible:underline"
                  >
                    Create account
                  </Link>
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center text-center mb-8">
                  <div
                    className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
                    style={{
                      background: 'linear-gradient(135deg, rgba(79,70,229,0.08) 0%, rgba(79,70,229,0.04) 100%)',
                      border: '1.5px solid rgba(79,70,229,0.18)',
                      boxShadow: 'var(--elevation-2)',
                    }}
                  >
                    <Shield className="h-7 w-7 text-indigo-600" aria-hidden="true" />
                  </div>
                  <h2
                    className="text-xl font-bold text-slate-900 font-display"
                    style={{ letterSpacing: '-0.02em' }}
                  >
                    Two-factor verification
                  </h2>
                  <p className="text-sm text-slate-500 mt-1.5 max-w-xs">
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>

                <form onSubmit={handleMFA} className="space-y-5">
                  <div>
                    <label className="form-label text-center block">Verification code</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden="true" />
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
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || mfaCode.length !== 6}
                    className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white
                               focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2
                               focus-visible:outline-none disabled:opacity-50 btn-physics"
                    style={{
                      background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                      boxShadow: 'var(--elevation-2), inset 0 1px 0 rgba(255,255,255,0.12)',
                    }}
                  >
                    {loading ? 'Verifying…' : 'Verify code'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setStep('credentials'); setMfaCode(''); setError('') }}
                    className="w-full text-sm text-slate-500 hover:text-slate-700 transition-colors py-1
                               focus-visible:outline-none focus-visible:underline"
                  >
                    ← Back to sign in
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
