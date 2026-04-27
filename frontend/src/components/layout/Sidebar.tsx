import { NavLink, useNavigate } from 'react-router-dom'
import {
  Database, Layers, List, Network, Zap,
  PlusCircle, LogOut, Shield, ChevronDown,
  X, BarChart3, Sparkles,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

const NAV_GROUPS = [
  {
    label: 'SQL Server',
    color: 'violet',
    items: [
      { to: '/',                   label: 'New Assessment',    icon: PlusCircle, exact: true },
      { to: '/sessions',           label: 'Sessions',          icon: Layers  },
      { to: '/jobs',               label: 'Jobs',              icon: List    },
      { to: '/hybrid-connection',  label: 'Hybrid Connection', icon: Network },
    ],
  },
  {
    label: 'Microsoft Fabric',
    color: 'indigo',
    items: [
      { to: '/fabric/new',      label: 'New Fabric',  icon: Zap       },
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
          className="fixed inset-0 z-30 bg-slate-900/25 backdrop-blur-sm lg:hidden"
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
          bg-white border-r border-slate-200/60
          transition-transform duration-300 ease-out
          lg:translate-x-0 lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #FAFAFE 100%)',
          boxShadow: open
            ? '6px 0 40px rgba(124,58,237,0.08), 2px 0 8px rgba(0,0,0,0.04)'
            : '1px 0 0 0 rgba(226,232,240,0.7)',
        }}
        aria-label="Sidebar navigation"
      >
        {/* ── Logo ────────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between h-16 px-4 border-b border-slate-200/60 shrink-0"
          style={{ background: 'linear-gradient(180deg, rgba(245,243,255,0.6) 0%, rgba(255,255,255,0) 100%)' }}
        >
          <NavLink
            to="/"
            end
            className="flex items-center gap-3 group"
            aria-label="Source Assessment Tool home"
          >
            {/* Logo icon with violet gradient + animated pulse ring */}
            <div className="relative shrink-0">
              {/* Pulse ring */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100"
                style={{
                  background: 'rgba(124, 58, 237, 0.15)',
                  animation: 'pulseRing 2.4s ease-out infinite',
                  borderRadius: '12px',
                }}
                aria-hidden="true"
              />
              <div
                className="relative flex items-center justify-center h-9 w-9 rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                  boxShadow: '0 4px 12px rgba(124,58,237,0.30), inset 0 1px 0 rgba(255,255,255,0.20)',
                  transition: 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 220ms ease',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'scale(1.08) rotate(-3deg)'
                  el.style.boxShadow = '0 6px 20px rgba(124,58,237,0.44), inset 0 1px 0 rgba(255,255,255,0.20)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'scale(1) rotate(0deg)'
                  el.style.boxShadow = '0 4px 12px rgba(124,58,237,0.30), inset 0 1px 0 rgba(255,255,255,0.20)'
                }}
              >
                <Database className="h-4.5 w-4.5 text-white" aria-hidden="true" style={{ height: '18px', width: '18px' }} />
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight font-display tracking-tight">
                Source<span className="gradient-text">SAT</span>
              </p>
              <p className="text-[9px] text-slate-400 leading-tight tracking-widest uppercase mt-0.5">
                Assessment Tool
              </p>
            </div>
          </NavLink>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-violet-50 hover:text-violet-600
                       transition-colors focus-visible:ring-2 focus-visible:ring-violet-500/40"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Navigation ──────────────────────────────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto py-5 px-3 space-y-7"
          aria-label="Main navigation"
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {/* Section label with gradient accent */}
              <div className="flex items-center gap-2 px-2 mb-2.5">
                <div
                  className="h-1 w-1 rounded-full shrink-0"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}
                  aria-hidden="true"
                />
                <p className="section-title">{group.label}</p>
              </div>

              <ul className="space-y-0.5" role="list">
                {group.items.map(({ to, label, icon: Icon, exact }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={exact}
                      onClick={() => onClose()}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                         focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:outline-none
                         transition-all duration-150
                         ${isActive
                           ? 'text-violet-800 border border-violet-200/40 border-l-[2.5px] border-l-violet-500'
                           : 'text-slate-600 hover:text-slate-900 border border-transparent hover:bg-violet-50/60'
                         }`
                      }
                      style={({ isActive }) => ({
                        background: isActive
                          ? 'linear-gradient(90deg, rgba(124,58,237,0.10) 0%, rgba(99,102,241,0.04) 100%)'
                          : undefined,
                        boxShadow: isActive
                          ? 'var(--elevation-1), inset 0 1px 0 rgba(255,255,255,0.85), 0 0 0 1px rgba(124,58,237,0.04)'
                          : undefined,
                        paddingLeft: isActive ? 'calc(0.75rem - 1.5px)' : undefined,
                        transform: 'translateX(0)',
                        transition: 'transform 120ms cubic-bezier(0.4,0,0.2,1), background-color 120ms, color 120ms, box-shadow 120ms',
                      })}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement
                        if (!el.classList.contains('text-violet-800')) {
                          el.style.transform = 'translateX(2px)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement
                        el.style.transform = ''
                      }}
                      aria-current={undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={`h-4 w-4 shrink-0 transition-colors duration-120 ${
                              isActive ? 'text-violet-600' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="flex-1">{label}</span>
                          {isActive && (
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{
                                background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                                boxShadow: '0 0 6px rgba(124,58,237,0.50)',
                              }}
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

        {/* ── User footer ─────────────────────────────────────────────────── */}
        <div
          className="border-t border-slate-200/60 p-3 shrink-0"
          style={{ background: 'linear-gradient(0deg, rgba(245,243,255,0.5) 0%, rgba(255,255,255,0) 100%)' }}
        >
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                         hover:bg-violet-50/60 transition-all duration-150 group
                         focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:outline-none"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              {/* Gradient ring avatar */}
              <div className="relative shrink-0">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                    boxShadow: '0 2px 8px rgba(124,58,237,0.30)',
                  }}
                >
                  {initials}
                </div>
                {/* Online status dot */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white"
                  style={{ boxShadow: '0 0 6px rgba(5,150,105,0.50)' }}
                  aria-hidden="true"
                />
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
                className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-slate-200/80 bg-white py-1.5 z-50 overflow-hidden"
                style={{
                  boxShadow: '0 -8px 32px rgba(124,58,237,0.10), 0 -2px 8px rgba(0,0,0,0.06)',
                  animation: 'scaleIn 0.20s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transformOrigin: 'bottom center',
                }}
                role="menu"
              >
                {/* Top accent line */}
                <div
                  className="h-0.5 mx-3 mb-2 rounded-full"
                  style={{ background: 'linear-gradient(90deg, #7c3aed, #6366f1, #a78bfa)' }}
                  aria-hidden="true"
                />

                {user?.mfa_enabled ? (
                  <div className="px-4 py-2 mx-1.5 mb-1 rounded-xl bg-emerald-50 border border-emerald-100">
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                      <Shield className="h-3 w-3" aria-hidden="true" />
                      MFA enabled
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/setup-mfa') }}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-600
                               hover:text-violet-700 hover:bg-violet-50 transition-colors rounded-xl"
                    style={{ width: 'calc(100% - 12px)', marginLeft: '6px' }}
                    role="menuitem"
                  >
                    <Shield className="h-4 w-4 text-violet-500" aria-hidden="true" />
                    Enable MFA
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-600
                             hover:text-red-600 hover:bg-red-50 transition-colors rounded-xl mx-1.5"
                  style={{ width: 'calc(100% - 12px)', marginLeft: '6px' }}
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>

          {/* Bottom branding */}
          <div className="flex items-center justify-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100">
            <Sparkles className="h-2.5 w-2.5 text-violet-400" aria-hidden="true" />
            <span className="text-[9px] text-slate-300 tracking-widest uppercase font-medium">
              UBTI Intelligence
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
