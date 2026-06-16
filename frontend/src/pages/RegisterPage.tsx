import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Database, Mail, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api, getApiErrorMessage } from '../api/client'

export default function RegisterPage() {
  const { setToken } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      const res = await api.register({
        email,
        password,
        full_name: fullName || undefined,
      })
      setToken(res.data.access_token)
      navigate('/', { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-50">
      {/* Background subtle grid */}
      <div
        className="fixed inset-0 opacity-[0.4] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(to right, #e2e8f0 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="w-full max-w-sm relative z-10 animate-slide-up">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center h-12 w-12 rounded-2xl mb-4"
            style={{
              background: 'rgba(22,163,74,0.08)',
              border: '1.5px solid rgba(22,163,74,0.2)',
            }}
          >
            <Database className="h-6 w-6 text-earth-700" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Create account</h1>
          <p className="text-sm text-slate-500 mt-1">Join Source Assessment Tool</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl bg-white border border-slate-200 p-8"
          style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)' }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">
                Full name{' '}
                <span className="text-slate-400 normal-case tracking-normal font-normal">(optional)</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="form-input pl-10"
                  placeholder="Jane Smith"
                />
              </div>
            </div>

            <div>
              <label className="form-label">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
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
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input pl-10 pr-10"
                  placeholder="Min. 8 characters"
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

            <div>
              <label className="form-label">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="form-input pl-10"
                  placeholder="••••••••"
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
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold mt-2
                         bg-earth-700 text-white hover:bg-earth-800
                         transition-all duration-200 disabled:opacity-50 active:scale-[0.98]
                         shadow-sm hover:shadow-md hover:shadow-earth-200/60"
            >
              {loading ? 'Creating account…' : (
                <>Create account <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-earth-700 font-medium hover:text-earth-800 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
