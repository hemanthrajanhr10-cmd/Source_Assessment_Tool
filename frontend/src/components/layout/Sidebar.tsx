import { NavLink, useNavigate } from 'react-router-dom'
import {
  Database, Layers, List, Network, Zap,
  PlusCircle, LogOut, Shield, ChevronDown,
  X, BarChart3, Sparkles, LayoutDashboard, Combine,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

// Tri-element nav groups: ember = brand/action, tide = connectivity/data, grove = fabric/success
const NAV_GROUPS = [
  {
    label: 'Unified Assessment',
    element: 'ember',
    dotGradient:      'linear-gradient(135deg, #B83510, #F5714A)',
    activeBg:         'rgba(184,53,16,0.07)',
    activeText:       '#91240A',
    activeBorder:     'rgba(255,160,124,0.35)',
    activeIconColor:  '#B83510',
    activeDotGlow:    'rgba(184,53,16,0.45)',
    hoverBg:          'rgba(255,244,239,0.6)',
    items: [
      { to: '/unified/new',      label: 'New Assessment', icon: Combine,         exact: true },
      { to: '/unified/sessions', label: 'All Reports',    icon: LayoutDashboard },
    ],
  },
  {
    label: 'SQL Server',
    element: 'tide',
    dotGradient:      'linear-gradient(135deg, #0A6678, #1298B2)',
    activeBg:         'rgba(13,127,151,0.07)',
    activeText:       '#084E5B',
    activeBorder:     'rgba(65,183,205,0.35)',
    activeIconColor:  '#0D7F97',
    activeDotGlow:    'rgba(13,127,151,0.45)',
    hoverBg:          'rgba(237,248,250,0.6)',
    items: [
      { to: '/',                   label: 'Source Only',       icon: PlusCircle, exact: true },
      { to: '/sessions',           label: 'Sessions',          icon: Layers  },
      { to: '/jobs',               label: 'Jobs',              icon: List    },
      { to: '/hybrid-connection',  label: 'Hybrid Connection', icon: Network },
    ],
  },
  {
    label: 'Microsoft Fabric',
    element: 'grove',
    dotGradient:      'linear-gradient(135deg, #136137, #1E9657)',
    activeBg:         'rgba(23,123,68,0.07)',
    activeText:       '#0D4928',
    activeBorder:     'rgba(66,180,114,0.35)',
    activeIconColor:  '#177B44',
    activeDotGlow:    'rgba(23,123,68,0.45)',
    hoverBg:          'rgba(237,249,240,0.6)',
    items: [
      { to: '/fabric/new',      label: 'Fabric Only',  icon: Zap       },
      { to: '/fabric/sessions', label: 'Assessments',  icon: BarChart3 },
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
          background: 'linear-gradient(180deg, #ffffff 0%, #F5F7F9 100%)',
          boxShadow: open
            ? '6px 0 40px rgba(184,53,16,0.06), 2px 0 8px rgba(0,0,0,0.04)'
            : '1px 0 0 0 rgba(205,208,220,0.7)',
        }}
        aria-label="Sidebar navigation"
      >
        {/* ── Logo ────────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between h-16 px-4 border-b border-slate-200/60 shrink-0"
          style={{ background: 'linear-gradient(180deg, rgba(243,245,247,0.6) 0%, rgba(255,255,255,0) 100%)' }}
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
                  background: 'rgba(125, 74, 32, 0.12)',
                  animation: 'pulseRing 2.4s ease-out infinite',
                  borderRadius: '12px',
                }}
                aria-hidden="true"
              />
              <div
                className="relative flex items-center justify-center h-9 w-9 rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #B83510 0%, #DE4A1F 100%)',
                  boxShadow: '0 4px 12px rgba(184,53,16,0.28), inset 0 1px 0 rgba(255,255,255,0.20)',
                  transition: 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 220ms ease',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'scale(1.08) rotate(-3deg)'
                  el.style.boxShadow = '0 6px 20px rgba(184,53,16,0.40), inset 0 1px 0 rgba(255,255,255,0.20)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'scale(1) rotate(0deg)'
                  el.style.boxShadow = '0 4px 12px rgba(184,53,16,0.28), inset 0 1px 0 rgba(255,255,255,0.20)'
                }}
              >
                <Database className="h-4.5 w-4.5 text-white" aria-hidden="true" style={{ height: '18px', width: '18px' }} />
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight font-display tracking-tight">
                Source<span className="font-extrabold" style={{ color: '#B83510' }}>SAT</span>
              </p>
              <p className="text-[9px] text-slate-400 leading-tight tracking-widest uppercase mt-0.5">
                Assessment Tool
              </p>
            </div>
          </NavLink>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 transition-colors focus-visible:ring-2"
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.backgroundColor = 'rgba(255,244,239,0.8)'; el.style.color = '#B83510' }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.backgroundColor = ''; el.style.color = '' }}
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
              {/* Section label with per-element dot */}
              <div className="flex items-center gap-2 px-2 mb-2.5">
                <div
                  className="h-1 w-1 rounded-full shrink-0"
                  style={{ background: group.dotGradient }}
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
                        `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                         focus-visible:ring-2 focus-visible:outline-none
                         transition-all duration-150
                         ${isActive
                           ? 'font-semibold border'
                           : 'font-medium text-slate-600 hover:text-slate-900 border border-transparent'
                         }`
                      }
                      style={({ isActive }) => ({
                        ...(isActive ? {
                          background: group.activeBg,
                          color: group.activeText,
                          borderColor: group.activeBorder,
                        } : {}),
                        boxShadow: isActive ? 'var(--elevation-1)' : undefined,
                        transform: 'translateX(0)',
                        transition: 'transform 120ms cubic-bezier(0.4,0,0.2,1), background-color 120ms, color 120ms',
                      })}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement
                        if (!el.getAttribute('aria-current')) {
                          el.style.transform = 'translateX(2px)'
                          el.style.backgroundColor = group.hoverBg
                        }
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement
                        el.style.transform = ''
                        if (!el.getAttribute('aria-current')) el.style.backgroundColor = ''
                      }}
                      aria-current={undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className="h-4 w-4 shrink-0 transition-colors duration-120 text-slate-400"
                            style={isActive ? { color: group.activeIconColor } : {}}
                            aria-hidden="true"
                          />
                          <span className="flex-1">{label}</span>
                          {isActive && (
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{
                                background: group.dotGradient,
                                boxShadow: `0 0 6px ${group.activeDotGlow}`,
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
          style={{ background: 'linear-gradient(0deg, rgba(243,245,247,0.5) 0%, rgba(255,255,255,0) 100%)' }}
        >
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                         transition-all duration-150 group
                         focus-visible:ring-2 focus-visible:outline-none"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(243,245,247,0.8)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '' }}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              {/* Gradient ring avatar */}
              <div className="relative shrink-0">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg, #B83510 0%, #DE4A1F 100%)',
                    boxShadow: '0 2px 8px rgba(184,53,16,0.28)',
                  }}
                >
                  {initials}
                </div>
                {/* Online status dot */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-earth-500 border-2 border-white"
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
                  boxShadow: '0 -8px 32px rgba(184,53,16,0.06), 0 -2px 8px rgba(0,0,0,0.06)',
                  animation: 'scaleIn 0.20s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transformOrigin: 'bottom center',
                }}
                role="menu"
              >
                {/* Top accent line */}
                <div
                  className="h-0.5 mx-3 mb-2 rounded-full"
                  style={{ background: 'linear-gradient(90deg, #B83510, #0D7F97, #177B44)' }}
                  aria-hidden="true"
                />

                {user?.mfa_enabled ? (
                  <div className="px-4 py-2 mx-1.5 mb-1 rounded-xl bg-grove-50 border border-grove-100">
                    <span className="inline-flex items-center gap-1.5 text-xs text-grove-700 font-medium">
                      <Shield className="h-3 w-3" aria-hidden="true" />
                      MFA enabled
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/setup-mfa') }}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-600
                               transition-colors rounded-xl"
                    style={{ width: 'calc(100% - 12px)', marginLeft: '6px' }}
                    onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = '#91240A'; el.style.backgroundColor = 'rgba(255,244,239,0.8)' }}
                    onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = ''; el.style.backgroundColor = '' }}
                    role="menuitem"
                  >
                    <Shield className="h-4 w-4" style={{ color: '#B83510' }} aria-hidden="true" />
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
            <Sparkles className="h-2.5 w-2.5" style={{ color: '#0D7F97' }} aria-hidden="true" />
            <span className="text-[9px] text-slate-300 tracking-widest uppercase font-medium">
              UBTI Intelligence
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
