import { NavLink, useNavigate } from 'react-router-dom'
import { Database, PlusCircle, Layers, Radio, List, LogOut, Shield, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import Button from '../ui/Button'
import { useAuth } from '../../context/AuthContext'

export default function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email.slice(0, 2).toUpperCase() ?? '?'

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Brand */}
          <NavLink
            to="/"
            className="flex items-center gap-2.5 shrink-0 group"
            aria-label="Source Assessment Tool home"
          >
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-brand-600 text-white shadow-sm group-hover:bg-brand-700 transition-colors">
              <Database className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-slate-900 leading-tight">Source Assessment</p>
              <p className="text-xs text-slate-400 leading-tight">Multi-DB Analyzer</p>
            </div>
          </NavLink>

          {/* Nav */}
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <NavLink
              to="/sessions"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span>Sessions</span>
            </NavLink>
            <NavLink
              to="/jobs"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <List className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Jobs</span>
            </NavLink>
            <NavLink
              to="/gateway"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Radio className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Gateway</span>
            </NavLink>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              leftIcon={<PlusCircle className="h-4 w-4" />}
              onClick={() => navigate('/')}
              className="hidden sm:flex"
            >
              New Assessment
            </Button>

            {/* User menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
                  {initials}
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50">
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {user?.full_name || user?.email}
                    </p>
                    {user?.full_name && (
                      <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    )}
                    {user?.mfa_enabled && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                        <Shield className="h-3 w-3" /> MFA on
                      </span>
                    )}
                  </div>

                  {!user?.mfa_enabled && (
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/setup-mfa') }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Shield className="h-4 w-4 text-slate-400" />
                      Enable MFA
                    </button>
                  )}

                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
