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
          className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-sm lg:hidden"
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
          fixed inset-y-0 left-0 z-40 flex flex-col w-60
          bg-white border-r border-slate-200/80
          transition-transform duration-300 ease-out
          lg:translate-x-0 lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          boxShadow: open
            ? '4px 0 32px rgba(0,0,0,0.06), 2px 0 8px rgba(0,0,0,0.04)'
            : 'var(--elevation-1)',
        }}
        aria-label="Sidebar navigation"
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between h-16 px-4 border-b border-slate-200/80 shrink-0"
          style={{ background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)' }}
        >
          <NavLink
            to="/"
            end
            className="flex items-center gap-2.5 group"
            aria-label="Source Assessment Tool home"
          >
            <div
              className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.07) 100%)',
                border: '1.5px solid rgba(245,158,11,0.28)',
                boxShadow: 'var(--elevation-1), inset 0 1px 0 rgba(255,255,255,0.9)',
                transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement
                el.style.transform = 'scale(1.08) rotate(-2deg)'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement
                el.style.transform = 'scale(1) rotate(0deg)'
              }}
            >
              <Database className="h-4 w-4 text-amber-500" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight font-display tracking-tight">
                Source<span className="text-amber-500">SAT</span>
              </p>
              <p className="text-[9px] text-slate-400 leading-tight tracking-wider uppercase">
                Assessment Tool
              </p>
            </div>
          </NavLink>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600
                       transition-colors focus-visible:ring-2 focus-visible:ring-amber-500/40"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 overflow-y-auto py-4 px-3 space-y-6"
          aria-label="Main navigation"
        >
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
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                         focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:outline-none
                         ${isActive
                           ? 'text-amber-800 border border-amber-200/70'
                           : 'text-slate-600 hover:text-slate-900 border border-transparent'
                         }`
                      }
                      style={({ isActive }) => ({
                        background: isActive
                          ? 'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0.04) 100%)'
                          : undefined,
                        boxShadow: isActive
                          ? 'var(--elevation-1), inset 0 1px 0 rgba(255,255,255,0.8)'
                          : undefined,
                        transition: 'transform 120ms cubic-bezier(0.4,0,0.2,1), background-color 120ms, color 120ms',
                      })}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement
                        if (!el.classList.contains('text-amber-800')) {
                          el.style.transform = 'translateX(2px)'
                          el.style.background = 'rgb(241 245 249)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement
                        if (!el.classList.contains('text-amber-800')) {
                          el.style.transform = ''
                          el.style.background = ''
                        }
                      }}
                      aria-current={undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={`h-4 w-4 shrink-0 transition-colors ${
                              isActive ? 'text-amber-600' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span>{label}</span>
                          {isActive && (
                            <span
                              className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
                              aria-hidden="true"
                            />
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
        <div
          className="border-t border-slate-200/80 p-3 shrink-0"
          style={{ background: 'linear-gradient(0deg, #fafbfc 0%, #ffffff 100%)' }}
        >
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                         hover:bg-slate-100 transition-colors group
                         focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:outline-none"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <div
                className="h-7 w-7 rounded-full text-amber-700 bg-amber-50 border border-amber-200
                           text-xs font-bold flex items-center justify-center shrink-0"
                style={{ boxShadow: 'var(--elevation-1)' }}
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
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                  menuOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {menuOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl border border-slate-200 bg-white py-1 z-50"
                style={{
                  boxShadow: 'var(--elevation-5)',
                  animation: 'scaleIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transformOrigin: 'bottom center',
                }}
                role="menu"
              >
                {user?.mfa_enabled ? (
                  <div className="px-4 py-2 border-b border-slate-100">
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50
                                     border border-emerald-200 px-2 py-0.5 rounded-full">
                      <Shield className="h-3 w-3" aria-hidden="true" /> MFA enabled
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/setup-mfa') }}
                    className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-600
                               hover:text-slate-900 hover:bg-slate-50 transition-colors"
                    role="menuitem"
                  >
                    <Shield className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    Enable MFA
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-600
                             hover:text-red-600 hover:bg-red-50 transition-colors"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
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
