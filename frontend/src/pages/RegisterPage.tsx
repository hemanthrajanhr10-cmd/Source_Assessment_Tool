import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, Mail, Lock, User, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

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
      await api.register({
        email,
        password,
        full_name: fullName || undefined,
      })
      setSuccess(true)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--color-canvas)' }}>
      {/* Aurora background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(-45deg, #F0FAF9, #E5F5F3, #CCEFEC, #F0FAF9)',
          backgroundSize: '400% 400%',
          animation: 'aurora 16s ease-in-out infinite',
          opacity: 0.5,
        }}
      />
      {/* Dot grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(108,189,181,0.55) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="w-full max-w-sm relative z-10 animate-slide-up">

        {/* Pending-activation success state */}
        {success && (
          <div className="rounded-3xl bg-white p-8 text-center"
               style={{ boxShadow: '0 24px 64px rgba(108,189,181,0.12), 0 4px 16px rgba(0,0,0,0.06)' }}>
            <CheckCircle className="h-12 w-12 mx-auto mb-4" style={{ color: '#358F87' }} />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Account Submitted</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              Your account request has been received. An administrator will review and
              activate your account shortly. You'll be able to log in once access is granted.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: '#358F87' }}
            >
              Back to Sign In <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {!success && (<>
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center h-12 w-12 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, #4DA8A0 0%, #93CCC6 100%)',
              boxShadow: '0 8px 24px rgba(108,189,181,0.36)',
            }}
          >
            <Database className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            Source<span className="font-extrabold" style={{ color: '#358F87' }}>SAT</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Create your account</p>
        </div>

        {/* Card */}
        <div
          className="relative rounded-3xl p-px"
          style={{ background: 'linear-gradient(135deg, rgba(108,189,181,0.28) 0%, rgba(147,204,198,0.14) 50%, rgba(77,168,160,0.20) 100%)' }}
        >
        <div
          className="rounded-[23px] bg-white p-8 relative overflow-hidden"
          style={{ boxShadow: '0 24px 64px rgba(108,189,181,0.12), 0 4px 16px rgba(0,0,0,0.06)' }}
        >
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(240,250,249,0.70) 0%, transparent 50%)', borderRadius: 'inherit' }}
            aria-hidden="true" />
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
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold mt-2
                         text-white btn-physics btn-shimmer
                         transition-all duration-200 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #4DA8A0 0%, #93CCC6 100%)',
                boxShadow: '0 4px 16px rgba(108,189,181,0.40), 0 1px 3px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.20)',
              }}
            >
              {loading ? 'Creating account…' : (
                <>Create account <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>
        </div>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold transition-colors" style={{ color: '#358F87' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#25706A' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#358F87' }}>
            Sign in
          </Link>
        </p>
        </>)}
      </div>
    </div>
  )
}
