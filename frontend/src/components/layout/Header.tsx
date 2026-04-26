import { NavLink, useNavigate } from 'react-router-dom'
import { Database, Layers, Radio, List, LogOut, Shield, ChevronDown, Zap, PlusCircle } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import Button from '../ui/Button'
import { useAuth } from '../../context/AuthContext'

const NAV_ITEMS = [
  { to: '/sessions',       label: 'Sessions', icon: Layers },
  { to: '/jobs',           label: 'Jobs',     icon: List   },
  { to: '/gateway',        label: 'Gateway',  icon: Radio  },
  { to: '/fabric/sessions',label: 'Fabric',   icon: Zap    },
]

export default function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
    <header
      className="sticky top-0 z-40 w-full border-b border-zinc-800/80"
      style={{
        background: 'rgba(9, 9, 11, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center gap-6">

          {/* Brand */}
          <NavLink
            to="/"
            end
            className="flex items-center gap-2.5 shrink-0 group"
            aria-label="Source Assessment Tool home"
          >
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/15 transition-colors">
              <Database className="h-4 w-4 text-amber-400" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-zinc-100 leading-tight font-display tracking-tight">
                Source<span className="text-amber-400">SAT</span>
              </p>
              <p className="text-[10px] text-zinc-600 leading-tight tracking-wider uppercase">Assessment Tool</p>
            </div>
          </NavLink>

          {/* Nav */}
          <nav className="flex items-center gap-0.5 flex-1" aria-label="Main navigation">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
              onClick={() => navigate('/')}
              className="hidden md:flex"
            >
              New Assessment
            </Button>

            {/* User menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/60 transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">
                  {initials}
                </div>
                <ChevronDown className={`h-3.5 w-3.5 text-zinc-600 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 mt-1.5 w-56 rounded-xl border border-zinc-800 py-1 z-50"
                  style={{
                    background: 'rgba(24, 24, 27, 0.95)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
                  }}
                >
                  <div className="px-4 py-3 border-b border-zinc-800/80">
                    <p className="text-sm font-semibold text-zinc-200 truncate">
                      {user?.full_name || user?.email}
                    </p>
                    {user?.full_name && (
                      <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
                    )}
                    {user?.mfa_enabled && (
                      <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        <Shield className="h-3 w-3" /> MFA enabled
                      </span>
                    )}
                  </div>

                  {!user?.mfa_enabled && (
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/setup-mfa') }}
                      className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors"
                    >
                      <Shield className="h-4 w-4 text-amber-500/70" />
                      Enable MFA
                    </button>
                  )}

                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
