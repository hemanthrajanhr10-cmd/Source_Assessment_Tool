import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Database, Mail, Lock, Eye, EyeOff, KeyRound,
  ArrowRight, Shield, CheckCircle2, Sparkles, Zap, BarChart3, Network,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api, getApiErrorMessage } from '../api/client'

type Step = 'credentials' | 'mfa'

const FEATURES = [
  { icon: CheckCircle2, text: '25+ assessment dimensions', color: 'text-violet-400' },
  { icon: Zap,          text: 'Schema complexity scoring',  color: 'text-indigo-400' },
  { icon: Shield,       text: 'PII indicator scanning',     color: 'text-purple-400' },
  { icon: BarChart3,    text: 'Professional Excel reports', color: 'text-blue-400'   },
  { icon: Network,      text: 'Hybrid Connection support',  color: 'text-violet-400' },
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

      {/* ── Left panel — Aurora animated brand panel ─────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-5/12 flex-col justify-between p-12 relative overflow-hidden"
        style={{ borderRight: '1px solid rgba(196, 181, 253, 0.20)' }}
      >
        {/* Aurora animated gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(-45deg, #EDE9FE, #E0E7FF, #F5F3FF, #EFF6FF, #F0F4FF, #EDE9FE)',
            backgroundSize: '400% 400%',
            animation: 'aurora 16s ease-in-out infinite',
          }}
          aria-hidden="true"
        />

        {/* Dot grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.30]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(124,58,237,0.5) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
          aria-hidden="true"
        />

        {/* Top-left key light */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 10% 5%, rgba(255,255,255,0.80) 0%, transparent 55%)',
          }}
          aria-hidden="true"
        />

        {/* ── Floating 3D Orbs ────────────────────────────────────────────── */}

        {/* Large violet orb — top right */}
        <div
          className="absolute top-16 right-8 h-52 w-52 rounded-full opacity-40 orb-float"
          style={{
            background: 'radial-gradient(circle at 35% 35%, #a78bfa 0%, #7c3aed 50%, transparent 72%)',
            filter: 'blur(24px)',
            animationDuration: '10s',
          }}
          aria-hidden="true"
        />

        {/* Medium indigo orb — center-right */}
        <div
          className="absolute top-1/3 right-4 h-36 w-36 rounded-full opacity-30 orb-float-delayed"
          style={{
            background: 'radial-gradient(circle at 40% 40%, #818cf8 0%, #6366f1 60%, transparent 80%)',
            filter: 'blur(18px)',
          }}
          aria-hidden="true"
        />

        {/* Small purple orb — bottom left */}
        <div
          className="absolute bottom-28 left-8 h-28 w-28 rounded-full opacity-35 orb-float-slow"
          style={{
            background: 'radial-gradient(circle, #c4b5fd 0%, #8b5cf6 60%, transparent 80%)',
            filter: 'blur(14px)',
          }}
          aria-hidden="true"
        />

        {/* Tiny accent orb — bottom right */}
        <div
          className="absolute bottom-16 right-20 h-16 w-16 rounded-full opacity-25 orb-float"
          style={{
            background: 'radial-gradient(circle, #60a5fa 0%, #3b82f6 70%, transparent 90%)',
            filter: 'blur(10px)',
            animationDuration: '7s',
            animationDelay: '1s',
          }}
          aria-hidden="true"
        />

        {/* ── Content ─────────────────────────────────────────────────────── */}

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center h-12 w-12 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                boxShadow: '0 8px 24px rgba(124,58,237,0.35), inset 0 1px 0 rgba(255,255,255,0.20)',
              }}
            >
              <Database className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 font-display tracking-tight">
                Source<span className="text-violet-600 font-extrabold">SAT</span>
              </p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Assessment Tool</p>
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-10">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 border border-violet-200/60 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" aria-hidden="true" />
              <span className="text-xs font-semibold text-violet-700 tracking-wide">Enterprise Database Intelligence</span>
            </div>

            <h1
              className="text-4xl font-black text-slate-900 font-display leading-[1.05]"
              style={{ letterSpacing: '-0.04em' }}
            >
              SQL Server<br />
              <span className="text-indigo-600 font-black">Intelligence</span>{' '}
              <span className="text-slate-700">Platform</span>
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
              Automated database discovery and migration readiness assessment
              across SQL Server estates and Microsoft Fabric workspaces.
            </p>
          </div>

          {/* Feature list — glass cards */}
          <div className="space-y-2">
            {FEATURES.map(({ icon: Icon, text, color }, i) => (
              <div
                key={text}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.70)',
                  border: '1px solid rgba(255, 255, 255, 0.92)',
                  boxShadow: 'var(--elevation-2), inset 0 1px 0 rgba(255,255,255,0.96)',
                  backdropFilter: 'blur(12px)',
                  animation: `slideUp 0.40s cubic-bezier(0.16,1,0.3,1) ${80 + i * 70}ms both`,
                }}
              >
                <div
                  className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: 'rgba(255,255,255,0.90)',
                    boxShadow: 'var(--elevation-1)',
                  }}
                >
                  <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
                </div>
                <span className="text-sm text-slate-700 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10 flex items-center gap-2">
          <div className="h-px flex-1" style={{
            background: 'linear-gradient(90deg, rgba(124,58,237,0.20), transparent)',
          }} />
          <p className="text-xs text-slate-400 tracking-widest uppercase">
            UBTI Platform
          </p>
        </div>
      </div>

      {/* ── Right panel — Premium 3D form card ───────────────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-12"
        style={{ background: 'var(--color-canvas)' }}
      >
        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-10">
          <div
            className="flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
              boxShadow: '0 8px 24px rgba(124,58,237,0.35)',
            }}
          >
            <Database className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-display tracking-tight">
            Source<span className="text-violet-600 font-extrabold">SAT</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 tracking-widest uppercase">Assessment Tool</p>
        </div>

        {/* Form card */}
        <div
          className="w-full max-w-sm"
          style={{ animation: 'slideUp 0.45s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          {/* Gradient border wrapper */}
          <div
            className="relative rounded-3xl p-px"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(196,181,253,0.15) 50%, rgba(99,102,241,0.20) 100%)',
            }}
          >
            <div
              className="rounded-[23px] px-8 py-10 relative overflow-hidden"
              style={{
                background: '#ffffff',
                boxShadow: '0 24px 64px rgba(124,58,237,0.12), 0 4px 16px rgba(0,0,0,0.06)',
              }}
            >
              {/* Card rim light */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,243,255,0.70) 0%, transparent 50%)',
                  borderRadius: 'inherit',
                }}
                aria-hidden="true"
              />

              <div className="relative z-10">
                {step === 'credentials' ? (
                  <>
                    {/* Header */}
                    <div className="mb-8">
                      <h2
                        className="text-2xl font-black text-slate-900 font-display"
                        style={{ letterSpacing: '-0.03em' }}
                      >
                        Welcome back
                      </h2>
                      <p className="text-sm text-slate-500 mt-1.5">
                        Sign in to your account to continue
                      </p>
                    </div>

                    <form onSubmit={handleCredentials} className="space-y-5">
                      {/* Email */}
                      <div>
                        <label className="form-label">Email address</label>
                        <div className="relative">
                          <Mail
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                            aria-hidden="true"
                          />
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

                      {/* Password */}
                      <div>
                        <label className="form-label">Password</label>
                        <div className="relative">
                          <Lock
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                            aria-hidden="true"
                          />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="form-input pl-10 pr-11"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400
                                       hover:text-violet-600 transition-colors focus-visible:outline-none
                                       focus-visible:ring-2 focus-visible:ring-violet-500/40 rounded-lg p-0.5"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword
                              ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                              : <Eye className="h-4 w-4" aria-hidden="true" />
                            }
                          </button>
                        </div>
                      </div>

                      {/* Error */}
                      {error && (
                        <div
                          className="flex items-start gap-2.5 rounded-xl border border-red-200/80 bg-red-50/80 px-3.5 py-3 text-sm text-red-700"
                          role="alert"
                        >
                          <span>{error}</span>
                        </div>
                      )}

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2.5 py-3 px-5 rounded-xl
                                   text-sm font-semibold text-white btn-physics btn-shimmer
                                   focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2
                                   focus-visible:outline-none disabled:opacity-50"
                        style={{
                          background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                          boxShadow: '0 4px 16px rgba(124,58,237,0.32), 0 1px 3px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }}
                      >
                        {loading ? 'Signing in…' : (
                          <>Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" /></>
                        )}
                      </button>
                    </form>

                    <div className="flex items-center gap-3 mt-8">
                      <div className="h-px flex-1 bg-slate-100" />
                      <span className="text-xs text-slate-400">or</span>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>

                    <p className="text-center text-sm text-slate-500 mt-4">
                      Don't have an account?{' '}
                      <Link
                        to="/register"
                        className="font-semibold text-violet-600 hover:text-violet-700 transition-colors
                                   focus-visible:outline-none focus-visible:underline"
                      >
                        Create account
                      </Link>
                    </p>
                  </>
                ) : (
                  <>
                    {/* MFA step */}
                    <div className="flex flex-col items-center text-center mb-8">
                      <div
                        className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
                        style={{
                          background: 'linear-gradient(135deg, rgba(124,58,237,0.10) 0%, rgba(99,102,241,0.06) 100%)',
                          border: '1.5px solid rgba(196,181,253,0.40)',
                          boxShadow: 'var(--elevation-2)',
                        }}
                      >
                        <Shield className="h-8 w-8 text-violet-600" aria-hidden="true" />
                      </div>
                      <h2
                        className="text-xl font-black text-slate-900 font-display"
                        style={{ letterSpacing: '-0.025em' }}
                      >
                        Two-factor verification
                      </h2>
                      <p className="text-sm text-slate-500 mt-2 max-w-xs">
                        Enter the 6-digit code from your authenticator app.
                      </p>
                    </div>

                    <form onSubmit={handleMFA} className="space-y-5">
                      <div>
                        <label className="form-label text-center block">Verification code</label>
                        <div className="relative">
                          <KeyRound
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                            aria-hidden="true"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            required
                            value={mfaCode}
                            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                            className="form-input pl-10 text-center tracking-[0.6em] font-mono text-xl font-bold"
                            placeholder="000000"
                            autoFocus
                          />
                        </div>
                      </div>

                      {error && (
                        <div
                          className="rounded-xl border border-red-200/80 bg-red-50/80 px-3.5 py-3 text-sm text-red-700"
                          role="alert"
                        >
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading || mfaCode.length !== 6}
                        className="w-full py-3 px-5 rounded-xl text-sm font-semibold text-white
                                   btn-physics btn-shimmer
                                   focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2
                                   focus-visible:outline-none disabled:opacity-50"
                        style={{
                          background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                          boxShadow: '0 4px 16px rgba(124,58,237,0.32), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }}
                      >
                        {loading ? 'Verifying…' : 'Verify code'}
                      </button>

                      <button
                        type="button"
                        onClick={() => { setStep('credentials'); setMfaCode(''); setError('') }}
                        className="w-full text-sm text-slate-400 hover:text-violet-600 transition-colors py-1.5
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

        {/* Security footer note */}
        <p className="mt-6 text-xs text-slate-400 text-center">
          Protected by TLS encryption &nbsp;·&nbsp; UBTI Intelligence Platform
        </p>
      </div>
    </div>
  )
}
