import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Database, Mail, Lock, Eye, EyeOff, KeyRound,
  ArrowRight, Shield, CheckCircle2, Sparkles, Network,
  Layers, Cloud, FileSpreadsheet, AlertCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api, getApiErrorMessage } from '../api/client'

type Step = 'credentials' | 'mfa'
type OAuthProvider = 'microsoft' | 'google' | 'apple'

const BASE_URL = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL || ''

const FEATURES = [
  { icon: Database,         text: 'SQL Server estate analysis',           color: 'text-[#0056B3]' },
  { icon: Layers,           text: 'Microsoft Fabric workspace assessment', color: 'text-[#0891B2]'  },
  { icon: Cloud,            text: 'SAP Systems readiness review',          color: 'text-[#0D9488]'  },
  { icon: CheckCircle2,     text: 'Sage Intacct cloud ERP scanning',       color: 'text-[#0056B3]' },
  { icon: FileSpreadsheet,  text: 'Excel & Word report generation',        color: 'text-[#0891B2]'  },
  { icon: Network,          text: 'Hybrid Connection support',             color: 'text-[#0D9488]' },
]

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  microsoft: 'Microsoft',
  google: 'Google',
  apple: 'Apple',
}

export default function LoginPage() {
  const { setToken } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [providers, setProviders] = useState<Record<OAuthProvider, boolean>>({
    microsoft: false,
    google: false,
    apple: false,
  })
  const [providersLoaded, setProvidersLoaded] = useState(false)

  // Fetch provider availability on mount
  useEffect(() => {
    api.oauthProviders()
      .then((res) => setProviders(res.data as Record<OAuthProvider, boolean>))
      .catch(() => { /* leave all false — buttons show as unconfigured */ })
      .finally(() => setProvidersLoaded(true))
  }, [])

  // Show OAuth error from redirect
  useEffect(() => {
    const oauthError = searchParams.get('oauth_error')
    if (oauthError) {
      const messages: Record<string, string> = {
        access_denied: 'Sign-in was cancelled. Please try again.',
        token_exchange_failed: 'Could not exchange the authorisation code. Please try again.',
        userinfo_failed: 'Could not retrieve your profile from the provider.',
        no_email_returned: 'The provider did not return an email address.',
        account_inactive: 'Your account is disabled. Contact your administrator.',
        token_decode_failed: 'Could not read the identity token from Apple.',
      }
      setError(messages[oauthError] || decodeURIComponent(oauthError))
    }
  }, [searchParams])

  function startOAuth(provider: OAuthProvider) {
    if (!providers[provider]) {
      setError(
        `${PROVIDER_LABELS[provider]} sign-in is not configured on this server. ` +
        'Use email and password, or contact your administrator.'
      )
      return
    }
    setError('')
    setOauthLoading(provider)
    window.location.href = `${BASE_URL}/api/v1/auth/oauth/${provider}`
  }

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

      {/* ── Left panel ───────────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-5/12 flex-col justify-between p-12 relative overflow-hidden"
        style={{ borderRight: '1px solid rgba(205, 210, 220, 0.30)' }}
      >
        {/* Aurora animated gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(-45deg, #EFF7FF, #F0FDFA, #ECFEFF, #EFF7FF, #F0FDFA, #ECFEFF)',
            backgroundSize: '400% 400%',
            animation: 'aurora 16s ease-in-out infinite',
          }}
          aria-hidden="true"
        />

        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.28]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0,86,179,0.38) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
          aria-hidden="true"
        />

        {/* Key light */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 10% 5%, rgba(255,255,255,0.80) 0%, transparent 55%)' }}
          aria-hidden="true"
        />

        {/* Orbs */}
        <div className="absolute top-16 right-8 h-52 w-52 rounded-full opacity-35 orb-float"
          style={{ background: 'radial-gradient(circle at 35% 35%, #7EC8FF 0%, #0056B3 55%, transparent 72%)', filter: 'blur(28px)', animationDuration: '10s' }} aria-hidden="true" />
        <div className="absolute top-1/3 right-4 h-36 w-36 rounded-full opacity-28 orb-float-delayed"
          style={{ background: 'radial-gradient(circle at 40% 40%, #A5F3FC 0%, #0891B2 60%, transparent 80%)', filter: 'blur(18px)' }} aria-hidden="true" />
        <div className="absolute bottom-28 left-8 h-28 w-28 rounded-full opacity-30 orb-float-slow"
          style={{ background: 'radial-gradient(circle, #99F6E4 0%, #0D9488 60%, transparent 80%)', filter: 'blur(14px)' }} aria-hidden="true" />
        <div className="absolute bottom-16 right-20 h-16 w-16 rounded-full opacity-22 orb-float"
          style={{ background: 'radial-gradient(circle, #7EC8FF 0%, #0084D4 70%, transparent 90%)', filter: 'blur(10px)', animationDuration: '7s', animationDelay: '1s' }} aria-hidden="true" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-12 w-12 rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #0056B3 0%, #0084D4 100%)', boxShadow: '0 8px 24px rgba(0,86,179,0.30), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
              <Database className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 font-display tracking-tight">
                Source<span className="font-extrabold" style={{ color: '#0056B3' }}>SAT</span>
              </p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Assessment Tool</p>
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-10">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-sm"
              style={{ border: '1px solid rgba(0,86,179,0.35)' }}>
              <Sparkles className="h-3.5 w-3.5" style={{ color: '#0891B2' }} aria-hidden="true" />
              <span className="text-xs font-semibold tracking-wide" style={{ color: '#003D82' }}>Enterprise Assessment Intelligence</span>
            </div>

            <h1 className="text-4xl font-black text-slate-900 font-display leading-[1.05]" style={{ letterSpacing: '-0.04em' }}>
              Multi-Source<br />
              <span className="font-black" style={{ color: '#0056B3' }}>Assessment</span>{' '}
              <span className="text-slate-700">Platform</span>
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
              Unified readiness assessment across SQL Server estates,
              Microsoft Fabric workspaces, SAP Systems, and Sage Intacct cloud ERP.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-2">
            {FEATURES.map(({ icon: Icon, text, color }, i) => (
              <div key={text} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.70)',
                  border: '1px solid rgba(255, 255, 255, 0.92)',
                  boxShadow: 'var(--elevation-2), inset 0 1px 0 rgba(255,255,255,0.96)',
                  backdropFilter: 'blur(12px)',
                  animation: `slideUp 0.40s cubic-bezier(0.16,1,0.3,1) ${80 + i * 70}ms both`,
                }}>
                <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.90)', boxShadow: 'var(--elevation-1)' }}>
                  <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
                </div>
                <span className="text-sm text-slate-700 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10 flex items-center gap-2">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(0,86,179,0.22), transparent)' }} />
          <p className="text-xs text-slate-400 tracking-widest uppercase">UBTI Platform</p>
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12"
        style={{ background: 'var(--color-canvas)' }}>

        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-10">
          <div className="flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #0056B3 0%, #0084D4 100%)', boxShadow: '0 8px 24px rgba(0,86,179,0.28)' }}>
            <Database className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-display tracking-tight">
            Source<span className="font-extrabold" style={{ color: '#0056B3' }}>SAT</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 tracking-widest uppercase">Assessment Tool</p>
        </div>

        {/* Form card */}
        <div className="w-full max-w-sm" style={{ animation: 'slideUp 0.45s cubic-bezier(0.16,1,0.3,1) both' }}>
          <div className="relative rounded-3xl p-px"
            style={{ background: 'linear-gradient(135deg, rgba(0,86,179,0.20) 0%, rgba(8,145,178,0.10) 50%, rgba(13,148,136,0.14) 100%)' }}>
            <div className="rounded-[23px] px-8 py-10 relative overflow-hidden"
              style={{ background: '#ffffff', boxShadow: '0 24px 64px rgba(0,86,179,0.08), 0 4px 16px rgba(0,0,0,0.06)' }}>

              {/* Card rim light */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(135deg, rgba(239,247,255,0.70) 0%, transparent 50%)', borderRadius: 'inherit' }}
                aria-hidden="true" />

              <div className="relative z-10">
                {step === 'credentials' ? (
                  <>
                    {/* Header */}
                    <div className="mb-8">
                      <h2 className="text-2xl font-black text-slate-900 font-display" style={{ letterSpacing: '-0.03em' }}>
                        Welcome back
                      </h2>
                      <p className="text-sm text-slate-500 mt-1.5">Sign in to your account to continue</p>
                    </div>

                    {/* ── OAuth SSO — only show configured providers ────────── */}
                    {providersLoaded && (providers.microsoft || providers.google || providers.apple) && (
                      <div className="space-y-2.5 mb-7">
                        {providers.microsoft && (
                          <OAuthButton
                            provider="microsoft"
                            label="Continue with Microsoft"
                            loading={oauthLoading === 'microsoft'}
                            anyLoading={!!oauthLoading}
                            onClick={() => startOAuth('microsoft')}
                            icon={
                              <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden="true">
                                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                              </svg>
                            }
                          />
                        )}
                        {providers.google && (
                          <OAuthButton
                            provider="google"
                            label="Continue with Google"
                            loading={oauthLoading === 'google'}
                            anyLoading={!!oauthLoading}
                            onClick={() => startOAuth('google')}
                            icon={
                              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                              </svg>
                            }
                          />
                        )}
                        {providers.apple && (
                          <OAuthButton
                            provider="apple"
                            label="Continue with Apple"
                            loading={oauthLoading === 'apple'}
                            anyLoading={!!oauthLoading}
                            onClick={() => startOAuth('apple')}
                            icon={
                              <svg width="15" height="18" viewBox="0 0 15 18" aria-hidden="true" fill="currentColor">
                                <path d="M14.548 13.664c-.288.638-.425.922-.795 1.487-.516.784-1.244 1.763-2.144 1.772-.8.007-1.007-.52-2.094-.514-1.088.006-1.314.524-2.115.517-.9-.008-1.588-.895-2.103-1.68-1.44-2.187-1.59-4.752-.703-6.116.628-.987 1.618-1.563 2.546-1.563.947 0 1.542.52 2.325.52.76 0 1.224-.521 2.32-.521.828 0 1.704.45 2.33 1.231-2.047 1.122-1.714 4.046.433 4.867zM10.088 3.176c.394-.507.694-1.222.586-1.952-.648.044-1.406.456-1.848.99-.4.487-.728 1.207-.6 1.904.71.022 1.44-.384 1.862-.942z"/>
                              </svg>
                            }
                          />
                        )}
                      </div>
                    )}

                    {/* Divider — only when at least one SSO provider is visible */}
                    {providersLoaded && (providers.microsoft || providers.google || providers.apple) && (
                      <div className="flex items-center gap-3 mb-6">
                        <div className="h-px flex-1 bg-slate-100" />
                        <span className="text-[11px] font-medium text-slate-400 tracking-wide uppercase">or sign in with email</span>
                        <div className="h-px flex-1 bg-slate-100" />
                      </div>
                    )}

                    <form onSubmit={handleCredentials} className="space-y-5">
                      {/* Email */}
                      <div>
                        <label className="form-label">Email address</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                          <input
                            type="email" required autoComplete="email" autoFocus
                            value={email} onChange={(e) => setEmail(e.target.value)}
                            className="form-input pl-10" placeholder="you@company.com"
                          />
                        </div>
                      </div>

                      {/* Password */}
                      <div>
                        <label className="form-label">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required autoComplete="current-password"
                            value={password} onChange={(e) => setPassword(e.target.value)}
                            className="form-input pl-10 pr-11" placeholder="••••••••"
                          />
                          <button
                            type="button" onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded-lg p-0.5"
                            style={{ ['--tw-ring-color' as string]: 'rgba(0,86,179,0.35)' }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#0056B3' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '' }}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                          </button>
                        </div>
                      </div>

                      {/* Error banner */}
                      {error && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-red-200/80 bg-red-50/80 px-3.5 py-3 text-sm text-red-700" role="alert">
                          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
                          <span>{error}</span>
                        </div>
                      )}

                      {/* Submit */}
                      <button
                        type="submit" disabled={loading}
                        className="w-full flex items-center justify-center gap-2.5 py-3 px-5 rounded-xl text-sm font-semibold text-white btn-physics btn-shimmer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
                        style={{
                          background: 'linear-gradient(135deg, #0056B3 0%, #0084D4 100%)',
                          boxShadow: '0 4px 16px rgba(0,86,179,0.30), 0 1px 3px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }}
                      >
                        {loading ? 'Signing in…' : <><span>Sign in</span> <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                      </button>
                    </form>

                    <p className="text-center text-sm text-slate-500 mt-6">
                      Don't have an account?{' '}
                      <Link to="/register" className="font-semibold transition-colors focus-visible:outline-none focus-visible:underline"
                        style={{ color: '#0056B3' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#003D82' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#0056B3' }}>
                        Create account
                      </Link>
                    </p>
                  </>
                ) : (
                  <>
                    {/* MFA step */}
                    <div className="flex flex-col items-center text-center mb-8">
                      <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
                        style={{ background: 'linear-gradient(135deg, rgba(0,86,179,0.07) 0%, rgba(8,145,178,0.04) 100%)', border: '1.5px solid rgba(0,86,179,0.30)', boxShadow: 'var(--elevation-2)' }}>
                        <Shield className="h-8 w-8" style={{ color: '#0056B3' }} aria-hidden="true" />
                      </div>
                      <h2 className="text-xl font-black text-slate-900 font-display" style={{ letterSpacing: '-0.025em' }}>
                        Two-factor verification
                      </h2>
                      <p className="text-sm text-slate-500 mt-2 max-w-xs">Enter the 6-digit code from your authenticator app.</p>
                    </div>

                    <form onSubmit={handleMFA} className="space-y-5">
                      <div>
                        <label className="form-label text-center block">Verification code</label>
                        <div className="relative">
                          <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                          <input
                            type="text" inputMode="numeric" maxLength={6} required autoFocus
                            value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                            className="form-input pl-10 text-center tracking-[0.6em] font-mono text-xl font-bold"
                            placeholder="000000"
                          />
                        </div>
                      </div>

                      {error && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-red-200/80 bg-red-50/80 px-3.5 py-3 text-sm text-red-700" role="alert">
                          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
                          <span>{error}</span>
                        </div>
                      )}

                      <button
                        type="submit" disabled={loading || mfaCode.length !== 6}
                        className="w-full py-3 px-5 rounded-xl text-sm font-semibold text-white btn-physics btn-shimmer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #0056B3 0%, #0084D4 100%)', boxShadow: '0 4px 16px rgba(0,86,179,0.28), inset 0 1px 0 rgba(255,255,255,0.15)' }}
                      >
                        {loading ? 'Verifying…' : 'Verify code'}
                      </button>

                      <button type="button"
                        onClick={() => { setStep('credentials'); setMfaCode(''); setError('') }}
                        className="w-full text-sm text-slate-400 transition-colors py-1.5 focus-visible:outline-none focus-visible:underline"
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#0056B3' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '' }}>
                        ← Back to sign in
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-400 text-center">
          Protected by TLS encryption &nbsp;·&nbsp; UBTI Intelligence Platform
        </p>
      </div>
    </div>
  )
}

// ── OAuth provider button component ──────────────────────────────────────────

interface OAuthButtonProps {
  provider: OAuthProvider
  label: string
  loading: boolean
  anyLoading: boolean
  onClick: () => void
  icon: React.ReactNode
}

function OAuthButton({ provider, label, loading, anyLoading, onClick, icon }: OAuthButtonProps) {
  const isDisabled = anyLoading

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={`Sign in with ${PROVIDER_LABELS[provider]}`}
      className="w-full flex items-center gap-3 py-2.5 px-4 rounded-xl text-sm font-medium text-slate-700 border border-slate-200 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: '#ffffff',
        boxShadow: 'var(--elevation-1), var(--elevation-border-1)',
        ['--tw-ring-color' as string]: 'rgba(0,86,179,0.35)',
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          const el = e.currentTarget
          el.style.borderColor = 'rgba(0,86,179,0.40)'
          el.style.backgroundColor = 'rgba(239,247,255,0.7)'
          el.style.transform = 'translateY(-1px)'
          el.style.boxShadow = '0 4px 12px rgba(0,86,179,0.12), 0 1px 3px rgba(0,0,0,0.08)'
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.borderColor = ''
        el.style.backgroundColor = ''
        el.style.transform = ''
        el.style.boxShadow = ''
      }}
      onMouseDown={(e) => {
        if (!isDisabled) {
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0) scale(0.985)'
        }
      }}
      onMouseUp={(e) => {
        if (!isDisabled) {
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
        }
      }}
    >
      <span className="flex items-center justify-center w-5 h-5 shrink-0">
        {loading ? (
          <svg className="animate-spin h-4 w-4" style={{ color: '#0056B3' }} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/>
          </svg>
        ) : icon}
      </span>
      <span className="flex-1 text-left">{loading ? 'Redirecting…' : label}</span>
      <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md shrink-0"
        style={{ background: 'rgba(0,86,179,0.07)', color: '#0056B3' }}>
        SSO
      </span>
    </button>
  )
}
