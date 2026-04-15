import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Database, Mail, Lock, Eye, EyeOff, KeyRound } from 'lucide-react'
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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-600 text-white shadow-md mb-3">
            <Database className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Source Assessment Tool</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {step === 'credentials' ? (
            <form onSubmit={handleCredentials} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMFA} className="space-y-5">
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-brand-50 mx-auto mb-3">
                  <KeyRound className="h-6 w-6 text-brand-600" />
                </div>
                <p className="text-sm text-slate-600">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-[0.5em] py-2.5 text-lg font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="000000"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {loading ? 'Verifying…' : 'Verify'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('credentials'); setMfaCode(''); setError('') }}
                className="w-full text-sm text-slate-500 hover:text-slate-700"
              >
                Back to sign in
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-600 font-medium hover:text-brand-700">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
