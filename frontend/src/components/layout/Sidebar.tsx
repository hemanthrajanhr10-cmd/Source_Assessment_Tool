import { NavLink, useNavigate } from 'react-router-dom'
import {
  Database, Layers, List, Network, Zap,
  PlusCircle, LogOut, Shield, ChevronDown,
  X, BarChart3,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

const NAV_GROUPS = [
  {
    label: 'SQL Server',
    items: [
      { to: '/',                   label: 'New Assessment',    icon: PlusCircle, exact: true },
      { to: '/sessions',           label: 'Sessions',          icon: Layers  },
      { to: '/jobs',               label: 'Jobs',              icon: List    },
      { to: '/hybrid-connection',  label: 'Hybrid Connection', icon: Network },
    ],
  },
  {
    label: 'Microsoft Fabric',
    items: [
      { to: '/fabric/new',      label: 'New Fabric',  icon: Zap      },
      { to: '/fabric/sessions', label: 'Assessments', icon: BarChart3 },
    ],
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
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
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          onKeyDown={(e) => (e.key === 'Escape' || e.key === 'Enter') && onClose()}
          role="button"
          tabIndex={-1}
          aria-label="Close navigation"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col w-60 bg-white
          border-r border-slate-200
          transition-transform duration-300 ease-out
          lg:translate-x-0 lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ boxShadow: open ? '4px 0 24px rgba(0,0,0,0.08)' : 'none' }}
        aria-label="Sidebar navigation"
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200 shrink-0">
          <NavLink
            to="/"
            end
            className="flex items-center gap-2.5 group"
            aria-label="Source Assessment Tool home"
          >
            <div
              className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-transform duration-200 group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.06) 100%)',
                border: '1.5px solid rgba(245,158,11,0.3)',
              }}
            >
              <Database className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight font-display tracking-tight">
                Source<span className="text-amber-500">SAT</span>
              </p>
              <p className="text-[9px] text-slate-400 leading-tight tracking-wider uppercase">Assessment Tool</p>
            </div>
          </NavLink>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6" aria-label="Main navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="section-title px-2 mb-2">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon, exact }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={exact}
                      onClick={() => onClose()}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                          isActive
                            ? 'bg-amber-50 text-amber-800 border border-amber-200/60'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                        }`
                      }
                      aria-current={undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                          <span>{label}</span>
                          {isActive && (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-200 p-3 shrink-0">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100 transition-colors group"
              aria-expanded={menuOpen}
            >
              <div
                className="h-7 w-7 rounded-full text-amber-600 bg-amber-50 border border-amber-200 text-xs font-bold flex items-center justify-center shrink-0"
              >
                {initials}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">
                  {user?.full_name || user?.email}
                </p>
                {user?.full_name && (
                  <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                )}
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl border border-slate-200 bg-white py-1 z-50 animate-scale-in origin-bottom"
                style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)' }}
              >
                {user?.mfa_enabled ? (
                  <div className="px-4 py-2 border-b border-slate-100">
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <Shield className="h-3 w-3" /> MFA enabled
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/setup-mfa') }}
                    className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                  >
                    <Shield className="h-4 w-4 text-amber-500" />
                    Enable MFA
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
